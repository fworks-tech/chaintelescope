import { createHash } from "node:crypto";
import type { HashAlgorithm } from "@hasheyes/shared";

export interface DigestHasher {
  update(chunk: Buffer): void;
  digest(encoding: "hex"): string;
}

export type HasherFactory = (alg: HashAlgorithm) => DigestHasher;

export const defaultHasherFactory: HasherFactory = (alg: HashAlgorithm) => {
  return createHash(alg);
};
