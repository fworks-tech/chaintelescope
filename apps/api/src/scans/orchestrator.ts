/**
 * @fileoverview Execução de um scan já reclamado: hash, artefato e transição.
 * @module api/scans/orchestrator
 */

import type { Readable } from "node:stream";
import type { ScanArtifactsRepo } from "../db/repos/artifacts.js";
import type { ScansRepo } from "../db/repos/scans.js";
import type { ScanRow } from "../db/schema.js";
import { scanStream } from "../hashing/scan-pipeline.js";
import type { ScanCanceller } from "./cancellation.js";

/** Fonte de bytes de um scan. */
export interface ScanSource {
  readonly stream: Readable;
  readonly totalBytes?: number;
}

export interface RunScanDeps {
  readonly scans: ScansRepo;
  readonly artifacts: ScanArtifactsRepo;
  readonly canceller: ScanCanceller;
  /**
   * Resolve a origem dos bytes por tipo de scan. Upload entrega a própria
   * requisição; `feed`/`snapshot` dependem de fetchers que ainda não existem
   * (#109 e o port do provedor de mercado).
   */
  readonly sourceFor: (scan: ScanRow) => ScanSource | undefined;
}

export class ScanRaceError extends Error {
  constructor(readonly scanId: string) {
    super(`scan ${scanId} was already finalized by another worker`);
    this.name = "ScanRaceError";
  }
}

const MAX_REASON = 200;

function reasonOf(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, MAX_REASON);
}

/**
 * Executa um scan já reclamado (`claimBatch` já o deixou em `running`).
 *
 * Se a transição final não encontrar a linha, o scan foi cancelado ou roubado
 * por outro worker: lança `ScanRaceError` em vez de sobrescrever o desfecho.
 *
 * @param {ScanRow} scan - Linha reclamada.
 * @param {RunScanDeps} deps - Repositórios, canceller e resolvedor de fonte.
 * @returns {Promise<ScanRow>} A linha no estado terminal.
 * @throws {ScanRaceError} Se outro worker/cancelamento finalizou o scan antes.
 */
export async function runScan(
  scan: ScanRow,
  deps: RunScanDeps,
): Promise<ScanRow> {
  if (scan.status !== "running") {
    throw new Error(`runScan expects a claimed scan, got ${scan.status}`);
  }

  const controller = deps.canceller.register(scan.id);
  const startedAt = performance.now();
  let outcome: ScanRow | undefined;

  try {
    const source = deps.sourceFor(scan);

    if (!source) {
      outcome = await deps.scans.transition(scan.id, "running", "failed", {
        failureReason: "no_source_adapter",
        durationMs: 0,
      });
    } else {
      const result = await scanStream(source.stream, {
        signal: controller.signal,
        ...(source.totalBytes === undefined
          ? {}
          : { totalBytes: source.totalBytes }),
      });

      // O artefato é endereçado por conteúdo: um segundo upload do mesmo
      // arquivo reaproveita a linha existente.
      await deps.artifacts.insertIfAbsent({
        scanId: scan.id,
        contentHash: result.digest.hex,
        bytes: result.bytes,
      });

      outcome = await deps.scans.transition(scan.id, "running", "completed", {
        contentHash: result.digest.hex,
        digestAlg: result.digest.alg,
        durationMs: Math.round(result.millis),
      });
    }
  } catch (error) {
    const durationMs = Math.round(performance.now() - startedAt);
    outcome = controller.signal.aborted
      ? await deps.scans.transition(scan.id, "running", "cancelled", {
          durationMs,
        })
      : await deps.scans.transition(scan.id, "running", "failed", {
          failureReason: reasonOf(error),
          durationMs,
        });
  } finally {
    deps.canceller.release(scan.id);
  }

  if (!outcome) throw new ScanRaceError(scan.id);
  return outcome;
}

/**
 * Cancela um scan. Se ele roda neste processo, aborta o stream e quem persiste
 * o `cancelled` é o `runScan`; senão encerra a linha direto no banco.
 *
 * @returns {Promise<ScanRow | undefined>} A linha `cancelled`, ou `undefined`
 *   quando o abort local ficou a cargo do worker (ou nada mudou).
 */
export async function cancelScan(
  id: string,
  deps: Pick<RunScanDeps, "scans" | "canceller">,
): Promise<ScanRow | undefined> {
  if (deps.canceller.cancel(id)) return undefined;

  return (
    (await deps.scans.transition(id, "pending", "cancelled")) ??
    (await deps.scans.transition(id, "running", "cancelled"))
  );
}
