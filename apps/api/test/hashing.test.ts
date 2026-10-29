import { describe, it, expect } from "vitest";
import { Readable } from "node:stream";
import { digestsEqual, type DigestResult } from "@hasheyes/shared";
import { digest } from "../src/hashing/core.js";

describe("Hashing Core Engine", () => {
  // Vetor oficial NIST SHA-256 para 'abc'
  const NIST_ABC_SHA256 =
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

  it('matches NIST test vector for "abc" in SHA-256', async () => {
    const input = Buffer.from("abc", "utf8");
    const result = await digest(input, "sha256");

    expect(result.alg).toBe("sha256");
    expect(result.hex).toBe(NIST_ABC_SHA256);
    expect(result.bytes).toBe(3);
  });

  it("produces identical DigestResult via Buffer and via Readable stream", async () => {
    const payload = Buffer.from(
      "Content-addressed identity payload verification 12345",
    );
    const stream = Readable.from([payload]);

    const fromBuffer = await digest(payload, "sha256");
    const fromStream = await digest(stream, "sha256");

    expect(fromBuffer.hex).toBe(fromStream.hex);
    expect(fromBuffer.bytes).toBe(fromStream.bytes);
    expect(digestsEqual(fromBuffer, fromStream)).toBe(true);
  });

  it("produces the same digest for 1,000 x 1 KiB chunks crossing 4 KiB boundaries as one-shot", async () => {
    const chunkCount = 1_000;
    const chunkSize = 1_024; // 1 KiB
    const fullBuffer = Buffer.alloc(chunkCount * chunkSize);

    // Preenche com padrão determinístico
    for (let i = 0; i < fullBuffer.length; i++) {
      fullBuffer[i] = i % 256;
    }

    // Cria gerador assíncrono para emitir pedaços de 1 KiB
    async function* generateChunks() {
      for (let i = 0; i < chunkCount; i++) {
        yield fullBuffer.subarray(i * chunkSize, (i + 1) * chunkSize);
      }
    }

    const oneShotResult = await digest(fullBuffer, "sha256");
    const streamedResult = await digest(generateChunks(), "sha256");

    expect(streamedResult.bytes).toBe(1_000 * 1_024);
    expect(streamedResult.hex).toBe(oneShotResult.hex);
    expect(digestsEqual(streamedResult, oneShotResult)).toBe(true);
  });

  it("returns false in digestsEqual when a single byte is flipped (100 property iterations)", async () => {
    const basePayload = Buffer.from(
      "Immutable deterministic base artifact data for testing.",
    );
    const baseDigest = await digest(basePayload, "sha256");

    for (let seed = 0; seed < 100; seed++) {
      const corruptedPayload = Buffer.from(basePayload);
      const targetIndex = seed % corruptedPayload.length;

      const currentByte = corruptedPayload[targetIndex];
      if (currentByte !== undefined) {
        corruptedPayload[targetIndex] = currentByte ^ 0xff;
      }

      const corruptedDigest = await digest(corruptedPayload, "sha256");

      expect(digestsEqual(baseDigest, corruptedDigest)).toBe(false);
    }
  });

  it("hashes empty input correctly", async () => {
    const emptyResult = await digest(Buffer.alloc(0), "sha256");
    // SHA-256 de string vazia
    expect(emptyResult.hex).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(emptyResult.bytes).toBe(0);
  });
});
