/**
 * @fileoverview Repositório de artefatos: conteúdo deduplicado por digest.
 * @module api/db/repos/artifacts
 */

import type { Kysely } from "kysely";
import type { DB } from "../schema.js";
import type { IngestResult } from "../types.js";

export interface NewScanArtifact {
  readonly scanId: string;
  readonly contentHash: string;
  readonly bytes: number;
}

export class ScanArtifactsRepo {
  constructor(private readonly db: Kysely<DB>) {}

  /**
   * `content_hash` é UNIQUE global: reenviar o mesmo arquivo não cria um
   * segundo artefato, apenas reaproveita o existente.
   *
   * @param {NewScanArtifact} input - Scan, digest e tamanho.
   * @returns {Promise<IngestResult>} `created` com o id ou `deduped`.
   */
  async insertIfAbsent(input: NewScanArtifact): Promise<IngestResult> {
    const row = await this.db
      .insertInto("scan_artifacts")
      .values({
        scan_id: input.scanId,
        content_hash: input.contentHash,
        bytes: input.bytes,
      })
      .onConflict((oc) => oc.column("content_hash").doNothing())
      .returning("id")
      .executeTakeFirst();

    return row ? { created: row.id } : { deduped: true };
  }
}
