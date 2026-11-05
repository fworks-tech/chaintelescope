/**
 * @fileoverview Round-trip das migrações contra um PostgreSQL real.
 * Sem `DATABASE_URL`, a suíte é pulada — nunca falha silenciosamente.
 */

import { afterAll, beforeAll, describe, expect, test } from "vitest";
import pg from "pg";
import { migrate } from "../src/db/migrate.js";
import { ingestNewsItem } from "../src/ingest/news.js";

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)("migrations against a real database", () => {
  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });

  beforeAll(async () => {
    await migrate(pool, "up");
  });

  afterAll(async () => {
    await pool.end();
  });

  test("creates the v1 schema", async () => {
    const { rows } = await pool.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' ORDER BY table_name`,
    );
    const tables = rows.map((row) => row.table_name);

    expect(tables).toEqual(
      expect.arrayContaining([
        "assets",
        "news_items",
        "snapshots",
        "users",
        "refresh_tokens",
        "scans",
        "scan_artifacts",
        "scan_matches",
        "blocklist_hashes",
      ]),
    );
  });

  test("seeds the asset registry idempotently", async () => {
    const { rows } = await pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM assets",
    );
    expect(Number(rows[0]?.count)).toBe(100);

    await migrate(pool, "up");
    const again = await pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM assets",
    );
    expect(Number(again.rows[0]?.count)).toBe(100);
  });

  test("enforces the completed-requires-hash invariant", async () => {
    // 23514 = check_violation
    await expect(
      pool.query(
        `INSERT INTO scans (kind, status, finished_at) VALUES ('upload', 'completed', now())`,
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });

  test("the partial index for pending scans exists", async () => {
    const { rows } = await pool.query<{ indexdef: string }>(
      `SELECT indexdef FROM pg_indexes WHERE indexname = 'scans_pending_idx'`,
    );
    expect(rows[0]?.indexdef).toMatch(/WHERE \(status = 'pending'(::text)?\)/);
  });

  test("double ingest of the same item keeps one row", async () => {
    const item = {
      title: "Hash identity is the point",
      url: "https://example.com/hash-identity",
      publishedAt: "2026-11-05T00:00:00.000Z",
    };

    const first = await ingestNewsItem(item, pool);
    const second = await ingestNewsItem(item, pool);

    expect(first).toHaveProperty("created");
    expect(second).toEqual({ deduped: true });

    const { rows } = await pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM news_items WHERE url = $1",
      [item.url],
    );
    expect(Number(rows[0]?.count)).toBe(1);
  });

  test("down removes every migrated table and up restores them", async () => {
    await migrate(pool, "down");
    const after = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'scans'`,
    );
    expect(Number(after.rows[0]?.count)).toBe(0);

    const result = await migrate(pool, "up");
    expect(result.applied.length).toBeGreaterThan(0);
  });
});
