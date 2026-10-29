import { Transform, type TransformCallback } from "node:stream";

export interface ProgressStats {
  bytes: number;
  total?: number | undefined;
  etaMs?: number | undefined;
}

export interface ProgressTransformOptions {
  throttleMs?: number | undefined;
  totalBytes?: number | undefined;
  highWaterMark?: number | undefined;
  onProgress?: ((stats: ProgressStats) => void) | undefined;
}

export class ProgressTransform extends Transform {
  private bytesProcessed = 0;
  private lastEmitTime = 0;
  private readonly throttleMs: number;
  private readonly totalBytes?: number | undefined;
  private readonly highWaterMark?: number | undefined;
  private readonly onProgress?: ((stats: ProgressStats) => void) | undefined;
  private readonly startTime = Date.now();

  constructor(opts: ProgressTransformOptions = {}) {
    super({ highWaterMark: opts.highWaterMark });
    this.throttleMs = opts.throttleMs ?? 250;
    this.totalBytes = opts.totalBytes;
    this.highWaterMark = opts.highWaterMark;
    this.onProgress = opts.onProgress;
  }

  override _transform(
    chunk: Buffer | Uint8Array,
    _encoding: BufferEncoding,
    callback: TransformCallback,
  ): void {
    const chunkLength = chunk.byteLength;
    this.bytesProcessed += chunkLength;

    const now = Date.now();
    if (this.onProgress && now - this.lastEmitTime >= this.throttleMs) {
      this.lastEmitTime = now;
      this.onProgress({
        bytes: this.bytesProcessed,
        total: this.totalBytes,
        etaMs: this.computeEta(),
      });
    }

    // Encaminha o chunk inalterado para o próximo estágio
    this.push(chunk);
    callback();
  }

  private computeEta(): number | undefined {
    if (this.totalBytes === undefined) return undefined;
    const elapsed = Date.now() - this.startTime;
    if (elapsed <= 0 || this.bytesProcessed <= 0) return undefined;
    const rate = this.bytesProcessed / elapsed;
    const remaining = this.totalBytes - this.bytesProcessed;
    return remaining <= 0 ? 0 : Math.round(remaining / rate);
  }

  override _flush(callback: TransformCallback): void {
    // Garante a emissão do progresso final no fecho da stream
    if (this.onProgress) {
      this.onProgress({
        bytes: this.bytesProcessed,
        total: this.totalBytes ?? this.bytesProcessed,
        etaMs: this.computeEta(),
      });
    }
    callback();
  }
}
