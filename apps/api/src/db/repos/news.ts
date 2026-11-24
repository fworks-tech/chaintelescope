/**
 * @fileoverview Repositório de notícias: a única porta de escrita em `news_items`.
 * @module api/db/repos/news
 */

import type { Kysely } from "kysely";
import type { DB } from "../schema.js";
import type { IngestResult } from "../types.js";

/** Item já canonicalizado e com o digest calculado pelo serviço de ingestão. */
export interface NewNewsItem {
  readonly title: string;
  readonly url: string;
  readonly source: string;
  readonly tags: readonly string[];
  readonly publishedAt: string;
  readonly contentHash: string;
  readonly canonicalPayload: string;
}

/** Filtros da leitura pública; espelham o `_filter_by_watchlist` do Python. */
export interface NewsFilter {
  /** Ativos em qualquer caixa; vazio significa sem filtro. */
  readonly assets: readonly string[];
  readonly limit: number;
}

/**
 * Escapa curingas do LIKE (`%`, `_`, `\`): o valor é parametrizado pelo
 * Kysely (sem injeção SQL), mas sem escape um `%` digitado vira curinga.
 */
export function escapeLike(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/** Normaliza tags para comparação exata: escritores gravam minúsculas. */
export function normalizeTag(tag: string): string {
  return tag.toLowerCase();
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
        source: item.source,
        tags: [...item.tags],
        published_at: item.publishedAt,
        content_hash: item.contentHash,
        canonical_payload: item.canonicalPayload,
      })
      .onConflict((oc) => oc.column("content_hash").doNothing())
      .returning("id")
      .executeTakeFirst();

    return row ? { created: row.id } : { deduped: true };
  }

  /**
   * Últimas notícias filtradas por watchlist, mais recentes primeiro.
   * Tabela vazia (job ainda não rodou) retorna `[]` — estado válido, não 404.
   */
  async list(filter: NewsFilter) {
    let query = this.db
      .selectFrom("news_items")
      .select(["id", "source", "tags", "title", "url", "published_at"])
      .orderBy("published_at", "desc")
      .limit(filter.limit);

    if (filter.assets.length > 0) {
      // Tags são gravadas minúsculas (writer Python + ingest); o título
      // casa via ILIKE. Uma variante basta — sem fan-out 4n por ativo.
      query = query.where((eb) =>
        eb.or(
          filter.assets.flatMap((asset) => [
            eb("title", "ilike", `%${escapeLike(asset)}%`),
            eb("tags", "@>", [normalizeTag(asset)]),
          ]),
        ),
      );
    }

    return query.execute();
  }
}
