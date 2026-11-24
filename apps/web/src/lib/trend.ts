import type { PriceTrend, TimeWindow } from "@chaintelescope/shared";
import { TIME_WINDOW_DAYS } from "@chaintelescope/shared";

export interface TrendPoint {
  readonly date: string;
  readonly price: number;
  readonly trend: number;
}

const shortDateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
const longDateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

export function toPoints(data: PriceTrend): TrendPoint[] {
  return data.prices.map((price, i) => ({
    date: (data.dates[i] ?? "").slice(0, 10),
    price,
    trend: data.trend[i] ?? price,
  }));
}

/** "2026-10-26" → "Oct 26"; anything unparseable passes through untouched. */
export function shortDate(value: string): string {
  if (!value) return value;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? value : shortDateFormat.format(parsed);
}

/** "2026-10-26" → "Oct 26, 2026"; "" in, "" out. */
export function longDate(value: string): string {
  if (!value) return "";
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? "" : longDateFormat.format(parsed);
}

/** Standard deviation of daily percentage returns, in percent. */
export function dailyVolatility(prices: readonly number[]): number {
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i += 1) {
    const prev = prices[i - 1] ?? 0;
    const next = prices[i] ?? 0;
    if (prev && next) returns.push((next - prev) / prev);
  }
  if (returns.length < 2) return 0;
  const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  const variance =
    returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (returns.length - 1);
  return Math.sqrt(variance) * 100;
}

export interface TrendSummary {
  readonly count: number;
  readonly last: number;
  readonly change: number;
  readonly isUp: boolean;
  readonly high: number;
  readonly low: number;
  readonly highDate: string;
  readonly lowDate: string;
  readonly lastDate: string;
  readonly average: number;
  readonly volatility: number;
  readonly rangePct: number;
}

/**
 * All derived numbers for the dashboard, single pass (no spread into
 * Math.max — the arg limit turns into a RangeError on long series).
 * Empty input yields zeros and "" dates, never NaN or -Infinity.
 */
export function summarizeTrend(
  prices: readonly number[],
  points: readonly TrendPoint[],
): TrendSummary {
  const count = prices.length;
  const first = prices[0] ?? 0;
  const last = prices[count - 1] ?? 0;
  const change = first === 0 ? 0 : ((last - first) / first) * 100;
  let high = 0;
  let low = 0;
  let highIdx = -1;
  let lowIdx = -1;
  let sum = 0;
  for (let i = 0; i < count; i += 1) {
    const price = prices[i] ?? 0;
    sum += price;
    if (highIdx === -1 || price > high) {
      high = price;
      highIdx = i;
    }
    if (lowIdx === -1 || price < low) {
      low = price;
      lowIdx = i;
    }
  }
  return {
    count,
    last,
    change,
    isUp: change >= 0,
    high,
    low,
    highDate: points[highIdx]?.date ?? "",
    lowDate: points[lowIdx]?.date ?? "",
    lastDate: points[count - 1]?.date ?? "",
    average: count > 0 ? sum / count : 0,
    volatility: dailyVolatility(prices),
    rangePct: low === 0 ? 0 : ((high - low) / low) * 100,
  };
}

/** "30D" → 30 (days), via the shared window map both sides already honor. */
export function windowDays(window: TimeWindow): number {
  return TIME_WINDOW_DAYS[window];
}
