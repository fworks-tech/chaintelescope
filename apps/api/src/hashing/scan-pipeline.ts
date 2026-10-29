import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { DigestResult, HashAlgorithm } from "@hasheyes/shared";
import { ProgressTransform, type ProgressStats } from "./progress.js";
import { CountingSink } from "./sink.js";

export interface ScanStreamOptions {
  alg?: HashAlgorithm;
  signal?: AbortSignal;
  totalBytes?: number;
  throttleMs?: number;
  hwm?: number;
  onProgress?: (stats: ProgressStats) => void;
}

export interface ScanStreamResult {
  digest: DigestResult;
  bytes: number;
  millis: number;
}

/**
 * Executa o escaneamento e digest streaming sem alocar buffers maciços na memória heap.
 * Gerencia nativamente backpressure, cancelamento via AbortSignal e cálculo de throughput.
 */
export async function scanStream(
  source: Readable,
  opts: ScanStreamOptions = {},
): Promise<ScanStreamResult> {
  const startTime = performance.now();

  const progressTransform = new ProgressTransform({
    throttleMs: opts.throttleMs ?? 250,
    totalBytes: opts.totalBytes,
    highWaterMark: opts.hwm,
    onProgress: opts.onProgress,
  });

  const sink = new CountingSink({ alg: opts.alg ?? "sha256" });

  // pipeline() do promises destrói todas as pontas automaticamente em caso de erro ou abort
  await pipeline(source, progressTransform, sink, { signal: opts.signal });

  const durationMs = performance.now() - startTime;

  return {
    digest: sink.digest,
    bytes: sink.bytes,
    millis: durationMs,
  };
}
