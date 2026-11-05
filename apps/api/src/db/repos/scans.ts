/**
 * @fileoverview Repositório de scans: CRUD tipado e a máquina de estados do worker.
 * @module api/db/repos/scans
 */

import type { Kysely, Updateable } from "kysely";
import { chunkArray } from "../chunks.js";
import type { DB, ScanKind, ScanRow, ScanStatus } from "../schema.js";

const TERMINAL: ReadonlySet<ScanStatus> = new Set([
  "completed",
  "failed",
  "cancelled",
]);

export interface NewScan {
  readonly kind: ScanKind;
  readonly requestor?: string | null;
}

export interface ScanCursor {
  /** Instante ISO-8601 da última linha da página anterior. */
  readonly createdAt: string;
  /** Desempate pelo id da última linha da página anterior. */
  readonly id: string;
}

export interface ListScansOptions {
  readonly status?: ScanStatus;
  /** Keyset pagination: retoma imediatamente após o par `(created_at, id)`. */
  readonly cursor?: ScanCursor;
  readonly limit?: number;
}

const DEFAULT_LIMIT = 50;

export class ScansRepo {
  constructor(private readonly db: Kysely<DB>) {}

  /** @param {NewScan} input - Tipo e solicitante opcional. */
  create(input: NewScan): Promise<ScanRow> {
    return this.db
      .insertInto("scans")
      .values({ kind: input.kind, requestor: input.requestor ?? null })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  /**
   * @param {string} id - UUID do scan.
   * @returns {Promise<ScanRow | undefined>} O scan, se existir.
   */
  byId(id: string): Promise<ScanRow | undefined> {
    return this.db
      .selectFrom("scans")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
  }

  /**
   * Busca em lote sem N+1: 300 ids com chunk de 128 viram 3 statements.
   *
   * @param {readonly string[]} ids - UUIDs.
   * @returns {Promise<ScanRow[]>} Linhas encontradas.
   */
  async byIds(ids: readonly string[]): Promise<ScanRow[]> {
    const rows: ScanRow[] = [];
    for (const chunk of chunkArray(ids, 128)) {
      rows.push(
        ...(await this.db
          .selectFrom("scans")
          .selectAll()
          .where("id", "in", chunk)
          .execute()),
      );
    }
    return rows;
  }

  /** @param {ListScansOptions} [options] - Filtro, cursor e limite. */
  async list(options: ListScansOptions = {}): Promise<ScanRow[]> {
    let query = this.db.selectFrom("scans").selectAll();

    if (options.status !== undefined) {
      query = query.where("status", "=", options.status);
    }
    if (options.cursor !== undefined) {
      const at = new Date(options.cursor.createdAt);
      if (Number.isNaN(at.getTime())) {
        throw new RangeError("cursor.createdAt is not a valid ISO-8601 instant");
      }
      const { id } = options.cursor;

      // Comparação de tupla: sem o desempate por id, linhas com o mesmo
      // `created_at` do cursor nunca voltam e a paginação perde registros.
      query = query.where((eb) =>
        eb.or([
          eb("created_at", "<", at),
          eb.and([eb("created_at", "=", at), eb("id", "<", id)]),
        ]),
      );
    }

    return query
      .orderBy("created_at", "desc")
      .orderBy("id", "desc")
      .limit(options.limit ?? DEFAULT_LIMIT)
      .execute();
  }

  /**
   * Reclama até `limit` scans pendentes numa única instrução.
   *
   * `FOR UPDATE SKIP LOCKED` impede que dois workers peguem o mesmo scan e
   * mantém o índice parcial `scans_pending_idx` em uso.
   *
   * @param {number} limit - Quantidade máxima a reclamar.
   * @returns {Promise<ScanRow[]>} Scans já em `running`.
   */
  claimBatch(limit: number): Promise<ScanRow[]> {
    return this.db
      .updateTable("scans")
      .set({ status: "running", started_at: new Date() })
      .where("id", "in", (eb) =>
        eb
          .selectFrom("scans")
          .select("id")
          .where("status", "=", "pending")
          .orderBy("created_at")
          .limit(limit)
          .forUpdate()
          .skipLocked(),
      )
      .returningAll()
      .execute();
  }

  /**
   * Transição otimista: só atualiza se o scan estiver no estado esperado.
   *
   * Entrar num estado terminal sela `finished_at`; sair dele (requeue) limpa
   * `finished_at`, `content_hash` e `failure_reason`, porque os CHECKs do schema
   * proíbem um scan pendente com campos de desfecho.
   *
   * @param {string} id - UUID do scan.
   * @param {ScanStatus} from - Estado exigido.
   * @param {ScanStatus} to - Estado destino.
   * @param {{ contentHash?: string; failureReason?: string }} [patch] - Campos
   *   exigidos pelos CHECKs do schema (`completed` exige hash).
   * @returns {Promise<ScanRow | undefined>} A linha nova, ou `undefined` se o
   *   scan não estava em `from`.
   */
  transition(
    id: string,
    from: ScanStatus,
    to: ScanStatus,
    patch: { contentHash?: string; failureReason?: string } = {},
  ): Promise<ScanRow | undefined> {
    const values: Updateable<DB["scans"]> = { status: to };

    if (TERMINAL.has(to)) {
      values.finished_at = new Date();
    } else {
      // Os CHECKs de `0004_scans.sql` exigem que um scan não-terminal não
      // carregue campos de desfecho; requeue limpa os resíduos da tentativa.
      values.finished_at = null;
      values.content_hash = null;
      values.failure_reason = null;
      if (to === "running") values.started_at = new Date();
    }

    if (patch.contentHash !== undefined) values.content_hash = patch.contentHash;
    if (patch.failureReason !== undefined) {
      values.failure_reason = patch.failureReason;
    }

    return this.db
      .updateTable("scans")
      .set(values)
      .where("id", "=", id)
      .where("status", "=", from)
      .returningAll()
      .executeTakeFirst();
  }
}
