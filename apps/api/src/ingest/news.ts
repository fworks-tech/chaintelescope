/**
 * @fileoverview Ingestão idempotente de notícias e alertas com deduplicação orientada a conteúdo (Content-Addressed).
 * @module api/ingest/news
 */

import { canonicalize, type JsonValue } from "@hasheyes/shared";
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
 * Representação da tupla retornada pela tabela `news_items` no PostgreSQL.
 */
export interface NewsRow {
  /** Identificador primário UUID persistido no banco. */
  readonly id: string;
  /** Hash SHA-256 canônico utilizado como chave de unicidade. */
  readonly content_hash: string;
}

/**
 * Contrato mínimo para abstração de consultas SQL no cliente de banco de dados.
 */
export interface IngestContext {
  /**
   * Executa uma consulta parametrizada contra o banco de dados.
   * @template T - Tipo estrutural das linhas retornadas.
   * @param {string} sql - Comando SQL com marcadores dimensionados ($1, $2, etc.).
   * @param {unknown[]} [params] - Vetor de parâmetros de substituição limpos de injeção SQL.
   * @returns {Promise<{ rows: T[] }>} Objeto contendo o conjunto de tuplas retornadas.
   */
  query<T = unknown>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

/**
 * Resultado discriminado da operação de ingestão de notícias.
 */
export type IngestResult = { deduped: true } | { created: string };

/**
 * Processa a ingestão de um item de notícia de forma idempotente.
 *
 * **Princípio de Arquitetura:**
 * 1. Isola os campos invariantes do domínio (`title`, `url`, `publishedAt`), descartando metadados efêmeros.
 * 2. Serializa a estrutura canônica (RFC 8785) e calcula seu digest SHA-256.
 * 3. Executa a inserção atômica via `ON CONFLICT (content_hash) DO NOTHING`.
 *
 * @param {RawNewsItem} item - Item bruto recebido do coletor.
 * @param {IngestContext} ctx - Contexto de banco de dados para execução da transação/query.
 * @returns {Promise<IngestResult>} Indica se o item foi deduplicado ou criado com seu respectivo ID.
 */
export async function ingestNewsItem(
  item: RawNewsItem,
  ctx: IngestContext,
): Promise<IngestResult> {
  // Constrói o pre-image canônico estritamente com campos imutáveis de negócio
  const canonicalPayload: JsonValue = {
    publishedAt: item.publishedAt,
    title: item.title,
    url: item.url,
  };

  const canonicalBytes = canonicalize(canonicalPayload);
  const contentHash = (await digest(canonicalBytes, "sha256")).hex;

  // A cláusula ON CONFLICT evita bloqueios distribuídos e garante unicidade atômica no banco de dados
  const res = await ctx.query<NewsRow>(
    `INSERT INTO news_items (title, url, published_at, content_hash, canonical_payload)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (content_hash) DO NOTHING
     RETURNING id, content_hash`,
    [
      item.title,
      item.url,
      item.publishedAt,
      contentHash,
      canonicalBytes.toString("utf8"),
    ],
  );

  const inserted = res.rows[0];
  if (!inserted) {
    // 0 linhas retornadas indicam que o hash já existia no índice único
    return { deduped: true };
  }

  return { created: inserted.id };
}
