/**
 * @fileoverview Stream de transformação com controle temporal (throttling) para cálculo de progresso de upload.
 * @module api/hashing/progress
 */

import { Transform, type TransformCallback } from "node:stream";

/**
 * Estatísticas emitidas periodicamente durante a leitura de um stream.
 */
export interface ProgressStats {
  /** Quantidade total de bytes consumidos até o momento. */
  bytes: number;
  /** Tamanho total previsto em bytes, se fornecido no cabeçalho Content-Length. */
  total?: number | undefined;
  /** Estimativa de tempo restante em milissegundos para conclusão do processamento. */
  etaMs?: number | undefined;
}

/**
 * Opções de configuração para o `ProgressTransform`.
 */
export interface ProgressTransformOptions {
  /** Intervalo mínimo em milissegundos entre emissões consecutivas de progresso (default: 250ms). */
  throttleMs?: number | undefined;
  /** Tamanho total em bytes para cálculo percentual. */
  totalBytes?: number | undefined;
  /** Callback acionado quando o intervalo de throttle é atingido. */
  onProgress?: ((stats: ProgressStats) => void) | undefined;
}

/**
 * Pass-through `Transform` stream que contabiliza a vazão de bytes e emite métricas com limitação temporal.
 *
 * **Evita inundação do Event Loop:** Sem o mecanismo de throttling, emitir eventos a cada chunk
 * de 64KB geraria milhares de microtasks/macrotasks por segundo, degradando o tempo de resposta do servidor[cite: 1].
 */
export class ProgressTransform extends Transform {
  private bytesProcessed = 0;
  private lastEmitTime = 0;
  private readonly throttleMs: number;
  private readonly totalBytes?: number | undefined;
  private readonly onProgress?: ((stats: ProgressStats) => void) | undefined;

  constructor(opts: ProgressTransformOptions = {}) {
    super();
    this.throttleMs = opts.throttleMs ?? 250;
    this.totalBytes = opts.totalBytes;
    this.onProgress = opts.onProgress;
  }

  /**
   * Intercepta o chunk de dados, atualiza contadores internos e repassa os bytes para o estágio seguinte.
   *
   * @param {Buffer | Uint8Array} chunk - Pacote de bytes trafegando na stream.
   * @param {BufferEncoding} _encoding - Codificação de texto (ignorada para streams binárias).
   * @param {TransformCallback} callback - Notifica o runtime do Node.js que o chunk foi processado.
   */
  override _transform(
    chunk: Buffer | Uint8Array,
    _encoding: BufferEncoding,
    callback: TransformCallback,
  ): void {
    const chunkLength = chunk.byteLength;
    this.bytesProcessed += chunkLength;

    const now = Date.now();
    // Limita o disparo do callback de progresso para a janela de throttle (ex.: máximo de 4 vezes por segundo)
    if (this.onProgress && now - this.lastEmitTime >= this.throttleMs) {
      this.lastEmitTime = now;
      this.onProgress({
        bytes: this.bytesProcessed,
        total: this.totalBytes,
      });
    }

    // Encaminha os dados transparentemente sem retenção de memória no buffer intermediário
    this.push(chunk);
    callback();
  }

  /**
   * Método executado ao finalizar a leitura de toda a stream de entrada.
   * Garante que o evento com 100% de progresso seja emitido mesmo se o último bloco ocorreu dentro da janela de throttle.
   *
   * @param {TransformCallback} callback - Notifica o encerramento da stream.
   */
  override _flush(callback: TransformCallback): void {
    if (this.onProgress) {
      this.onProgress({
        bytes: this.bytesProcessed,
        total: this.totalBytes ?? this.bytesProcessed,
      });
    }
    callback();
  }
}
