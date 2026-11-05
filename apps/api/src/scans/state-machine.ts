/**
 * @fileoverview Máquina de estados do scan: as arestas permitidas ficam num só
 * lugar, em vez de espalhadas em `if (status === ...)`.
 * @module api/scans/state-machine
 */

import type { ScanStatus } from "../db/schema.js";

export const SCAN_STATUSES: readonly ScanStatus[] = [
  "pending",
  "running",
  "completed",
  "failed",
  "cancelled",
];

/**
 * Arestas permitidas.
 *
 * `failed → pending` é o retry: o issue #111 desenhava `failed: []`, mas o
 * `transition()` já suporta requeue desde o #149 e o orquestrador precisa
 * reenfileirar uma tentativa que falhou.
 */
export const TRANSITIONS: Record<ScanStatus, readonly ScanStatus[]> = {
  pending: ["running", "cancelled"],
  running: ["completed", "failed", "cancelled"],
  completed: [],
  failed: ["pending"],
  cancelled: [],
};

export class InvalidTransitionError extends Error {
  constructor(
    readonly from: ScanStatus,
    readonly to: ScanStatus,
  ) {
    super(`invalid scan transition: ${from} -> ${to}`);
    this.name = "InvalidTransitionError";
  }
}

/**
 * @param {ScanStatus} from - Estado atual.
 * @param {ScanStatus} to - Estado destino.
 * @throws {InvalidTransitionError} Se a aresta não existir.
 */
export function assertTransition(from: ScanStatus, to: ScanStatus): void {
  if (!TRANSITIONS[from].includes(to)) {
    throw new InvalidTransitionError(from, to);
  }
}
