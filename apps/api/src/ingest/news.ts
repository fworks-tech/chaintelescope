/**
 * @fileoverview Ingestão idempotente de notícias e alertas com deduplicação orientada a conteúdo (Content-Addressed).
 * @module api/ingest/news
 */

import { canonicalize, type JsonValue } from "@chaintelescope/shared";
import type { NewsRepo } from "../db/repos/news.js";
import type { IngestResult } from "../db/types.js";
import { digest } from "../hashing/core.js";
import { ValidationError } from "../errors/index.js";

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
  /** Fonte (domínio do feed); vazia quando o coletor não informa. */
  readonly source?: string | undefined;
  /** Tags do coletor (ativos, categorias); vazias quando ausentes. */
  readonly tags?: readonly string[] | undefined;
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

/** Python `datetime.isoformat()` lexical form: UTC, microseconds only when present. */
export function normalizeNewsPublishedAt(value: string): string {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})?$/.exec(
      value,
    );
  if (match === null) {
    throw new ValidationError("Invalid publication date");
  }

  const [
    year = NaN,
    month = NaN,
    day = NaN,
    hour = NaN,
    minute = NaN,
    second = NaN,
  ] = match.slice(1, 7).map((part) => Number(part));
  const calendarCheck = new Date(
    Date.UTC(year, month - 1, day, hour, minute, second),
  );
  if (
    Number.isNaN(calendarCheck.getTime()) ||
    calendarCheck.toISOString().slice(0, 19) !== value.slice(0, 19)
  ) {
    throw new ValidationError("Invalid publication date");
  }

  const offset = match[8];
  const parsed = new Date(offset === undefined ? `${value}Z` : value);
  if (Number.isNaN(parsed.getTime())) {
    throw new ValidationError("Invalid publication date");
  }

  const fraction = match[7];
  const microseconds = fraction?.slice(0, 6).padEnd(6, "0") ?? "000000";
  const suffix = microseconds === "000000" ? "" : `.${microseconds}`;
  return `${parsed.toISOString().slice(0, 19)}${suffix}+00:00`;
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
  // URLs executáveis nunca entram no banco: vêm de feeds não confiáveis e
  // qualquer cliente futuro as renderizaria (stored XSS na web de hoje).
  if (!/^https?:\/\//.test(item.url)) {
    throw new ValidationError("Non-http(s) article URL");
  }

  // Constrói o pre-image canônico estritamente com campos imutáveis de negócio
  const publishedAt = normalizeNewsPublishedAt(item.publishedAt);
  const canonicalPayload: JsonValue = {
    publishedAt,
    title: item.title,
    url: item.url,
  };

  const canonicalBytes = canonicalize(canonicalPayload);
  const contentHash = (await digest(canonicalBytes, "sha256")).hex;

  return repo.insertIfAbsent({
    title: item.title,
    url: item.url,
    source: item.source ?? "",
    // Tags gravadas minúsculas: a leitura compara exato (case único canônico).
    tags: (item.tags ?? []).map((tag) => tag.toLowerCase()),
    publishedAt,
    contentHash,
    canonicalPayload: canonicalBytes.toString("utf8"),
  });
}
