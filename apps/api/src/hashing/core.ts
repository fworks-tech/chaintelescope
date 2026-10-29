import type { Readable } from "node:stream";
import type { HashAlgorithm, DigestResult } from "@hasheyes/shared";
import { defaultHasherFactory, type HasherFactory } from "./algorithms.js";

export type HashableInput = Buffer | Readable | AsyncIterable<Buffer>;

/**
 * Calcula o digest criptográfico de um Buffer, Readable Stream ou AsyncIterable.
 * Consome streams sob demanda (chunks), mantendo a pegada de memória constante.
 */
export async function digest(
  input: HashableInput,
  alg: HashAlgorithm = "sha256",
  hasherFactory: HasherFactory = defaultHasherFactory,
): Promise<DigestResult> {
  const hasher = hasherFactory(alg);
  let bytes = 0;

  if (Buffer.isBuffer(input)) {
    hasher.update(input);
    bytes = input.byteLength;
  } else {
    for await (const rawChunk of input) {
      const chunk = Buffer.isBuffer(rawChunk)
        ? rawChunk
        : Buffer.from(rawChunk);
      hasher.update(chunk);
      bytes += chunk.byteLength;
    }
  }

  return {
    alg,
    hex: hasher.digest("hex"),
    bytes,
  };
}
