import {
  type MarketProviderSelection,
  type PriceTrend,
  type TimeWindow,
} from "@chaintelescope/shared";
import { ProviderChainExhaustedError, isDomainError } from "../errors/index.js";
import { createMarketChain } from "./chain.js";
import type { MarketProvider } from "./provider.js";
import { buildMockSeries, rollingMean } from "./utils.js";

export interface PriceTrendLogger {
  warn(obj: unknown, msg?: string): void;
}

export interface FetchPriceTrendOptions {
  readonly now?: () => Date;
  /** Python service falls back to mock on total failure; #138 AC wants 503. */
  readonly onExhausted?: "mock" | "throw";
  readonly timeoutMs?: number;
}

const EXCHANGE_IDS = ["binance", "coingecko", "coinbase"] as const;

function providerChain(
  selection: MarketProviderSelection,
  providers: readonly MarketProvider[],
): MarketProvider[] {
  const byId = new Map(providers.map((p) => [p.id, p]));
  if (selection === "mock") return [];
  if (selection !== "auto") {
    const p = byId.get(selection);
    return p ? [p] : [];
  }
  return EXCHANGE_IDS.map((id) => byId.get(id)).filter(
    (p): p is MarketProvider => p !== undefined,
  );
}

function normalizeDates(dates: readonly (string | number | Date)[]): string[] {
  return dates.map((value) => {
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) {
      throw new Error(`invalid market date: ${String(value)}`);
    }
    return d.toISOString();
  });
}

function mockTrend(
  asset: string,
  timeWindow: TimeWindow,
  now: Date,
): PriceTrend {
  const series = buildMockSeries(asset, timeWindow, "mock", now);
  return {
    asset,
    dates: [...series.dates],
    prices: [...series.prices],
    trend: [...series.trend],
    source: "mock",
  };
}

export async function fetchPriceTrend(
  asset: string,
  // shortcut: days is accepted for Python /api/price-trend parity but the
  // Node chain sizes series by timeWindow; align days/window semantics later.
  days: number,
  timeWindow: TimeWindow,
  marketSource: MarketProviderSelection,
  providers: readonly MarketProvider[],
  logger: PriceTrendLogger,
  signal: AbortSignal,
  options: FetchPriceTrendOptions = {},
): Promise<PriceTrend> {
  const now = options.now ?? (() => new Date());
  const onExhausted = options.onExhausted ?? "throw";

  if (marketSource === "mock") {
    return mockTrend(asset, timeWindow, now());
  }

  const chainProviders = providerChain(marketSource, providers);
  const timeoutMs = options.timeoutMs ?? 10_000;
  const chain = createMarketChain(chainProviders, logger, { timeoutMs });

  try {
    const snapshot = await chain([asset], timeWindow, signal);
    const series = snapshot.series.find((s) => s.asset === asset);
    if (!series || series.prices.length === 0) {
      throw new Error(`market provider returned no series for ${asset}`);
    }
    const dates = normalizeDates(
      series.dates as readonly (string | number | Date)[],
    );
    const prices = [...series.prices];
    if (dates.length !== prices.length) {
      throw new Error(
        `market provider returned misaligned series for ${asset}`,
      );
    }
    return {
      asset,
      dates,
      prices,
      trend: rollingMean(prices, 5),
      source: series.source ?? snapshot.provider,
    };
  } catch (error) {
    if (signal.aborted) throw error;
    const exhausted =
      error instanceof ProviderChainExhaustedError ||
      (isDomainError(error) && error.code === "provider_chain_exhausted");
    if (!exhausted) throw error;
  }

  if (onExhausted === "mock") {
    return mockTrend(asset, timeWindow, now());
  }
  throw new ProviderChainExhaustedError();
}
