/**
 * @fileoverview Consultas analíticas: o SQL é o artefato, carregado de
 * `apps/api/sql/` em vez de virar string no meio do TypeScript.
 * @module api/db/analytics
 */

import { readFileSync } from "node:fs";
import { sql, type Kysely } from "kysely";
import type { DB } from "./schema.js";

function load(name: string): string {
  // `../../sql/` resolve igual a partir de `src/db` e de `dist/db`.
  return readFileSync(new URL(`../../sql/${name}.sql`, import.meta.url), "utf8");
}

const QUERIES = {
  scanHistory: load("analytics_scan_history"),
  coverage: load("analytics_coverage"),
  blocklist: load("analytics_blocklist"),
} as const;

export interface ScanHistoryRow {
  symbol: string;
  name: string | null;
  total_scans: number;
  completed_scans: number;
  failed_scans: number;
  running_scans: number;
  blocked_matches: number;
  avg_duration_ms: number;
  last_scan_at: Date;
}

export interface CoverageRow {
  symbol: string;
  asset_name: string;
  total_scans: number;
  running_scans: number;
  blocked_hits: number;
  avg_duration_ms: number;
}

export interface BlocklistRow {
  content_hash: string;
  blocked_failed: number;
  blocked_clean: number;
  total_hits: number;
  cumulative_hits: number;
  added_at: Date;
}

export class AnalyticsQueries {
  constructor(private readonly db: Kysely<DB>) {}

  /** @returns {Promise<ScanHistoryRow[]>} Só assets que já foram escaneados. */
  scanHistory(): Promise<ScanHistoryRow[]> {
    return this.#run<ScanHistoryRow>(QUERIES.scanHistory);
  }

  /** @returns {Promise<CoverageRow[]>} Todo asset, mais os órfãos de `scans`. */
  coverage(): Promise<CoverageRow[]> {
    return this.#run<CoverageRow>(QUERIES.coverage);
  }

  /** @returns {Promise<BlocklistRow[]>} Inclui hashes nunca atingidos. */
  blocklist(): Promise<BlocklistRow[]> {
    return this.#run<BlocklistRow>(QUERIES.blocklist);
  }

  async #run<R>(text: string): Promise<R[]> {
    const result = await sql.raw<R>(text).execute(this.db);
    return result.rows;
  }
}
