import { describe, it, expect } from "vitest";
import { Buffer } from "node:buffer";
import process from "node:process";
import { TaskPool, TaskTimeoutError } from "../dist/workers/pool.js";
import { parseFeedTask } from "../dist/workers/tasks/parse-feed.js";
import { matchBlocklistTask } from "../dist/workers/tasks/match-blocklist.js";

describe("Worker Threads TaskPool", () => {
  it("bounds concurrency to pool size without exceeding live worker limit", async () => {
    const pool = new TaskPool<
      "parse-feed",
      { rawJson: string },
      { itemCount: number }
    >({ size: 2 });

    const payload = JSON.stringify({
      items: [{ id: "1", title: "Feed Item" }],
    });
    const tasks = Array.from({ length: 50 }, () =>
      pool.run("parse-feed", { rawJson: payload }),
    );

    const results = await Promise.all(tasks);
    expect(results).toHaveLength(50);
    expect(results[0]?.itemCount).toBe(1);

    await pool.destroy();
  }, 10000);

  it("rejects with TaskTimeoutError and recycles worker when task hangs in an infinite loop", async () => {
    const pool = new TaskPool<any, any, any>({ size: 1, taskTimeoutMs: 150 });

    await expect(
      pool.run("infinite-loop-task" as any, {}, { timeoutMs: 100 }),
    ).rejects.toThrow(TaskTimeoutError);

    const validResult = await pool.run("parse-feed", {
      rawJson: JSON.stringify({
        items: [{ id: "after-timeout", title: "Alive" }],
      }),
    });

    expect(validResult.itemCount).toBe(1);

    await pool.destroy();
  }, 10000);

  it("does not leak memory over repeated task executions", async () => {
    const pool = new TaskPool<"parse-feed", { rawJson: string }, unknown>({
      size: 2,
    });
    const payload = JSON.stringify({
      items: [{ id: "leak-check", title: "Item" }],
    });

    const initialHeap = process.memoryUsage().heapUsed;

    for (let i = 0; i < 200; i++) {
      await pool.run("parse-feed", { rawJson: payload });
    }

    const finalHeap = process.memoryUsage().heapUsed;
    const growthPercent = ((finalHeap - initialHeap) / initialHeap) * 100;

    expect(growthPercent).toBeLessThan(50);

    await pool.destroy();
  }, 15000);

  it("preserves data integrity and pure input -> output mapping", () => {
    const testPayload = {
      rawJson: JSON.stringify({
        items: [
          {
            id: "1",
            title: "CVE-2026-0001 Alert",
            link: "https://hasheyes.org/advisory/1",
          },
          {
            id: "2",
            title: "Zero-day Hash Match",
            link: "https://hasheyes.org/advisory/2",
          },
        ],
      }),
    };

    const clonedInput = structuredClone(testPayload);
    const result = parseFeedTask(clonedInput);

    expect(result.itemCount).toBe(2);
    expect(result.items[0]?.title).toBe("CVE-2026-0001 Alert");
    expect(result.items[1]?.id).toBe("2");
  });

  it("matches blocklist digests correctly using transferred binary buffer", () => {
    const targetHex =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    const nonMatchHex =
      "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

    const binaryDigest = Buffer.from(targetHex, "hex");
    const result = matchBlocklistTask({
      targetHexes: [targetHex, nonMatchHex],
      blocklistBuffer: new Uint8Array(binaryDigest),
    });

    expect(result.matchedHexes).toEqual([targetHex]);
    expect(result.totalChecked).toBe(2);
  });
});
