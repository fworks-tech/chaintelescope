/**
 * @fileoverview Orquestração de pipeline com tratamento de backpressure e cancelamento via AbortSignal.
 * @module api/hashing/scan-pipeline
 */

import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { DigestResult, HashAlgorithm } from "@hasheyes/shared";
import { ProgressTransform, type ProgressStats } from "./progress.js";
import { CountingSink } from "./sink.js";

/**
 * Parâmetros de execução do escaneamento via stream.
 */
export interface ScanStreamOptions {
  /** Algoritmo criptográfico utilizado (padrão: 'sha256'). */
  alg?: HashAlgorithm;
  /** Sinal de aborto para interrupção imediata da operação quando o cliente desconecta (ex.: request.raw.req.abortSignal). */
  signal?: AbortSignal;
  /** Volume total esperado em bytes para rastreamento de progresso. */
  totalBytes?: number;
  /** Janela de throttling em milissegundos para os eventos de progresso. */
  throttleMs?: number;
  /** Função de callback invocada nas janelas de progresso. */
  onProgress?: (stats: ProgressStats) => void;
}

/**
 * Resultado da operação de varredura e digest contendo métricas de latência e tamanho.
 */
export interface ScanStreamResult {
  /** Hash criptográfico e especificação do algoritmo. */
  digest: DigestResult;
  /** Quantidade exata de bytes consumidos durante o processamento. */
  bytes: number;
  /** Tempo total decorrido em milissegundos (medido via performance.now()). */
  millis: number;
}

/**
 * Processa um fluxo de dados binários sem carregar o arquivo na memória RAM,
 * aplicando controle nativo de fluxo (backpressure) e encerramento limpo em caso de erro ou cancelamento.
 *
 * @param {Readable} source - Fluxo de leitura da requisição HTTP ou sistema de arquivos.
 * @param {ScanStreamOptions} [opts={}] - Configurações operacionais e sinais de cancelamento.
 * @returns {Promise<ScanStreamResult>} Resumo do processamento criptográfico e medições de desempenho.
 * @throws {AbortError} Lança exceção caso o `AbortSignal` seja acionado antes ou durante a leitura.
 *
 * @example
 * ```ts
 * const result = await scanStream(req.raw.req, {
 *   signal: req.raw.req.abortSignal,
 *   onProgress: (p) => console.log(`Bytes lidos: ${p.bytes}`),
 * });
 * ```
 */
export async function scanStream(
  source: Readable,
  opts: ScanStreamOptions = {},
): Promise<ScanStreamResult> {
  const startTime = performance.now();

  const progressTransform = new ProgressTransform({
    throttleMs: opts.throttleMs ?? 250,
    totalBytes: opts.totalBytes,
    onProgress: opts.onProgress,
  });

  const sink = new CountingSink({ alg: opts.alg ?? "sha256" });

  // pipeline() gerencia o ciclo de vida completo: fecha os descritores e destrói todas as streams se ocorrer erro ou abort
  await pipeline(source, progressTransform, sink, { signal: opts.signal });

  const durationMs = performance.now() - startTime;

  return {
    digest: sink.digest,
    bytes: sink.bytes,
    millis: durationMs,
  };
}
