/**
 * @fileoverview Repositório de snapshots de mercado.
 * @module api/db/repos/snapshots
 */

import type { Kysely } from "kysely";
import type { DB } from "../schema.js";
import type { IngestResult } from "../types.js";

export class SnapshotsRepo {
  constructor(private readonly db: Kysely<DB>) {}

  /**
   * Insere o snapshot se o digest ainda não existir.
   *
   * @param {{ snapshotHash: string; payload: string }} input - Digest e payload canônico.
   * @returns {Promise<IngestResult>} `created` com o id ou `deduped`.
   */
  async insertIfAbsent(input: {
    snapshotHash: string;
    payload: string;
  }): Promise<IngestResult> {
    const row = await this.db
      .insertInto("snapshots")
      .values({ snapshot_hash: input.snapshotHash, payload: input.payload })
      .onConflict((oc) => oc.column("snapshot_hash").doNothing())
      .returning("id")
      .executeTakeFirst();

    return row ? { created: row.id } : { deduped: true };
  }
}
