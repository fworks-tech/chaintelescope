import { describe, expect, it, vi } from "vitest";
import type {
  MarketProviderId,
  Snapshot,
  TimeWindow,
} from "@chaintelescope/shared";
import {
  createMarketChain,
  fetchPriceTrend,
  resolveMarketProviders,
} from "../src/market/index.js";
import type { MarketProvider } from "../src/market/provider.js";
import { MockMarketProvider } from "../src/market/providers/mock.js";
import { ProviderChainExhaustedError } from "../src/errors/index.js";

const WINDOW: TimeWindow = "30D";
const SYMBOLS = ["BTC"];

function snapshot(
  provider: "binance" | "coingecko" | "coinbase" | "mock",
): Snapshot {
  return {
    series: [
      {
        asset: "BTC",
        dates: ["2026-01-01T00:00:00.000Z"],
        prices: [1],
        trend: [1],
        source: provider,
      },
    ],
    window: WINDOW,
    provider,
  };
}

function provider(
  id: "binance" | "coingecko" | "coinbase" | "mock",
  impl: MarketProvider["fetchSnapshot"],
): MarketProvider {
  return { id, fetchSnapshot: vi.fn(impl) };
}

const logger = { warn: vi.fn() };

describe("market chain (#138)", () => {
  it("returns first success and records provider metadata", async () => {
    const chain = createMarketChain(
      [
        provider("binance", async () => {
          throw new Error("boom");
        }),
        provider("coingecko", async () => snapshot("coingecko")),
        provider("coinbase", async () => snapshot("coinbase")),
      ],
      logger,
      { timeoutMs: 50 },
    );

    const result = await chain(SYMBOLS, WINDOW, new AbortController().signal);

    expect(result.provider).toBe("coingecko");
    expect(result.series[0]?.source).toBe("coingecko");
  });

  it("parity matrix: timeout/error/success per position", async () => {
    const never = new Promise<Snapshot>(() => {});
    const cases: Array<{
      name: string;
      providers: MarketProvider[];
      expected: "binance" | "coingecko" | "coinbase" | "exhausted";
    }> = [
      {
        name: "success at head",
        providers: [
          provider("binance", async () => snapshot("binance")),
          provider("coingecko", async () => snapshot("coingecko")),
          provider("coinbase", async () => snapshot("coinbase")),
        ],
        expected: "binance",
      },
      {
        name: "error then success",
        providers: [
          provider("binance", async () => {
            throw new Error("down");
          }),
          provider("coingecko", async () => snapshot("coingecko")),
          provider("coinbase", async () => snapshot("coinbase")),
        ],
        expected: "coingecko",
      },
      {
        name: "timeout then success",
        providers: [
          provider("binance", async () => never),
          provider("coingecko", async () => snapshot("coingecko")),
          provider("coinbase", async () => snapshot("coinbase")),
        ],
        expected: "coingecko",
      },
      {
        name: "all fail",
        providers: [
          provider("binance", async () => {
            throw new Error("a");
          }),
          provider("coingecko", async () => {
            throw new Error("b");
          }),
          provider("coinbase", async () => {
            throw new Error("c");
          }),
        ],
        expected: "exhausted",
      },
    ];

    for (const c of cases) {
      const chain = createMarketChain(
        c.providers,
        { warn: vi.fn() },
        { timeoutMs: 20 },
      );
      if (c.expected === "exhausted") {
        await expect(
          chain(SYMBOLS, WINDOW, new AbortController().signal),
        ).rejects.toMatchObject({
          code: "provider_chain_exhausted",
        });
      } else {
        await expect(
          chain(SYMBOLS, WINDOW, new AbortController().signal),
        ).resolves.toMatchObject({
          provider: c.expected,
        });
      }
    }
  });

  it("a hung provider cannot hang the route", async () => {
    const chain = createMarketChain(
      [
        provider("binance", () => new Promise<Snapshot>(() => {})),
        provider("coingecko", async () => snapshot("coingecko")),
      ],
      logger,
      { timeoutMs: 20 },
    );

    const result = await chain(SYMBOLS, WINDOW, new AbortController().signal);
    expect(result.provider).toBe("coingecko");
  });

  it("all providers failing yields 503 with Retry-After", async () => {
    const chain = createMarketChain(
      [
        provider("binance", async () => {
          throw new Error("x");
        }),
      ],
      logger,
      { timeoutMs: 20 },
    );

    const err = await chain(
      SYMBOLS,
      WINDOW,
      new AbortController().signal,
    ).catch((e: unknown) => e);
    expect(err).toMatchObject({
      code: "provider_chain_exhausted",
      output: { statusCode: 503 },
    });
    expect(
      (err as ProviderChainExhaustedError).output.headers["retry-after"],
    ).toBeDefined();
  });

  it("caller abort propagates instead of falling through", async () => {
    const ac = new AbortController();
    ac.abort(new Error("cancelled"));
    const chain = createMarketChain(
      [
        provider("binance", async (_s, _w, signal) => {
          if (signal.aborted) throw signal.reason;
          return snapshot("binance");
        }),
      ],
      logger,
      { timeoutMs: 20 },
    );

    await expect(chain(SYMBOLS, WINDOW, ac.signal)).rejects.toThrow(
      "cancelled",
    );
  });
});

describe("market provider selection (#138)", () => {
  it("MARKET_PROVIDER=mock resolves to mock only (network-free)", () => {
    const providers = resolveMarketProviders("mock");
    expect(providers).toHaveLength(1);
    expect(providers[0]?.id).toBe("mock");
  });

  it("auto resolves to binance, coingecko, coinbase", () => {
    expect(resolveMarketProviders("auto").map((p) => p.id)).toEqual([
      "binance",
      "coingecko",
      "coinbase",
    ]);
  });
});

describe("MockMarketProvider (#138)", () => {
  it("returns deterministic series for a fixed clock", async () => {
    const now = () => new Date("2026-01-30T12:00:00.000Z");
    const provider = new MockMarketProvider({ now });
    const a = await provider.fetchSnapshot(
      ["BTC"],
      "7D",
      new AbortController().signal,
    );
    const b = await provider.fetchSnapshot(
      ["BTC"],
      "7D",
      new AbortController().signal,
    );
    expect(a).toEqual(b);
    expect(a.provider).toBe("mock");
    expect(a.series[0]?.prices).toHaveLength(7);
    expect(a.series[0]?.trend).toHaveLength(7);
    expect(a.series[0]?.dates[6]).toBe("2026-01-30T00:00:00.000Z");
  });
});

describe("fetchPriceTrend service parity (#138)", () => {
  it("falls back to mock when providers return no data", async () => {
    const failing = [
      provider("binance", async () => {
        throw new Error("down");
      }),
      provider("coingecko", async () => {
        throw new Error("down");
      }),
      provider("coinbase", async () => {
        throw new Error("down");
      }),
    ];
    const result = await fetchPriceTrend(
      "BTC",
      30,
      "30D",
      "auto",
      failing,
      { warn: vi.fn() },
      new AbortController().signal,
      { onExhausted: "mock", now: () => new Date("2026-01-30T12:00:00.000Z") },
    );
    expect(result.source).toBe("mock");
    expect(result.asset).toBe("BTC");
    expect(result.prices).toHaveLength(30);
    expect(result.trend).toHaveLength(30);
  });

  it("mock source skips remote providers", async () => {
    const remote = provider("binance", async () => snapshot("binance"));
    const result = await fetchPriceTrend(
      "BTC",
      30,
      "30D",
      "mock",
      [remote],
      { warn: vi.fn() },
      new AbortController().signal,
      { now: () => new Date("2026-01-30T12:00:00.000Z") },
    );
    expect(result.source).toBe("mock");
    expect(remote.fetchSnapshot).not.toHaveBeenCalled();
  });

  it("normalizes provider dates and computes trend", async () => {
    const p = provider("binance", async () => ({
      series: [
        {
          asset: "BTC",
          dates: ["2024-05-14T00:00:00.000Z", "2024-05-15T00:00:00.000Z"],
          prices: [62000, 62500],
          trend: [62000, 62500],
          source: "binance",
        },
      ],
      window: "24H" as TimeWindow,
      provider: "binance" as const,
    }));
    const result = await fetchPriceTrend(
      "BTC",
      2,
      "24H",
      "auto",
      [p],
      { warn: vi.fn() },
      new AbortController().signal,
    );
    expect(result.source).toBe("binance");
    expect(result.dates).toEqual([
      "2024-05-14T00:00:00.000Z",
      "2024-05-15T00:00:00.000Z",
    ]);
    expect(result.trend).toEqual([62000, 62250]);
  });

  it("chain matrix: timeout/error/success per position mirrors service.py", async () => {
    const never = new Promise<Snapshot>(() => {});
    const cases: Array<{
      providers: MarketProvider[];
      expected: MarketProviderId | "mock";
    }> = [
      {
        providers: [
          provider("binance", async () => snapshot("binance")),
          provider("coingecko", async () => snapshot("coingecko")),
          provider("coinbase", async () => snapshot("coinbase")),
        ],
        expected: "binance",
      },
      {
        providers: [
          provider("binance", async () => {
            throw new Error("down");
          }),
          provider("coingecko", async () => snapshot("coingecko")),
          provider("coinbase", async () => snapshot("coinbase")),
        ],
        expected: "coingecko",
      },
      {
        providers: [
          provider("binance", async () => never),
          provider("coingecko", async () => snapshot("coingecko")),
          provider("coinbase", async () => snapshot("coinbase")),
        ],
        expected: "coingecko",
      },
      {
        providers: [
          provider("binance", async () => {
            throw new Error("a");
          }),
          provider("coingecko", async () => {
            throw new Error("b");
          }),
          provider("coinbase", async () => {
            throw new Error("c");
          }),
        ],
        expected: "mock",
      },
    ];

    for (const c of cases) {
      const result = await fetchPriceTrend(
        "BTC",
        30,
        "30D",
        "auto",
        c.providers,
        { warn: vi.fn() },
        new AbortController().signal,
        {
          timeoutMs: 20,
          onExhausted: "mock",
          now: () => new Date("2026-01-30T12:00:00.000Z"),
        },
      );
      expect(result.source).toBe(c.expected);
    }
  });

  it("single provider selection matches Python provider chain behavior", async () => {
    const binance = provider("binance", async () => snapshot("binance"));
    const coingecko = provider("coingecko", async () => snapshot("coingecko"));
    const result = await fetchPriceTrend(
      "BTC",
      30,
      "30D",
      "coingecko",
      [binance, coingecko],
      { warn: vi.fn() },
      new AbortController().signal,
    );
    expect(result.source).toBe("coingecko");
    expect(binance.fetchSnapshot).not.toHaveBeenCalled();
  });

  it("throws ProviderChainExhausted when onExhausted=throw (route 503 contract)", async () => {
    const failing = [
      provider("binance", async () => {
        throw new Error("x");
      }),
    ];
    await expect(
      fetchPriceTrend(
        "BTC",
        30,
        "30D",
        "binance",
        failing,
        { warn: vi.fn() },
        new AbortController().signal,
        {
          timeoutMs: 20,
          onExhausted: "throw",
        },
      ),
    ).rejects.toMatchObject({ code: "provider_chain_exhausted" });
  });
});
