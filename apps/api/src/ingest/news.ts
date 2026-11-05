/**
 * @fileoverview Ingestão idempotente de notícias e alertas com deduplicação orientada a conteúdo (Content-Addressed).
 * @module api/ingest/news
 */

import { canonicalize, type JsonValue } from "@chaintelescope/shared";
import type { NewsRepo } from "../db/repos/news.js";
import type { IngestResult } from "../db/types.js";
import { digest } from "../hashing/core.js";

/**
 * Payload bruto de um item de notícia recebido de fontes externas (feeds RSS/Atom).
 */
export interface RawNewsItem {
  /** Identificador externo opcional fornecido pela fonte. */
  readonly id?: string | undefined;
  /** Título canônico da notícia ou alerta. */
  readonly title: string;
  /** URL canônica do artigo original. */
  readonly url: string;
  /** Data e hora de publicação oficial em formato ISO-8601. */
  readonly publishedAt: string;
  /**
   * Timestamp de quando o item foi lido do socket de rede.
   * Campo volátil: excluído explicitamente do hash canônico para preservar a identidade do dado.
   */
  readonly fetchedAt?: string | undefined;
  /**
   * Número de tentativas de busca pelo coletor.
   * Campo volátil: excluído explicitamente do hash canônico.
   */
  readonly fetchAttempt?: number | undefined;
}

/**
 * Processa a ingestão de um item de notícia de forma idempotente.
 *
 * **Princípio de Arquitetura:**
 * 1. Isola os campos invariantes do domínio (`title`, `url`, `publishedAt`), descartando metadados efêmeros.
 * 2. Serializa a estrutura canônica (RFC 8785) e calcula seu digest SHA-256.
 * 3. Delega a escrita ao repositório, que executa `ON CONFLICT (content_hash) DO NOTHING`.
 *
 * @param {RawNewsItem} item - Item bruto recebido do coletor.
 * @param {NewsRepo} repo - Repositório de notícias (raiz ou transação).
 * @returns {Promise<IngestResult>} Indica se o item foi deduplicado ou criado com seu respectivo ID.
 */
export async function ingestNewsItem(
  item: RawNewsItem,
  repo: NewsRepo,
): Promise<IngestResult> {
  // Constrói o pre-image canônico estritamente com campos imutáveis de negócio
  const canonicalPayload: JsonValue = {
    publishedAt: item.publishedAt,
    title: item.title,
    url: item.url,
  };

  const canonicalBytes = canonicalize(canonicalPayload);
  const contentHash = (await digest(canonicalBytes, "sha256")).hex;

  return repo.insertIfAbsent({
    title: item.title,
    url: item.url,
    publishedAt: item.publishedAt,
    contentHash,
    canonicalPayload: canonicalBytes.toString("utf8"),
  });
}
