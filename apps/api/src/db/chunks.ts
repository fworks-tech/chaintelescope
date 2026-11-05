/**
 * @fileoverview Particiona listas para consultas `IN (...)`: 300 ids viram 3
 * statements, não 300 nem um `IN` gigante.
 * @module api/db/chunks
 */

/**
 * @template T - Tipo dos itens.
 * @param {readonly T[]} items - Lista completa.
 * @param {number} size - Tamanho máximo de cada fatia (>= 1).
 * @returns {T[][]} Fatias na ordem original.
 */
export function chunkArray<T>(items: readonly T[], size: number): T[][] {
  if (size < 1) throw new RangeError("chunk size must be >= 1");

  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}
