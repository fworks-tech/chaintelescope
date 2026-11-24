import type { Snapshot, TimeWindow } from "@chaintelescope/shared";
import { ProviderChainExhaustedError } from "../errors/index.js";
import type { MarketProvider } from "./provider.js";

export interface ChainLogger {
  warn(obj: unknown, msg?: string): void;
}

export interface MarketChainOptions {
  readonly timeoutMs: number;
}

function withTimeout(
  signal: AbortSignal,
  timeoutMs: number,
): {
  signal: AbortSignal;
  cleanup: () => void;
} {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new Error(`market provider timeout after ${timeoutMs}ms`));
  }, timeoutMs);
  timer.unref?.();

  const onAbort = () => {
    controller.abort(signal.reason);
  };
  if (signal.aborted) {
    onAbort();
  } else {
    signal.addEventListener("abort", onAbort, { once: true });
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
    },
  };
}

function timeoutPromise(
  ms: number,
  signal: AbortSignal,
): {
  promise: Promise<never>;
  cleanup: () => void;
} {
  let reject!: (reason: unknown) => void;
  const promise = new Promise<never>((_, rej) => {
    reject = rej;
  });
  const timer = setTimeout(() => {
    reject(new Error(`market provider timeout after ${ms}ms`));
  }, ms);
  timer.unref?.();
  const onAbort = () => reject(signal.reason);
  if (signal.aborted) onAbort();
  else signal.addEventListener("abort", onAbort, { once: true });
  return {
    promise,
    cleanup: () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
    },
  };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function assertValidSnapshot(
  snapshot: Snapshot,
  symbols: readonly string[],
  window: TimeWindow,
  providerId: MarketProvider["id"],
): void {
  if (snapshot.window !== window) {
    throw new Error(
      `provider ${providerId} returned window ${snapshot.window}`,
    );
  }
  if (!Array.isArray(snapshot.series)) {
    throw new Error(`provider ${providerId} returned invalid series`);
  }
  for (const symbol of symbols) {
    const series = snapshot.series.find((s) => s.asset === symbol);
    if (!series)
      throw new Error(`provider ${providerId} missing series for ${symbol}`);
    if (series.source !== providerId) {
      throw new Error(
        `provider ${providerId} returned source ${series.source} for ${symbol}`,
      );
    }
    const { dates, prices, trend } = series;
    if (
      !Array.isArray(dates) ||
      !Array.isArray(prices) ||
      !Array.isArray(trend)
    ) {
      throw new Error(
        `provider ${providerId} returned malformed arrays for ${symbol}`,
      );
    }
    if (dates.length === 0 || prices.length === 0 || trend.length === 0) {
      throw new Error(
        `provider ${providerId} returned empty series for ${symbol}`,
      );
    }
    if (dates.length !== prices.length || dates.length !== trend.length) {
      throw new Error(
        `provider ${providerId} returned misaligned series for ${symbol}`,
      );
    }
    for (let i = 0; i < dates.length; i++) {
      const date = dates[i];
      if (typeof date !== "string" || Number.isNaN(Date.parse(date))) {
        throw new Error(
          `provider ${providerId} returned invalid date for ${symbol}`,
        );
      }
      if (!isFiniteNumber(prices[i]) || !isFiniteNumber(trend[i])) {
        throw new Error(
          `provider ${providerId} returned non-finite value for ${symbol}`,
        );
      }
    }
  }
}

export interface ProviderMetrics {
  calls: number;
  errors: number;
  totalLatencyMs: number;
  cacheHits: number;
}

const CACHE_TTL_MS = 60_000;
const snapshotCache = new Map<string, { expires: number; snapshot: Snapshot }>();
const providerMetrics = new Map<string, ProviderMetrics>();

function cacheKey(
  providers: readonly MarketProvider[],
  symbols: readonly string[],
  window: TimeWindow,
): string {
  return `${providers.map((p) => p.id).join("+")}|${[...symbols].join(",")}|${window}`;
}

function recordCall(id: string, latencyMs: number, failed: boolean): void {
  const m = providerMetrics.get(id) ?? {
    calls: 0,
    errors: 0,
    totalLatencyMs: 0,
    cacheHits: 0,
  };
  m.calls += 1;
  m.totalLatencyMs += latencyMs;
  if (failed) m.errors += 1;
  providerMetrics.set(id, m);
}

export function getMarketMetrics(): Record<string, ProviderMetrics> {
  return Object.fromEntries(providerMetrics);
}

export function resetMarketMetrics(): void {
  providerMetrics.clear();
}

export function clearMarketCache(): void {
  snapshotCache.clear();
}

export const createMarketChain = (
  providers: readonly MarketProvider[],
  logger: ChainLogger,
  options: MarketChainOptions,
) => {
  // Partial-failure semantics (#177): a provider either serves the whole
  // requested symbol set or fails it; one bad asset fails that provider's
  // snapshot and the chain falls through to the next provider. No partial
  // snapshots with per-asset errors are returned.
  return async (
    symbols: readonly string[],
    window: TimeWindow,
    signal: AbortSignal,
  ): Promise<Snapshot> => {
    if (signal.aborted) throw signal.reason;
    const key = cacheKey(providers, symbols, window);
    const hit = snapshotCache.get(key);
    if (hit && hit.expires > Date.now() && !signal.aborted) {
      const m =
        providerMetrics.get(hit.snapshot.provider) ??
        { calls: 0, errors: 0, totalLatencyMs: 0, cacheHits: 0 };
      m.cacheHits += 1;
      providerMetrics.set(hit.snapshot.provider, m);
      return hit.snapshot;
    }
    for (const provider of providers) {
      const scoped = withTimeout(signal, options.timeoutMs);
      const timeout = timeoutPromise(options.timeoutMs, signal);
      const pending = provider.fetchSnapshot(symbols, window, scoped.signal);
      // The provider may ignore the signal; keep the race winner and silence the loser.
      void pending.catch(() => undefined);
      const start = Date.now();
      try {
        const snapshot = await Promise.race([pending, timeout.promise]);
        assertValidSnapshot(snapshot, symbols, window, provider.id);
        const finalSnapshot = { ...snapshot, provider: provider.id };
        recordCall(provider.id, Date.now() - start, false);
        // Cache successful snapshots only; failures never populate (#172).
        if (finalSnapshot.provider !== "mock") {
          snapshotCache.set(key, {
            expires: Date.now() + CACHE_TTL_MS,
            snapshot: finalSnapshot,
          });
        }
        return finalSnapshot;
      } catch (error) {
        recordCall(provider.id, Date.now() - start, true);
        if (signal.aborted) throw error;
        logger.warn(
          { err: error, provider: provider.id, symbols, window },
          "market provider failed",
        );
      } finally {
        scoped.cleanup();
        timeout.cleanup();
      }
    }

    throw new ProviderChainExhaustedError();
  };
};
