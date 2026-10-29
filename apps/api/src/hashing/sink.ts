import { Writable } from "node:stream";
import { createHash, type Hash } from "node:crypto";
import type { HashAlgorithm, DigestResult } from "@hasheyes/shared";

export interface CountingSinkOptions {
  alg?: HashAlgorithm;
}

export class CountingSink extends Writable {
  private readonly hasher: Hash;
  private readonly alg: HashAlgorithm;
  private totalBytes = 0;
  private finalDigest: DigestResult | null = null;

  constructor(opts: CountingSinkOptions = {}) {
    super();
    this.alg = opts.alg ?? "sha256";
    this.hasher = createHash(this.alg);
  }

  override _write(
    chunk: Buffer | Uint8Array,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    try {
      this.hasher.update(chunk);
      this.totalBytes += chunk.byteLength;
      callback();
    } catch (err) {
      callback(err instanceof Error ? err : new Error(String(err)));
    }
  }

  override _final(callback: (error?: Error | null) => void): void {
    try {
      this.finalDigest = {
        alg: this.alg,
        hex: this.hasher.digest("hex"),
        bytes: this.totalBytes,
      };
      callback();
    } catch (err) {
      callback(err instanceof Error ? err : new Error(String(err)));
    }
  }

  get bytes(): number {
    return this.totalBytes;
  }

  get digest(): DigestResult {
    if (!this.finalDigest) {
      throw new Error(
        "Pipeline has not completed yet; terminal digest unavailable.",
      );
    }
    return this.finalDigest;
  }
}
