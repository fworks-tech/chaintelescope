/**
 * @fileoverview Ingestão de snapshots de mercado baseada em endereçamento por conteúdo.
 * @module api/ingest/snapshot
 */

import { canonicalize, type JsonValue } from "@hasheyes/shared";
import { digest } from "../hashing/core.js";
import type { IngestContext } from "./news.js";

/**
 * Estrutura de dados representativa de um snapshot de mercado financeiro em uma janela de tempo.
 */
export interface MarketSnapshotCandidate {
  /** Lista de pares ou tickers monitorados (ex.: ['BTC/USD', 'ETH/USD']). */
  readonly watchlist: string[];
  /** Janela de agregação temporal (ex.: '1m', '5m', '1h'). */
  readonly window: string;
  /** Timestamp da época (epoch em ms) referente ao fechamento da vela/janela. */
  readonly timestamp: number;
  /** Métricas agregadas indexadas por chave (ex.: volume, vwap, desvio padrão). */
  readonly metrics: Record<string, number>;
}

/**
 * Persiste um snapshot de mercado de maneira idempotente.
 * Normaliza o vetor da watchlist para assegurar ordenação antes da serialização.
 *
 * @param {MarketSnapshotCandidate} snapshot - Objeto de dados do mercado capturado.
 * @param {IngestContext} ctx - Contexto de banco de dados.
 * @returns {Promise<{ deduped: true } | { created: string }>} Resultado da inserção no PostgreSQL.
 */
export async function ingestSnapshot(
  snapshot: MarketSnapshotCandidate,
  ctx: IngestContext,
): Promise<{ deduped: true } | { created: string }> {
  // Ordena a lista de ativos para impedir que ordens arbitrárias alterem o hash
  const canonicalPayload: JsonValue = {
    metrics: snapshot.metrics,
    timestamp: snapshot.timestamp,
    watchlist: [...snapshot.watchlist].sort(),
    window: snapshot.window,
  };

  const canonicalBytes = canonicalize(canonicalPayload);
  const snapshotHash = (await digest(canonicalBytes, "sha256")).hex;

  const res = await ctx.query<{ id: string }>(
    `INSERT INTO snapshots (snapshot_hash, payload)
     VALUES ($1, $2)
     ON CONFLICT (snapshot_hash) DO NOTHING
     RETURNING id`,
    [snapshotHash, canonicalBytes.toString("utf8")],
  );

  const row = res.rows[0];
  if (!row) {
    return { deduped: true };
  }

  return { created: row.id };
}
