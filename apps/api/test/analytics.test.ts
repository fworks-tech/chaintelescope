/**
 * @fileoverview Consultas analíticas contra PostgreSQL real, com uma fixture
 * que cobre os cantos que quebram JOIN e agregação: asset sem scan, scan sem
 * match, blocklist nunca atingida, scan running e scan órfão.
 */

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { AnalyticsQueries } from "../src/db/analytics.js";
import { migrate } from "../src/db/migrate.js";
import { makeDb } from "./helpers/db.js";

const DATABASE_URL = process.env.DATABASE_URL;

/** Prefixo próprio: o seed de 100 assets continua no banco e não é truncado. */
const FX = "FX-";

interface FixtureScan {
  readonly symbol: string;
  readonly status: "completed" | "failed" | "running";
  readonly durationMs: number | null;
  readonly matches: readonly string[];
}

const ASSETS = [
  "BTC",
  "ETH",
  "SOL",
  "ADA",
  "DOT",
  "LINK",
  "AVAX",
  "MATIC",
  "BCH", // 9 com scan
  "ATOM",
  "XRP",
  "LTC", // 3 sem scan
];

const SCANS: readonly FixtureScan[] = [
  { symbol: "BTC", status: "completed", durationMs: 100, matches: [] },
  { symbol: "BTC", status: "failed", durationMs: 300, matches: ["h2"] },
  { symbol: "ETH", status: "completed", durationMs: 50, matches: ["h1", "h-other"] },
  { symbol: "SOL", status: "running", durationMs: null, matches: [] },
  { symbol: "ADA", status: "completed", durationMs: 0, matches: [] },
  { symbol: "DOT", status: "failed", durationMs: 100, matches: [] },
  { symbol: "LINK", status: "completed", durationMs: 200, matches: [] },
  { symbol: "AVAX", status: "completed", durationMs: 10, matches: [] },
  { symbol: "MATIC", status: "completed", durationMs: 20, matches: [] },
  { symbol: "BCH", status: "completed", durationMs: 30, matches: [] },
  // Órfão: nunca existiu em `assets`.
  { symbol: "ORPHAN", status: "completed", durationMs: 40, matches: ["h3"] },
];

const BLOCKLIST = [
  { hash: "h1", addedAt: "2026-01-01T00:00:00Z" },
  { hash: "h2", addedAt: "2026-01-02T00:00:00Z" },
  { hash: "h3", addedAt: "2026-01-03T00:00:00Z" },
  { hash: "h4", addedAt: "2026-01-04T00:00:00Z" }, // nunca atingido
];

describe.skipIf(!DATABASE_URL)("analytics SQL", () => {
  const handle = makeDb(DATABASE_URL ?? "");
  const analytics = new AnalyticsQueries(handle.db);

  beforeAll(async () => {
    await migrate(handle.pool, "up");
  });

  beforeEach(async () => {
    await handle.pool.query(
      `TRUNCATE scans, scan_artifacts, scan_matches, blocklist_hashes CASCADE`,
    );

    await handle.db
      .insertInto("assets")
      .values(
        ASSETS.map((symbol) => ({
          symbol: `${FX}${symbol}`,
          name: `${symbol} Asset`,
          coingecko_id: null,
          binance_pair: null,
          coinbase_id: null,
        })),
      )
      .onConflict((oc) => oc.column("symbol").doNothing())
      .execute();

    for (const scan of SCANS) {
      const id = randomUUID();
      await handle.pool.query(
        `INSERT INTO scans (id, kind, asset_symbol, status, content_hash, duration_ms, started_at, finished_at)
         VALUES ($1, 'feed', $2, $3, $4, $5,
                 CASE WHEN $3 = 'pending' THEN NULL ELSE now() END,
                 CASE WHEN $3 IN ('completed', 'failed', 'cancelled') THEN now() ELSE NULL END)`,
        [
          id,
          `${FX}${scan.symbol}`,
          scan.status,
          // O CHECK de 0004 só permite content_hash em `completed`.
          scan.status === "completed" ? `hash-${id}` : null,
          scan.durationMs,
        ],
      );

      for (const hash of scan.matches) {
        await handle.pool.query(
          `INSERT INTO scan_matches (scan_id, content_hash) VALUES ($1, $2)`,
          [id, hash],
        );
      }
    }

    for (const entry of BLOCKLIST) {
      await handle.pool.query(
        `INSERT INTO blocklist_hashes (content_hash, added_at) VALUES ($1, $2)`,
        [entry.hash, entry.addedAt],
      );
    }
  });

  afterAll(async () => {
    // `repos.test.ts` conta os 100 assets do seed; a fixture não pode sobrar.
    await handle.pool.query(`DELETE FROM assets WHERE symbol LIKE $1`, [
      `${FX}%`,
    ]);
    await handle.destroy();
  });

  test("scan history is an INNER JOIN: never-scanned assets are absent", async () => {
    const rows = (await analytics.scanHistory()).filter((row) =>
      row.symbol.startsWith(FX),
    );

    expect(rows).toHaveLength(9);
    expect(rows.some((row) => row.symbol === `${FX}ATOM`)).toBe(false);

    const btc = rows.find((row) => row.symbol === `${FX}BTC`)!;
    expect(btc).toMatchObject({
      total_scans: 2,
      completed_scans: 1,
      failed_scans: 1,
      running_scans: 0,
      blocked_matches: 1,
      avg_duration_ms: 200,
    });

    // Dois matches não podem inflar a contagem do ETH.
    const eth = rows.find((row) => row.symbol === `${FX}ETH`)!;
    expect(eth).toMatchObject({ total_scans: 1, blocked_matches: 2 });
  });

  test("coverage keeps zero-scan assets, running scans and orphaned symbols", async () => {
    const rows = (await analytics.coverage()).filter(
      (row) => row.symbol.startsWith(FX),
    );

    expect(rows).toHaveLength(13);

    for (const symbol of ["ATOM", "XRP", "LTC"]) {
      const row = rows.find((r) => r.symbol === `${FX}${symbol}`)!;
      expect(row).toMatchObject({ total_scans: 0, avg_duration_ms: 0 });
      expect(row.asset_name).toBe(`${symbol} Asset`);
    }

    // Scan running conta, mas fica fora da média e do total.
    expect(rows.find((r) => r.symbol === `${FX}SOL`)).toMatchObject({
      total_scans: 0,
      running_scans: 1,
      avg_duration_ms: 0,
    });

    // Órfão sobrevive ao FULL JOIN e não tem nome no registry.
    expect(rows.find((r) => r.symbol === `${FX}ORPHAN`)).toMatchObject({
      asset_name: "Unknown asset",
      total_scans: 1,
      blocked_hits: 1,
    });

    // Um match no BTC não pode duplicar o scan nem pesar a média.
    expect(rows.find((r) => r.symbol === `${FX}BTC`)).toMatchObject({
      total_scans: 2,
      running_scans: 0,
      blocked_hits: 1,
      avg_duration_ms: 200,
    });
    expect(rows.find((r) => r.symbol === `${FX}ETH`)).toMatchObject({
      total_scans: 1,
      blocked_hits: 2,
      avg_duration_ms: 50,
    });
  });

  test("blocklist keeps never-hit hashes and accumulates by added_at", async () => {
    const rows = await analytics.blocklist();

    expect(
      rows.map((row) => ({
        hash: row.content_hash,
        failed: row.blocked_failed,
        clean: row.blocked_clean,
        total: row.total_hits,
        cumulative: row.cumulative_hits,
      })),
    ).toEqual([
      { hash: "h1", failed: 0, clean: 1, total: 1, cumulative: 1 },
      { hash: "h2", failed: 1, clean: 0, total: 1, cumulative: 2 },
      { hash: "h3", failed: 0, clean: 1, total: 1, cumulative: 3 },
      { hash: "h4", failed: 0, clean: 0, total: 0, cumulative: 3 },
    ]);
  });

  test("the coverage join is backed by an index on scans.asset_symbol", async () => {
    const { rows } = await handle.pool.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes
       WHERE schemaname = 'public' AND tablename = 'scans'`,
    );

    expect(rows.map((row) => row.indexname)).toContain(
      "scans_asset_symbol_idx",
    );
  });
});
