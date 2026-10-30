/**
 * @fileoverview Abstração da fábrica de hashes criptográficos para injeção de dependências e testes.
 * @module api/hashing/algorithms
 */

import { createHash } from "node:crypto";
import type { HashAlgorithm } from "@hasheyes/shared";

/**
 * Interface mínima para geradores de digest criptográfico.
 * Permite encapsular tanto instâncias nativas de `node:crypto` quanto mocks para simulação de carga de CPU.
 */
export interface DigestHasher {
  /**
   * Alimenta o hasher com um pedaço de dados binários.
   * @param {Buffer} chunk - Bloco de bytes em trânsito.
   */
  update(chunk: Buffer): void;

  /**
   * Finaliza o cálculo do hash e retorna a representação hexadecimal correspondente.
   * @param {'hex'} encoding - Formato de codificação da saída.
   * @returns {string} Hash final em formato hexadecimal.
   */
  digest(encoding: "hex"): string;
}

/**
 * Fábrica responsável por instanciar algoritmos criptográficos suportados.
 */
export type HasherFactory = (alg: HashAlgorithm) => DigestHasher;

/**
 * Implementação padrão de fábrica que utiliza o módulo C++ nativo `node:crypto`.
 *
 * @param {HashAlgorithm} alg - Algoritmo selecionado ('sha256' ou 'blake2b512').
 * @returns {DigestHasher} Instância ativa do hasher nativo do OpenSSL via Node.js.
 */
export const defaultHasherFactory: HasherFactory = (alg: HashAlgorithm) => {
  return createHash(alg);
};
  