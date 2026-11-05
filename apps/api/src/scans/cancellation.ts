/**
 * @fileoverview Registro de cancelamento dos scans em execução no processo.
 * @module api/scans/cancellation
 */

/**
 * Só enxerga scans rodando neste processo. Um scan `running` de outra instância
 * é encerrado pelo banco (`transition`), não por aqui — o worker distante perde
 * a transição otimista e para de escrever.
 */
export class ScanCanceller {
  readonly #active = new Map<string, AbortController>();

  register(id: string): AbortController {
    const controller = new AbortController();
    this.#active.set(id, controller);
    return controller;
  }

  release(id: string): void {
    this.#active.delete(id);
  }

  /** @returns {boolean} `true` se havia um scan local para abortar. */
  cancel(id: string): boolean {
    const controller = this.#active.get(id);
    if (!controller) return false;
    controller.abort();
    return true;
  }

  get size(): number {
    return this.#active.size;
  }
}
