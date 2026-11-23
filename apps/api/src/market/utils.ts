import { TIME_WINDOW_DAYS, type MarketSeries, type MarketProviderId, type TimeWindow } from "@chaintelescope/shared";

export function rollingMean(values: readonly number[], window: number): number[] {
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
