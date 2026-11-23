import { describe, expect, it, vi } from "vitest";
import { BinanceMarketProvider } from "../src/market/providers/binance.js";
import { CoinbaseMarketProvider } from "../src/market/providers/coinbase.js";
import { CoinGeckoMarketProvider } from "../src/market/providers/coingecko.js";

const signal = new AbortController().signal;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("BinanceMarketProvider", () => {
  it("parses klines into a snapshot series", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse([
        [1704067200000, "1", "2", "0.5", "100", "10"],
        [1704153600000, "1", "2", "0.5", "110", "10"],
      ]),
    );
    const provider = new BinanceMarketProvider(
      fetchImpl as unknown as typeof fetch,
    );
    const snapshot = await provider.fetchSnapshot(["BTC"], "7D", signal);
    expect(snapshot.provider).toBe("binance");
    expect(snapshot.series[0]).toMatchObject({
      asset: "BTC",
      dates: ["2024-01-01T00:00:00.000Z", "2024-01-02T00:00:00.000Z"],
      prices: [100, 110],
      source: "binance",
    });
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
});

describe("CoinGeckoMarketProvider", () => {
  it("parses market_chart prices", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        prices: [
          [1704067200000, 100],
          [1704153600000, 110],
        ],
      }),
    );
    const provider = new CoinGeckoMarketProvider(
      fetchImpl as unknown as typeof fetch,
    );
    const snapshot = await provider.fetchSnapshot(["BTC"], "7D", signal);
    expect(snapshot.series[0]?.prices).toEqual([100, 110]);
    expect(snapshot.series[0]?.source).toBe("coingecko");
  });

  it("throws for unknown asset, non-200, or empty payload", async () => {
    const provider = new CoinGeckoMarketProvider(
      vi.fn() as unknown as typeof fetch,
    );
    await expect(
      provider.fetchSnapshot(["NOTREAL"], "7D", signal),
    ).rejects.toThrow("coingecko id missing");

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
  it("sorts candles and slices to the requested window", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse([
        [1704153600, 1, 2, 0.5, 110, 10],
        [1704067200, 1, 2, 0.5, 100, 10],
        [1704240000, 1, 2, 0.5, 120, 10],
      ]),
    );
    const provider = new CoinbaseMarketProvider(
      fetchImpl as unknown as typeof fetch,
    );
    const snapshot = await provider.fetchSnapshot(["BTC"], "24H", signal);
    expect(snapshot.series[0]?.dates).toEqual(["2024-01-03T00:00:00.000Z"]);
    expect(snapshot.series[0]?.prices).toEqual([120]);
    expect(snapshot.series[0]?.source).toBe("coinbase");
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
