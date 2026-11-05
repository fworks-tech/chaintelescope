/**
 * @fileoverview Repositório de notícias: a única porta de escrita em `news_items`.
 * @module api/db/repos/news
 */

import type { Kysely } from "kysely";
import type { DB } from "../schema.js";

/** Resultado discriminado de uma ingestão idempotente. */
export type IngestResult = { deduped: true } | { created: string };

/** Item já canonicalizado e com o digest calculado pelo serviço de ingestão. */
export interface NewNewsItem {
  readonly title: string;
  readonly url: string;
  readonly publishedAt: string;
  readonly contentHash: string;
  readonly canonicalPayload: string;
}

export class NewsRepo {
  constructor(private readonly db: Kysely<DB>) {}

  /**
   * Insere a notícia se o digest ainda não existir.
   *
   * @param {NewNewsItem} item - Item pronto para persistência.
   * @returns {Promise<IngestResult>} `created` com o id ou `deduped`.
   */
  async insertIfAbsent(item: NewNewsItem): Promise<IngestResult> {
    const row = await this.db
      .insertInto("news_items")
      .values({
        title: item.title,
        url: item.url,
        published_at: item.publishedAt,
        content_hash: item.contentHash,
        canonical_payload: item.canonicalPayload,
      })
      .onConflict((oc) => oc.column("content_hash").doNothing())
      .returning("id")
      .executeTakeFirst();

    return row ? { created: row.id } : { deduped: true };
  }
}
