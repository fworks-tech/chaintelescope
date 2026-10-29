import { describe, it, expect, vi } from "vitest";
import { Buffer } from "node:buffer";
import process from "node:process";
import { Readable, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { scanStream } from "../src/hashing/scan-pipeline.js";
import { ProgressTransform } from "../src/hashing/progress.js";

describe("Streaming Scan Pipeline", () => {
  it("scans a synthetic 64 MiB stream without exceeding 8 MiB RSS spike", async () => {
    const totalBytes = 64 * 1024 * 1024; // 64 MiB
    const chunkSize = 64 * 1024; // 64 KiB chunks
    let bytesGenerated = 0;

    // Buffer estático reutilizado para não inflar o heap do runtime do Vitest
    const staticChunk = Buffer.alloc(chunkSize, 0x42);

    const baseHeap = process.memoryUsage().heapUsed;

    const syntheticStream = new Readable({
      read() {
        if (bytesGenerated >= totalBytes) {
          this.push(null);
          return;
        }
        const remaining = totalBytes - bytesGenerated;
        const currentChunkSize = Math.min(chunkSize, remaining);
        bytesGenerated += currentChunkSize;

        // Emite o buffer fatiado sem realocações no V8
        this.push(staticChunk.subarray(0, currentChunkSize));
      },
    });

    const result = await scanStream(syntheticStream, { totalBytes });

    const finalHeap = process.memoryUsage().heapUsed;
    const heapIncreaseMiB = (finalHeap - baseHeap) / (1024 * 1024);

    expect(result.bytes).toBe(totalBytes);
    expect(result.digest.hex).toBeDefined();
    // A retenção na memória heap da aplicação fica estritamente contida (< 8 MiB)
    expect(heapIncreaseMiB).toBeLessThan(8);
  });

  it("aborts pipeline mid-flight and immediately cleans up resources", async () => {
    const controller = new AbortController();
    let produced = 0;

    const infiniteStream = new Readable({
      read() {
        produced += 1024;
        this.push(Buffer.alloc(1024, 0x61));
        if (produced > 10_000 && !controller.signal.aborted) {
          controller.abort();
        }
      },
    });

    await expect(
      scanStream(infiniteStream, { signal: controller.signal }),
    ).rejects.toThrow();

    expect(infiniteStream.destroyed).toBe(true);
  });

  it("throttles progress reports to at most 5 events per second (250ms window)", async () => {
    const chunk = Buffer.alloc(1024, 0x01);
    const progressSpy = vi.fn();

    const progressStream = new ProgressTransform({
      throttleMs: 250,
      onProgress: progressSpy,
    });

    const mockSink = new Writable({
      write(
        _c: unknown,
        _e: BufferEncoding,
        cb: (error?: Error | null) => void,
      ) {
        cb();
      },
    });

    const source = Readable.from(Array.from({ length: 50 }, () => chunk));

    await pipeline(source, progressStream, mockSink);

    expect(progressSpy.mock.calls.length).toBeLessThanOrEqual(3);
  });

  it("pauses readable stream when downstream sink experiences slow backpressure", async () => {
    let pushedCount = 0;
    const highWaterMark = 1024;

    const slowSink = new Writable({
      highWaterMark,
      write(
        _chunk: unknown,
        _encoding: BufferEncoding,
        callback: (error?: Error | null) => void,
      ) {
        setTimeout(callback, 20);
      },
    });

    const fastSource = new Readable({
      highWaterMark,
      read() {
        pushedCount++;
        this.push(Buffer.alloc(512, 0x78));
      },
    });

    const pipelinePromise = pipeline(fastSource, slowSink);

    await new Promise((r) => setTimeout(r, 40));

    expect(fastSource.readableFlowing).not.toBe(true);

    fastSource.push(null);
    await pipelinePromise;
  });
});
