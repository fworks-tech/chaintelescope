import type { PriceTrend, TimeWindow } from "@chaintelescope/shared/market";
import { TIME_WINDOW_DAYS } from "@chaintelescope/shared/market";

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
  // Clamp to the shortest array: silently echoing price-as-trend or "" dates
  // renders a plausible-but-wrong chart, worse than fewer points.
  const len = Math.min(data.prices.length, data.dates.length, data.trend.length);
  const points: TrendPoint[] = [];
  for (let i = 0; i < len; i += 1) {
    const price = data.prices[i] ?? 0;
    points.push({
      date: (data.dates[i] ?? "").slice(0, 10),
      price,
      trend: data.trend[i] ?? price,
    });
  }
  return points;
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

/** One rule for both panels: non-positive prices are gaps, never observations. */
function isObservation(price: number): boolean {
  return price > 0;
}

/** Standard deviation of daily percentage returns, in percent. */
export function dailyVolatility(prices: readonly number[]): number {
  const valid = prices.filter(isObservation);
  const returns: number[] = [];
  for (let i = 1; i < valid.length; i += 1) {
    const prev = valid[i - 1] ?? 0;
    const next = valid[i] ?? 0;
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
  // Same gap rule as dailyVolatility: skip non-positive prices everywhere so
  // the average and the volatility panel never disagree about a gap day.
  const valid: { readonly price: number; readonly idx: number }[] = [];
  for (let i = 0; i < prices.length; i += 1) {
    const price = prices[i] ?? 0;
    if (isObservation(price)) valid.push({ price, idx: i });
  }
  const count = valid.length;
  const first = valid[0]?.price ?? 0;
  const last = valid[count - 1]?.price ?? 0;
  const change = first === 0 ? 0 : ((last - first) / first) * 100;
  let high = 0;
  let low = 0;
  let highIdx = -1;
  let lowIdx = -1;
  let sum = 0;
  for (const { price, idx } of valid) {
    sum += price;
    if (highIdx === -1 || price > high) {
      high = price;
      highIdx = idx;
    }
    if (lowIdx === -1 || price < low) {
      low = price;
      lowIdx = idx;
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
    lastDate: points[valid[count - 1]?.idx ?? -1]?.date ?? "",
    average: count > 0 ? sum / count : 0,
    volatility: dailyVolatility(prices),
    rangePct: low === 0 ? 0 : ((high - low) / low) * 100,
  };
}

/** "30D" → 30 (days), via the shared window map both sides already honor. */
export function windowDays(window: TimeWindow): number {
  return TIME_WINDOW_DAYS[window];
}
