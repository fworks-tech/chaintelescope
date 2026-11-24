import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { BinanceMarketProvider } from "../src/market/providers/binance.js";
import { CoinbaseMarketProvider } from "../src/market/providers/coinbase.js";
import { CoinGeckoMarketProvider } from "../src/market/providers/coingecko.js";

const signal = new AbortController().signal;
const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string): unknown =>
  JSON.parse(
    readFileSync(join(here, "fixtures/market", name), "utf-8"),
  ) as unknown;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// Recorded venue payloads live in fixtures/market/; refresh them if a venue
// changes its response shape, keeping all three on the same BTC 7-day window.
// Fixture upkeep is manual (no scheduled refresh); the contract below fails
// loudly on drift.
// NOTE (auditor): fixture() takes hardcoded names only — no path traversal.
const EXPECTED_BTC_7D_PRICES = [
  42400.1, 42750.75, 42900, 43025.5, 43300.25, 43450, 43700.6,
];

/** Normalized Snapshot shape every venue must satisfy (#173). */
function expectNormalizedSnapshot(
  snapshot: {
    window: string;
    provider: string;
    series: readonly {
      asset: string;
      dates: readonly string[];
      prices: readonly number[];
      trend: readonly number[];
      source: string;
    }[];
  },
  opts: { window: string; provider: string; asset: string },
): void {
  expect(snapshot.window).toBe(opts.window);
  expect(snapshot.provider).toBe(opts.provider);
  expect(snapshot.series).toHaveLength(1);
  const s = snapshot.series[0]!;
  expect(s.asset).toBe(opts.asset);
  expect(s.source).toBe(opts.provider);
  expect(s.dates.length).toBeGreaterThan(0);
  expect(s.dates).toHaveLength(s.prices.length);
  expect(s.trend).toHaveLength(s.prices.length);
  for (const d of s.dates) {
    expect(typeof d).toBe("string");
    expect(Number.isNaN(Date.parse(d))).toBe(false);
  }
  for (const p of [...s.prices, ...s.trend]) {
    expect(typeof p).toBe("number");
    expect(Number.isFinite(p)).toBe(true);
  }
  // rollingMean(window 5, min_periods 1): first trend point equals first price.
  expect(s.trend[0]).toBeCloseTo(s.prices[0]!, 10);
}

describe("BinanceMarketProvider", () => {
  it("parses recorded klines fixture into a normalized snapshot", async () => {
    const body = fixture("binance-klines-btc-7d.json");
    const seen: string[] = [];
    const fetchImpl = vi.fn(async (url: unknown) => {
      seen.push(String(url));
      return jsonResponse(body);
    });
    const provider = new BinanceMarketProvider(
      fetchImpl as unknown as typeof fetch,
    );
    const snapshot = await provider.fetchSnapshot(["BTC"], "7D", signal);
    expectNormalizedSnapshot(snapshot, {
      window: "7D",
      provider: "binance",
      asset: "BTC",
    });
    expect(snapshot.series[0]?.prices).toEqual(EXPECTED_BTC_7D_PRICES);
    // Canonical map drives the venue symbol (#174).
    expect(seen).toHaveLength(1);
    expect(seen[0]).toContain("symbol=BTCUSDT");
    expect(seen[0]).toContain("interval=1d");
    expect(seen[0]).toContain("limit=7");
  });

  it("throws on non-200 or empty payload", async () => {
    const provider = new BinanceMarketProvider(
      vi.fn(async () => jsonResponse({}, 429)) as unknown as typeof fetch,
    );
    await expect(provider.fetchSnapshot(["BTC"], "7D", signal)).rejects.toThrow(
      "binance 429",
    );

    const empty = new BinanceMarketProvider(
      vi.fn(async () => jsonResponse([])) as unknown as typeof fetch,
    );
    await expect(empty.fetchSnapshot(["BTC"], "7D", signal)).rejects.toThrow(
      "empty series",
    );
  });

  it("skips malformed rows before declaring empty", async () => {
    const provider = new BinanceMarketProvider(
      vi.fn(async () =>
        jsonResponse([["bad"], null, [1704067200000, "1", "2", "0.5"]]),
      ) as unknown as typeof fetch,
    );
    await expect(provider.fetchSnapshot(["BTC"], "7D", signal)).rejects.toThrow(
      "empty series",
    );
  });
});

describe("CoinGeckoMarketProvider", () => {
  it("parses recorded market_chart fixture into a normalized snapshot", async () => {
    const body = fixture("coingecko-market_chart-btc-7d.json");
    const seen: string[] = [];
    const fetchImpl = vi.fn(async (url: unknown) => {
      seen.push(String(url));
      return jsonResponse(body);
    });
    const provider = new CoinGeckoMarketProvider(
      fetchImpl as unknown as typeof fetch,
    );
    const snapshot = await provider.fetchSnapshot(["BTC"], "7D", signal);
    expectNormalizedSnapshot(snapshot, {
      window: "7D",
      provider: "coingecko",
      asset: "BTC",
    });
    expect(snapshot.series[0]?.prices).toEqual(EXPECTED_BTC_7D_PRICES);
    expect(seen[0]).toContain("/bitcoin/market_chart");
    expect(seen[0]).toContain("vs_currency=usd");
  });

  it("throws for unknown asset, non-200, or empty payload", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const provider = new CoinGeckoMarketProvider(fetchImpl);
    await expect(
      provider.fetchSnapshot(["NOTREAL"], "7D", signal),
    ).rejects.toThrow("coingecko id missing");
    expect(fetchImpl).not.toHaveBeenCalled();

    const bad = new CoinGeckoMarketProvider(
      vi.fn(async () => jsonResponse({}, 500)) as unknown as typeof fetch,
    );
    await expect(bad.fetchSnapshot(["BTC"], "7D", signal)).rejects.toThrow(
      "coingecko 500",
    );

    const empty = new CoinGeckoMarketProvider(
      vi.fn(async () =>
        jsonResponse({ prices: [] }),
      ) as unknown as typeof fetch,
    );
    await expect(empty.fetchSnapshot(["BTC"], "7D", signal)).rejects.toThrow(
      "empty series",
    );
  });
});

describe("CoinbaseMarketProvider", () => {
  it("sorts recorded candles and slices to the requested window", async () => {
    const body = fixture("coinbase-candles-btc-7d.json");
    const seen: string[] = [];
    const fetchImpl = vi.fn(async (url: unknown) => {
      seen.push(String(url));
      return jsonResponse(body);
    });
    const provider = new CoinbaseMarketProvider(
      fetchImpl as unknown as typeof fetch,
    );
    const snapshot = await provider.fetchSnapshot(["BTC"], "7D", signal);
    expectNormalizedSnapshot(snapshot, {
      window: "7D",
      provider: "coinbase",
      asset: "BTC",
    });
    // Fixture is newest-first; provider sorts ascending and keeps all 7.
    expect(snapshot.series[0]?.dates[0]).toBe("2024-01-01T00:00:00.000Z");
    expect(snapshot.series[0]?.prices).toEqual(EXPECTED_BTC_7D_PRICES);
    expect(seen[0]).toContain("/BTC-USD/candles");
    expect(seen[0]).toContain("granularity=86400");
  });

  it("resolves POL through the canonical map, not POL-USD", async () => {
    const urlImpl = vi.fn(async () => jsonResponse([[1704067200, 1, 2, 0.5, 0.5, 10]]));
    const pol = new CoinbaseMarketProvider(
      urlImpl as unknown as typeof fetch,
    );
    await pol.fetchSnapshot(["POL"], "7D", signal);
    expect(String(urlImpl.mock.calls[0]?.[0])).toContain("/MATIC-USD/candles");
  });

  it("throws before any request for an asset outside the map", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse([]));
    const provider = new CoinbaseMarketProvider(
      fetchImpl as unknown as typeof fetch,
    );
    await expect(
      provider.fetchSnapshot(["NOTREAL"], "7D", signal),
    ).rejects.toThrow("coinbase product missing");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("throws on non-200 or empty payload", async () => {
    const bad = new CoinbaseMarketProvider(
      vi.fn(async () => jsonResponse({}, 503)) as unknown as typeof fetch,
    );
    await expect(bad.fetchSnapshot(["BTC"], "7D", signal)).rejects.toThrow(
      "coinbase 503",
    );

    const empty = new CoinbaseMarketProvider(
      vi.fn(async () => jsonResponse([])) as unknown as typeof fetch,
    );
    await expect(empty.fetchSnapshot(["BTC"], "7D", signal)).rejects.toThrow(
      "empty series",
    );
  });
});
