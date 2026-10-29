import { timingSafeEqual } from "node:crypto";
import { Buffer } from "node:buffer";

export type HashAlgorithm = "sha256" | "blake2b512";

export interface DigestResult {
  readonly alg: HashAlgorithm;
  readonly hex: string;
  readonly bytes: number;
}

/**
 * Compara dois DigestResults em tempo constante (constant-time).
 * Retorna falso se os algoritmos ou comprimentos diferem.
 * Utiliza timingSafeEqual para evitar ataques de temporização (Timing Attacks).
 */
export function digestsEqual(a: DigestResult, b: DigestResult): boolean {
  if (a.alg !== b.alg || a.hex.length !== b.hex.length) {
    return false;
  }

  const bufA = Buffer.from(a.hex, "utf8");
  const bufB = Buffer.from(b.hex, "utf8");

  return timingSafeEqual(bufA, bufB);
}
