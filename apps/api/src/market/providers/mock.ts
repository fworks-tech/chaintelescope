import {
  TIME_WINDOW_DAYS,
  type MarketProviderId,
  type MarketSeries,
  type Snapshot,
  type TimeWindow,
} from "@chaintelescope/shared";
import type { MarketProvider } from "../provider.js";

const BASE_PRICE_OVERRIDES: Record<string, number> = {
  BTC: 64000,
  ETH: 3200,
  SOL: 145,
  BNB: 580,
  XRP: 0.62,
};

const WATCHLIST = [
  "BTC", "ETH", "USDT", "BNB", "SOL", "XRP", "USDC", "ADA", "DOGE", "TRX",
  "AVAX", "LINK", "TON", "SHIB", "DOT", "POL", "BCH", "DAI", "LTC", "UNI",
  "ICP", "NEAR", "LEO", "APT", "FET", "ETC", "RENDER", "BONK", "PEPE", "KAS",
  "FIL", "CRO", "ARB", "STX", "XLM", "SUI", "OKB", "MNT", "IMX", "WIF",
  "OP", "INJ", "HBAR", "TIA", "FTM", "RUNE", "ATOM", "MKR", "SEI", "GRT",
  "THETA", "AAVE", "ALGO", "AR", "BGB", "EGLD", "SAND", "AXS", "ENS", "FLOW",
  "SNX", "XTZ", "MANA", "NEO", "KCS", "CHZ", "IOTA", "CAKE", "MINA", "PYTH",
  "QNT", "TAO", "JASMY", "GALA", "LDO", "COMP", "1INCH", "RAY", "CRV", "STRK",
  "GNO", "ZEC", "DYDX", "GLM", "EOS", "BSV", "BAT", "ZIL", "ENJ", "KAVA",
  "LRC", "APE", "ROSE", "CELO", "DASH", "PENDLE", "CKB", "TWT", "BLUR", "IOTX",
];

function assetIndex(asset: string): number {
  const idx = WATCHLIST.indexOf(asset);
  if (idx >= 0) return idx;
  return [...asset].reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
}

function basePrice(asset: string): number {
  if (asset in BASE_PRICE_OVERRIDES) return BASE_PRICE_OVERRIDES[asset]!;
  const index = assetIndex(asset);
  const raw = 0.05 + (index + 1) * 1.37 + (asset.charCodeAt(0) % 17) * 0.91;
  return Math.round(raw * 10000) / 10000;
}

function rollingMean(values: readonly number[], window: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - window + 1);
    const slice = values.slice(start, i + 1);
    out.push(slice.reduce((a, b) => a + b, 0) / slice.length);
  }
  return out;
}

function seriesFor(
  asset: string,
  window: TimeWindow,
  source: MarketProviderId,
  now: Date,
): MarketSeries {
  const days = TIME_WINDOW_DAYS[window];
  const base = basePrice(asset);
  const today = new Date(now);
  today.setUTCHours(0, 0, 0, 0);
  const dates: string[] = [];
  const prices: number[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - (days - 1 - i));
    dates.push(d.toISOString());
    prices.push(base + 1200 * Math.sin(i / 3) + i * (base * 0.0007));
  }
  return {
    asset,
    dates,
    prices,
    trend: rollingMean(prices, 5),
    source,
  };
}

export interface MockMarketProviderOptions {
  readonly now?: () => Date;
}

export class MockMarketProvider implements MarketProvider {
  readonly id: MarketProviderId = "mock";
  private readonly now: () => Date;

  constructor(options: MockMarketProviderOptions = {}) {
    this.now = options.now ?? (() => new Date());
  }

  async fetchSnapshot(
    symbols: readonly string[],
    window: TimeWindow,
    signal: AbortSignal,
  ): Promise<Snapshot> {
    if (signal.aborted) throw signal.reason ?? new Error("aborted");
    const series = symbols.map((asset) => seriesFor(asset, window, this.id, this.now()));
    return { series, window, provider: this.id };
  }
}
