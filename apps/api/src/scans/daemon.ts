/**
 * @fileoverview Poller in-process: reclama scans pendentes e os executa com
 * concorrência limitada, sem reentrância de tick.
 * @module api/scans/daemon
 */

import type { ScanRow } from "../db/schema.js";
import { runScan, type RunScanDeps } from "./orchestrator.js";

export interface ScanDaemonOptions extends RunScanDeps {
  readonly intervalMs?: number;
  readonly concurrency?: number;
  readonly onError?: (error: unknown) => void;
  readonly reconcileReason?: string;
}

export class ScanDaemon {
  readonly #inFlight = new Set<Promise<void>>();
  readonly #intervalMs: number;
  readonly #concurrency: number;
  #timer: ReturnType<typeof setInterval> | undefined;
  #ticking = false;

  constructor(private readonly options: ScanDaemonOptions) {
    this.#intervalMs = options.intervalMs ?? 1000;
    this.#concurrency = options.concurrency ?? 4;
  }

  /**
   * Reconcilia as linhas `running` de um processo morto e começa a pollar.
   *
   * @returns {Promise<number>} Quantos scans órfãos foram encerrados.
   */
  async start(): Promise<number> {
    if (this.#timer !== undefined) return 0;

    const reconciled = await this.options.scans.failRunning(
      this.options.reconcileReason ?? "startup_reconciliation",
    );

    this.#timer = setInterval(() => void this.tick(), this.#intervalMs);
    this.#timer.unref?.();
    await this.tick();

    return reconciled;
  }

  /**
   * Reclama até `concurrency - em execução` scans e dispara cada um.
   *
   * @returns {Promise<ScanRow[]>} O lote reclamado neste tick.
   */
  async tick(): Promise<ScanRow[]> {
    if (this.#ticking) return [];
    this.#ticking = true;

    try {
      const free = this.#concurrency - this.#inFlight.size;
      if (free <= 0) return [];

      const batch = await this.options.scans.claimBatch(free);
      for (const scan of batch) this.#track(scan);
      return batch;
    } finally {
      this.#ticking = false;
    }
  }

  /** Scans executando agora. */
  get pending(): number {
    return this.#inFlight.size;
  }

  /** Aguarda os scans em execução sem parar o timer. */
  async drain(): Promise<void> {
    await Promise.allSettled([...this.#inFlight]);
  }

  /**
   * Para de pollar e aguarda o que está em voo. Linhas que ainda estiverem
   * `running` quando o processo morrer são encerradas no próximo boot por
   * `failRunning`.
   */
  async stop(): Promise<void> {
    if (this.#timer !== undefined) {
      clearInterval(this.#timer);
      this.#timer = undefined;
    }
    await this.drain();
  }

  #track(scan: ScanRow): void {
    const task = runScan(scan, this.options)
      .then(() => undefined)
      .catch((error: unknown) => {
        this.options.onError?.(error);
      });

    this.#inFlight.add(task);
    void task.finally(() => {
      this.#inFlight.delete(task);
    });
  }
}
