/**
 * @fileoverview Máquina de estados (unitária) e orquestrador/daemon contra
 * PostgreSQL real. Sem `DATABASE_URL` a parte de banco é pulada.
 */

import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { migrate } from "../src/db/migrate.js";
import { ScanArtifactsRepo } from "../src/db/repos/artifacts.js";
import { ScansRepo } from "../src/db/repos/scans.js";
import { ScanCanceller } from "../src/scans/cancellation.js";
import { ScanDaemon } from "../src/scans/daemon.js";
import {
  cancelScan,
  runScan,
  ScanRaceError,
  type RunScanDeps,
} from "../src/scans/orchestrator.js";
import {
  assertTransition,
  InvalidTransitionError,
  SCAN_STATUSES,
  TRANSITIONS,
} from "../src/scans/state-machine.js";
import { makeDb } from "./helpers/db.js";

const DATABASE_URL = process.env.DATABASE_URL;

describe("scan state machine", () => {
  for (const from of SCAN_STATUSES) {
    for (const to of SCAN_STATUSES) {
      const legal = TRANSITIONS[from].includes(to);
      test(`${from} -> ${to} is ${legal ? "allowed" : "rejected"}`, () => {
        if (legal) {
          expect(() => assertTransition(from, to)).not.toThrow();
        } else {
          expect(() => assertTransition(from, to)).toThrow(
            InvalidTransitionError,
          );
        }
      });
    }
  }
});

describe.skipIf(!DATABASE_URL)("scan orchestrator", () => {
  const handle = makeDb(DATABASE_URL ?? "");
  const scans = new ScansRepo(handle.db);
  const artifacts = new ScanArtifactsRepo(handle.db);
  const canceller = new ScanCanceller();

  const bytes = Buffer.from("chaintelescope-scan-fixture");
  const sha = createHash("sha256").update(bytes).digest("hex");
  const deps: RunScanDeps = {
    scans,
    artifacts,
    canceller,
    sourceFor: () => ({ stream: Readable.from([bytes]) }),
  };

  beforeAll(async () => {
    await migrate(handle.pool, "up");
  });

  beforeEach(async () => {
    await handle.pool.query(
      `TRUNCATE users, refresh_tokens, scans, scan_artifacts, scan_matches,
       blocklist_hashes, news_items, snapshots RESTART IDENTITY CASCADE`,
    );
  });

  afterAll(async () => {
    await handle.destroy();
  });

  test("completing a scan records the digest, duration and artifact", async () => {
    await scans.create({ kind: "feed", assetSymbol: "BTC/USD" });
    const [claimed] = await scans.claimBatch(1);

    const done = await runScan(claimed!, deps);

    expect(done).toMatchObject({
      status: "completed",
      content_hash: sha,
      digest_alg: "sha256",
      asset_symbol: "BTC/USD",
      failure_reason: null,
    });
    expect(done.duration_ms).toBeGreaterThanOrEqual(0);

    const rows = await handle.db.selectFrom("scan_artifacts").selectAll().execute();
    expect(rows).toHaveLength(1);
    expect(Number(rows[0]!.bytes)).toBe(bytes.length);
  });

  test("re-uploading the same bytes reuses the content-addressed artifact", async () => {
    await scans.create({ kind: "upload" });
    await scans.create({ kind: "upload" });
    const [first] = await scans.claimBatch(1);
    const [second] = await scans.claimBatch(1);

    expect((await runScan(first!, deps)).status).toBe("completed");
    expect((await runScan(second!, deps)).status).toBe("completed");

    const rows = await handle.db
      .selectFrom("scan_artifacts")
      .select("content_hash")
      .execute();
    expect(rows).toEqual([{ content_hash: sha }]);
  });

  test("a scan without a source adapter fails instead of hanging", async () => {
    await scans.create({ kind: "snapshot" });
    const [claimed] = await scans.claimBatch(1);

    const done = await runScan(claimed!, { ...deps, sourceFor: () => undefined });

    expect(done).toMatchObject({
      status: "failed",
      failure_reason: "no_source_adapter",
    });
    expect(await scans.list({ status: "running" })).toHaveLength(0);
  });

  test("a stream error is persisted as the failure reason", async () => {
    await scans.create({ kind: "feed" });
    const [claimed] = await scans.claimBatch(1);

    const done = await runScan(claimed!, {
      ...deps,
      sourceFor: () => ({
        stream: new Readable({
          read() {
            this.destroy(new Error("collector exploded"));
          },
        }),
      }),
    });

    expect(done).toMatchObject({
      status: "failed",
      failure_reason: "collector exploded",
    });
  });

  test("cancelling a local scan aborts the stream and stores cancelled", async () => {
    await scans.create({ kind: "feed" });
    const [claimed] = await scans.claimBatch(1);

    const running = runScan(claimed!, {
      ...deps,
      // Stream que nunca termina sozinho: só o abort encerra.
      sourceFor: () => ({ stream: new Readable({ read() {} }) }),
    });

    // O canceller registra o scan de forma síncrona, antes do primeiro await.
    await expect(cancelScan(claimed!.id, deps)).resolves.toBeUndefined();

    const done = await running;
    expect(done).toMatchObject({ status: "cancelled" });
    expect(done.finished_at).toBeInstanceOf(Date);
    expect(canceller.size).toBe(0);
  });

  test("cancelling a pending scan finalizes it without a worker", async () => {
    const scan = await scans.create({ kind: "feed" });

    const done = await cancelScan(scan.id, deps);

    expect(done).toMatchObject({ status: "cancelled", started_at: null });
  });

  test("two workers on the same scan: one completes, the other loses the race", async () => {
    await scans.create({ kind: "upload" });
    const [claimed] = await scans.claimBatch(1);

    const results = await Promise.allSettled([
      runScan(claimed!, deps),
      runScan(claimed!, deps),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
      ScanRaceError,
    );
  });

  test("the daemon claims at most `concurrency - in-flight` scans", async () => {
    await scans.create({ kind: "feed" });
    await scans.create({ kind: "feed" });
    await scans.create({ kind: "feed" });

    const daemon = new ScanDaemon({
      ...deps,
      concurrency: 2,
      intervalMs: 1_000_000, // o teste chama tick() e drain() na mão
    });

    expect(await daemon.tick()).toHaveLength(2);
    expect(daemon.pending).toBe(2);

    await daemon.drain();
    expect(await daemon.tick()).toHaveLength(1);
    await daemon.drain();

    expect(daemon.pending).toBe(0);
    expect(await scans.list({ status: "completed" })).toHaveLength(3);
  });

  test("the daemon reconciles orphaned running rows before polling", async () => {
    const orphan = await scans.create({ kind: "feed" });
    await scans.claimBatch(1);

    const daemon = new ScanDaemon({
      ...deps,
      concurrency: 1,
      intervalMs: 1_000_000,
    });

    expect(await daemon.start()).toBe(1);
    await daemon.stop();

    expect(await scans.byId(orphan.id)).toMatchObject({
      status: "failed",
      failure_reason: "startup_reconciliation",
    });
    expect(await scans.list({ status: "running" })).toHaveLength(0);
  });
});
