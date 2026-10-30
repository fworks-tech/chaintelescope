/**
 * @fileoverview Stream de destino terminal (Writable Sink) para hashing incremental.
 * @module api/hashing/sink
 */

import { Writable } from "node:stream";
import { createHash, type Hash } from "node:crypto";
import type { HashAlgorithm, DigestResult } from "@hasheyes/shared";

/**
 * Opções de inicialização do sink de dados.
 */
export interface CountingSinkOptions {
  /** Algoritmo de hash a ser calculado no fluxo (padrão: 'sha256'). */
  alg?: HashAlgorithm;
}

/**
 * Destino final (`Writable`) de uma pipeline de streaming.
 *
 * Alimenta o motor criptográfico de forma incremental e descarta o buffer imediatamente após a ingestão,
 * evitando que arquivos grandes permaneçam retidos no heap do Node.js[cite: 1, 2].
 */
export class CountingSink extends Writable {
  private readonly hasher: Hash;
  private readonly alg: HashAlgorithm;
  private totalBytes = 0;
  private finalDigest: DigestResult | null = null;

  constructor(opts: CountingSinkOptions = {}) {
    super();
    this.alg = opts.alg ?? "sha256";
    // Instancia o hasher do OpenSSL vinculado à thread pool nativa da libuv
    this.hasher = createHash(this.alg);
  }

  /**
   * Consome cada pedaço de dados, calcula o hash intermediário e libera a memória.
   *
   * @param {Buffer | Uint8Array} chunk - Pedaço binário recebido do estágio anterior.
   * @param {BufferEncoding} _encoding - Codificação de caracteres.
   * @param {(error?: Error | null) => void} callback - Callback que sinaliza ao produtor permissão para enviar mais dados (Backpressure).
   */
  override _write(
    chunk: Buffer | Uint8Array,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    try {
      this.hasher.update(chunk);
      this.totalBytes += chunk.byteLength;
      // Notifica o pipeline de que este chunk foi consumido com sucesso
      callback();
    } catch (err) {
      callback(err instanceof Error ? err : new Error(String(err)));
    }
  }

  /**
   * Finaliza o cálculo criptográfico assim que a fonte de leitura sinaliza EOF (fim do fluxo).
   *
   * @param {(error?: Error | null) => void} callback - Notifica a conclusão definitiva do fluxo.
   */
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

  /**
   * Retorna o total de bytes processados ao longo de todo o ciclo de vida da stream.
   */
  get bytes(): number {
    return this.totalBytes;
  }

  /**
   * Retorna o digest criptográfico final calculado.
   *
   * @throws {Error} Lança erro caso seja invocado antes da finalização da stream.
   */
  get digest(): DigestResult {
    if (!this.finalDigest) {
      throw new Error(
        "Pipeline has not completed yet; terminal digest unavailable.",
      );
    }
    return this.finalDigest;
  }
}
