export const TIME_WINDOWS = ["24H", "7D", "30D", "90D"] as const;
export type TimeWindow = (typeof TIME_WINDOWS)[number];

export const TIME_WINDOW_DAYS: Record<TimeWindow, number> = {
  "24H": 1,
  "7D": 7,
  "30D": 30,
  "90D": 90,
};

export const MARKET_PROVIDER_IDS = [
  "binance",
  "coingecko",
  "coinbase",
  "mock",
] as const;
export type MarketProviderId = (typeof MARKET_PROVIDER_IDS)[number];

export type MarketProviderSelection = MarketProviderId | "auto";

export interface MarketSeries {
  readonly asset: string;
  readonly dates: readonly string[];
  readonly prices: readonly number[];
  readonly trend: readonly number[];
  readonly source: MarketProviderId;
}

/** Normalised market snapshot returned by provider chain (#138). */
export interface Snapshot {
  readonly series: readonly MarketSeries[];
  readonly window: TimeWindow;
  readonly provider: MarketProviderId;
}

/** Single-asset price trend shape, parity with Python /api/price-trend. */
export interface PriceTrend {
  readonly asset: string;
  readonly dates: readonly string[];
  readonly prices: readonly number[];
  readonly trend: readonly number[];
  readonly source: MarketProviderId;
}
