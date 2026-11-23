import type { Snapshot, TimeWindow } from "@chaintelescope/shared";
import { ProviderChainExhaustedError } from "../errors/index.js";
import type { MarketProvider } from "./provider.js";

export interface ChainLogger {
  warn(obj: unknown, msg?: string): void;
}

export interface MarketChainOptions {
  readonly timeoutMs: number;
}

function withTimeout(signal: AbortSignal, timeoutMs: number): {
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

function timeoutPromise(ms: number, signal: AbortSignal): {
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

export const createMarketChain = (
  providers: readonly MarketProvider[],
  logger: ChainLogger,
  options: MarketChainOptions,
) => {
  return async (
    symbols: readonly string[],
    window: TimeWindow,
    signal: AbortSignal,
  ): Promise<Snapshot> => {
    for (const provider of providers) {
      const scoped = withTimeout(signal, options.timeoutMs);
      const timeout = timeoutPromise(options.timeoutMs, signal);
      const pending = provider.fetchSnapshot(symbols, window, scoped.signal);
      // The provider may ignore the signal; keep the race winner and silence the loser.
      void pending.catch(() => undefined);
      try {
        const snapshot = await Promise.race([pending, timeout.promise]);
        return { ...snapshot, provider: provider.id };
      } catch (error) {
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
