/**
 * @fileoverview Camada de consulta tipada contra PostgreSQL real.
 * Sem `DATABASE_URL` a suíte é pulada — nunca falha silenciosamente.
 */

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { migrate } from "../src/db/migrate.js";
import { AssetsRepo } from "../src/db/repos/assets.js";
import { NewsRepo } from "../src/db/repos/news.js";
import { ScansRepo } from "../src/db/repos/scans.js";
import { withTx } from "../src/db/tx.js";
import { ingestNewsItem } from "../src/ingest/news.js";
import { makeDb } from "./helpers/db.js";

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)("typed query layer", () => {
  const handle = makeDb(DATABASE_URL ?? "");
  const scans = new ScansRepo(handle.db);
  const news = new NewsRepo(handle.db);
  const assets = new AssetsRepo(handle.db);

  beforeAll(async () => {
    await migrate(handle.pool, "up");
  });

  beforeEach(async () => {
    await handle.pool.query(
      `TRUNCATE users, refresh_tokens, scans, scan_artifacts, scan_matches,
       blocklist_hashes, news_items, snapshots RESTART IDENTITY CASCADE`,
    );
    handle.resetStatementCount();
  });

  afterAll(async () => {
    await handle.destroy();
  });

  test("withTx commits on success and rolls back on throw", async () => {
    await withTx(handle.db, async (tx) => {
      await new ScansRepo(tx).create({ kind: "feed" });
    });
    expect(await scans.list()).toHaveLength(1);

    await expect(
      withTx(handle.db, async (tx) => {
        await new ScansRepo(tx).create({ kind: "upload" });
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    // A linha da transação abortada não existe, e a conexão voltou ao pool.
    expect(await scans.list()).toHaveLength(1);
    expect(handle.pool.idleCount).toBe(handle.pool.totalCount);
  });

  test("byIds batches 300 ids into 3 statements", async () => {
    const ids = Array.from({ length: 300 }, () => randomUUID());
    handle.resetStatementCount();

    const rows = await scans.byIds(ids);

    expect(rows).toHaveLength(0);
    expect(handle.statements()).toBe(3);
  });

  test("ingestNewsItem persists once and dedupes the second call", async () => {
    const item = {
      title: "Hash identity is the point",
      url: "https://example.com/repos-dedupe",
      publishedAt: "2026-11-05T00:00:00.000Z",
    };

    const first = await ingestNewsItem(item, news);
    const second = await ingestNewsItem(item, news);

    expect(first).toHaveProperty("created");
    expect(second).toEqual({ deduped: true });
  });

  test("claimBatch hands each pending scan to exactly one caller", async () => {
    await scans.create({ kind: "feed" });
    await scans.create({ kind: "upload" });
    await scans.create({ kind: "snapshot" });

    const first = await scans.claimBatch(2);
    expect(first).toHaveLength(2);
    expect(first.every((scan) => scan.status === "running")).toBe(true);
    expect(first.every((scan) => scan.started_at !== null)).toBe(true);

    expect(await scans.list({ status: "pending" })).toHaveLength(1);
    expect(await scans.claimBatch(2)).toHaveLength(1);
    expect(await scans.claimBatch(2)).toHaveLength(0);
  });

  test("transition only applies from the expected state", async () => {
    const scan = await scans.create({ kind: "upload" });
    const hash = "a".repeat(64);

    const completed = await scans.transition(scan.id, "pending", "completed", {
      contentHash: hash,
    });
    expect(completed).toMatchObject({
      id: scan.id,
      status: "completed",
      content_hash: hash,
    });
    expect(completed?.finished_at).toBeInstanceOf(Date);

    expect(
      await scans.transition(scan.id, "pending", "failed", {
        failureReason: "late",
      }),
    ).toBeUndefined();
  });

  test("assets are queryable straight from the seed", async () => {
    expect(await assets.list()).toHaveLength(100);
    expect((await assets.bySymbol("BTC"))?.coingecko_id).toBe("bitcoin");
    expect(await assets.bySymbol("NOPE")).toBeUndefined();
  });
});
