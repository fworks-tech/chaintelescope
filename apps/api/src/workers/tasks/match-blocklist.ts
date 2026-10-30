/**
 * @fileoverview Verificação de associação de conjunto (Set Membership) em listas de bloqueio via ArrayBuffer.
 * @module api/workers/tasks/match-blocklist
 */

/**
 * Entrada com os hashes a verificar e o buffer binário da blocklist.
 */
export interface MatchBlocklistInput {
  /** Lista de hashes hexadecimais a verificar. */
  targetHexes: string[];
  /** Buffer binário contíguo com os hashes da blocklist (32 bytes cada para SHA-256). */
  blocklistBuffer: Uint8Array;
}

/**
 * Resultado da comparação contendo os hashes identificados na lista de bloqueio.
 */
export interface MatchBlocklistOutput {
  matchedHexes: string[];
  totalChecked: number;
}

/**
 * Executa a busca em massa de hashes contra uma base de bloqueio em memória.
 *
 * Utiliza busca indexada via `Set` em uma Worker Thread para evitar travamento da thread principal
 * ao processar centenas de milhares de registros.
 *
 * @param {MatchBlocklistInput} input - Conjunto de hashes candidatos e buffer binário transferido.
 * @returns {MatchBlocklistOutput} Lista dos hashes encontrados na blocklist e volume total verificado.
 */
export function matchBlocklistTask(
  input: MatchBlocklistInput,
): MatchBlocklistOutput {
  const { targetHexes, blocklistBuffer } = input;
  const hashSize = 32; // Tamanho em bytes de um digest SHA-256 binário
  const count = Math.floor(blocklistBuffer.byteLength / hashSize);
  const blocklistSet = new Set<string>();

  // Itera pelo buffer contíguo e popula a tabela de dispersão em memória
  for (let i = 0; i < count; i++) {
    const slice = blocklistBuffer.subarray(i * hashSize, (i + 1) * hashSize);
    blocklistSet.add(Buffer.from(slice).toString("hex"));
  }

  const matchedHexes: string[] = [];

  // Busca em tempo médio O(1) por chave
  for (const hex of targetHexes) {
    if (blocklistSet.has(hex.toLowerCase())) {
      matchedHexes.push(hex);
    }
  }

  return {
    matchedHexes,
    totalChecked: targetHexes.length,
  };
}
