import { describe, expect, it } from "vitest";
import {
  dailyVolatility,
  longDate,
  shortDate,
  summarizeTrend,
  toPoints,
  windowDays,
  type TrendPoint,
} from "./trend.ts";

function points(prices: readonly number[]): TrendPoint[] {
  return prices.map((price, i) => ({
    date: `2026-10-${String(i + 1).padStart(2, "0")}`,
    price,
    trend: price,
  }));
}

describe("toPoints", () => {
  it("maps aligned arrays, slicing ISO dates to yyyy-mm-dd", () => {
    expect(
      toPoints({
        asset: "BTC",
        dates: ["2026-10-26T00:00:00", "2026-10-27T00:00:00"],
        prices: [100, 110],
        trend: [101, 109],
        source: "mock",
      }),
    ).toEqual([
      { date: "2026-10-26", price: 100, trend: 101 },
      { date: "2026-10-27", price: 110, trend: 109 },
    ]);
  });

  it("falls back when dates or trend are short", () => {
    expect(
      toPoints({
        asset: "BTC",
        dates: [],
        prices: [100, 110],
        trend: [101],
        source: "mock",
      }),
    ).toEqual([
      { date: "", price: 100, trend: 101 },
      { date: "", price: 110, trend: 110 },
    ]);
  });
});

describe("shortDate / longDate", () => {
  it("formats UTC dates independent of runner timezone", () => {
    expect(shortDate("2026-10-26")).toBe("Oct 26");
    expect(longDate("2026-10-26")).toBe("Oct 26, 2026");
  });

  it("passes garbage through instead of rendering Invalid Date", () => {
    expect(shortDate("not-a-date")).toBe("not-a-date");
    expect(shortDate("")).toBe("");
    expect(longDate("")).toBe("");
    expect(longDate("not-a-date")).toBe("");
  });
});

describe("dailyVolatility", () => {
  it("is 0 for flat, single-point or empty series", () => {
    expect(dailyVolatility([])).toBe(0);
    expect(dailyVolatility([100])).toBe(0);
    expect(dailyVolatility([100, 100, 100])).toBe(0);
  });

  it("uses sample variance over daily returns", () => {
    expect(dailyVolatility([100, 110, 99])).toBeCloseTo(14.14, 1);
  });

  it("skips zero prices instead of dividing by zero", () => {
    expect(dailyVolatility([0, 0, 100, 110])).toBeCloseTo(0, 10);
  });
});

describe("summarizeTrend", () => {
  it("derives every dashboard number in one pass", () => {
    const prices = [100, 110, 90, 120];
    const summary = summarizeTrend(prices, points(prices));
    expect(summary.count).toBe(4);
    expect(summary.last).toBe(120);
    expect(summary.change).toBeCloseTo(20);
    expect(summary.isUp).toBe(true);
    expect(summary.high).toBe(120);
    expect(summary.low).toBe(90);
    expect(summary.highDate).toBe("2026-10-04");
    expect(summary.lowDate).toBe("2026-10-03");
    expect(summary.lastDate).toBe("2026-10-04");
    expect(summary.average).toBeCloseTo(105);
    expect(summary.rangePct).toBeCloseTo(33.33, 1);
  });

  it("reports downtrends and picks the first date on ties", () => {
    const prices = [100, 100, 80];
    const summary = summarizeTrend(prices, points(prices));
    expect(summary.isUp).toBe(false);
    expect(summary.change).toBeCloseTo(-20);
    expect(summary.high).toBe(100);
    expect(summary.highDate).toBe("2026-10-01");
  });

  it("returns zeros and empty dates for empty input — never NaN", () => {
    const summary = summarizeTrend([], []);
    expect(summary.change).toBe(0);
    expect(summary.volatility).toBe(0);
    expect(summary.rangePct).toBe(0);
    expect(summary.average).toBe(0);
    expect(summary.lastDate).toBe("");
    expect(Number.isNaN(summary.change)).toBe(false);
  });
});

describe("windowDays", () => {
  it("reads the shared window map every label derives from", () => {
    expect(windowDays("30D")).toBe(30);
    expect(windowDays("7D")).toBe(7);
    expect(windowDays("24H")).toBe(1);
    expect(windowDays("90D")).toBe(90);
  });
});
