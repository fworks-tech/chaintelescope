/**
 * @fileoverview Núcleo puro de hashing de artefatos com suporte a fluxos assíncronos.
 * @module api/hashing/core
 */

import type { Readable } from "node:stream";
import type { HashAlgorithm, DigestResult } from "@hasheyes/shared";
import { defaultHasherFactory, type HasherFactory } from "./algorithms.js";

/**
 * Tipos de entrada suportados pelo motor puro de hashing.
 * Não depende de `node:fs` para manter desacoplamento e isolamento de efeitos colaterais.
 */
export type HashableInput = Buffer | Readable | AsyncIterable<Buffer>;

/**
 * Calcula o digest criptográfico de entradas em memória (`Buffer`) ou sob demanda (`Readable` / `AsyncIterable`).
 *
 * Ao consumir `AsyncIterable<Buffer>`, os dados são processados bloco a bloco (chunks),
 * garantindo complexidade de espaço $O(1)$ na memória heap do V8.
 *
 * @param {HashableInput} input - Dados a serem digeridos (Buffer único ou fluxo assíncrono).
 * @param {HashAlgorithm} [alg='sha256'] - Algoritmo criptográfico utilizado.
 * @param {HasherFactory} [hasherFactory=defaultHasherFactory] - Injeção de fábrica de hash (usada para profiling e testes).
 * @returns {Promise<DigestResult>} Resultado contendo algoritmo, hash hexadecimal e total de bytes consumidos.
 *
 * @example
 * ```ts
 * const result = await digest(fs.createReadStream('file.bin'), 'sha256');
 * console.log(result.hex);
 * ```
 */
export async function digest(
  input: HashableInput,
  alg: HashAlgorithm = "sha256",
  hasherFactory: HasherFactory = defaultHasherFactory,
): Promise<DigestResult> {
  const hasher = hasherFactory(alg);
  let bytes = 0;

  if (Buffer.isBuffer(input)) {
    // Caminho rápido para payloads pequenos já residentes em memória
    hasher.update(input);
    bytes = input.byteLength;
  } else {
    // Itera assincronamente através de chunks sem carregar o arquivo completo no heap
    for await (const rawChunk of input) {
      const chunk = Buffer.isBuffer(rawChunk)
        ? rawChunk
        : Buffer.from(rawChunk);
      hasher.update(chunk);
      bytes += chunk.byteLength; // Acumula o tamanho total sem alocar buffers intermediários
    }
  }

  return {
    alg,
    hex: hasher.digest("hex"),
    bytes,
  };
}
