import type { Server } from "@hapi/hapi";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Snapshot } from "@chaintelescope/shared";

process.env["DATABASE_URL"] ??=
  "postgresql://postgres:postgres@localhost:5432/chaintelescope_test";
process.env["ARGON2_PEPPER"] ??=
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env["JWT_ACCESS_SECRET"] ??= "test-only-access-secret-0123456789abcdef";

const { buildServer } = await import("../src/server.js");

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
    window: "30D",
    provider,
  };
}

describe("market routes", () => {
  let server: Server;

  beforeAll(async () => {
    server = await buildServer(undefined, {
      rateLimit: { enabled: false },
      market: {
        selection: "mock",
        providers: [
          {
            id: "mock",
            fetchSnapshot: vi.fn(async () => snapshot("mock")),
          },
        ],
      },
    });
    await server.initialize();
  });

  afterAll(async () => {
    await server.stop({ timeout: 1000 });
  });

  it("uses configured market selection when source query is omitted", async () => {
    const res = await server.inject(
      "/api/price-trend?asset=BTC&window=30D&days=30",
    );
    expect(res.statusCode).toBe(200);
    expect((res.result as { source: string }).source).toBe("mock");
  });

  it("window wins over days at the route layer", async () => {
    const res = await server.inject(
      "/api/price-trend?asset=BTC&window=7D&days=365",
    );
    expect(res.statusCode).toBe(200);
    expect(((res.result as { prices: unknown[] }).prices)).toHaveLength(7);
  });

  it("rejects unsafe asset symbols", async () => {
    const res = await server.inject(
      "/api/price-trend?asset=../BTC&source=mock",
    );
    expect(res.statusCode).toBe(422);
  });

  it("returns 503 snapshot_not_ready for /api/snapshot", async () => {
    const res = await server.inject("/api/snapshot");
    expect(res.statusCode).toBe(503);
    expect((res.result as { error: { code: string } }).error.code).toBe(
      "snapshot_not_ready",
    );
  });
});

describe("market routes provider exhaustion", () => {
  let server: Server;

  beforeAll(async () => {
    server = await buildServer(undefined, {
      rateLimit: { enabled: false },
      market: {
        selection: "binance",
        timeoutMs: 20,
        providers: [
          {
            id: "binance",
            fetchSnapshot: vi.fn(async () => {
              throw new Error("down");
            }),
          },
        ],
      },
    });
    await server.initialize();
  });

  afterAll(async () => {
    await server.stop({ timeout: 1000 });
  });

  it("returns 503 provider_chain_exhausted with Retry-After", async () => {
    const res = await server.inject(
      "/api/price-trend?asset=BTC&window=30D&days=30&source=binance",
    );
    expect(res.statusCode).toBe(503);
    expect((res.result as { error: { code: string } }).error.code).toBe(
      "provider_chain_exhausted",
    );
    expect(res.headers["retry-after"]).toBeDefined();
  });
});
