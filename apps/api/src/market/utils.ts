import {
  ASSET_SYMBOLS,
  TIME_WINDOW_DAYS,
  type MarketProviderId,
  type MarketSeries,
  type TimeWindow,
} from "@chaintelescope/shared";

export const WATCHLIST: readonly string[] = ASSET_SYMBOLS;

const BASE_PRICE_OVERRIDES: Record<string, number> = {
  BTC: 64000,
  ETH: 3200,
  SOL: 145,
  BNB: 580,
  XRP: 0.62,
};

export function basePrice(asset: string): number {
  if (Object.hasOwn(BASE_PRICE_OVERRIDES, asset))
    return BASE_PRICE_OVERRIDES[asset]!;
  const idx = WATCHLIST.indexOf(asset);
  const index =
    idx >= 0 ? idx : [...asset].reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  const raw = 0.05 + (index + 1) * 1.37 + (asset.charCodeAt(0) % 17) * 0.91;
  return Math.round(raw * 10000) / 10000;
}

export function rollingMean(
  values: readonly number[],
  window: number,
): number[] {
  const out: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - window + 1);
    let sum = 0;
    for (let j = start; j <= i; j++) sum += values[j]!;
    out.push(sum / (i - start + 1));
  }
  return out;
}

export function windowDays(window: TimeWindow): number {
  return TIME_WINDOW_DAYS[window];
}

export function buildSeries(
  asset: string,
  dates: readonly string[],
  prices: readonly number[],
  source: MarketProviderId,
): MarketSeries {
  return { asset, dates, prices, trend: rollingMean(prices, 5), source };
}

export function buildMockSeries(
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
  return buildSeries(asset, dates, prices, source);
}
