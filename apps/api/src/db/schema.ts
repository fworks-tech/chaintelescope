/**
 * @fileoverview Interface `DB` escrita à mão espelhando `migrations/*.sql`.
 * Se a migração mudar e este arquivo não, o typecheck quebra — é o ponto.
 * @module api/db/schema
 */

import type { ColumnType, Generated, Selectable } from "kysely";

/** Leitura devolve `Date`; escrita aceita `Date` ou string ISO. */
type Timestamp = ColumnType<Date, Date | string, Date | string>;

export type ScanKind = "upload" | "feed" | "snapshot";

export type ScanStatus =
  "pending" | "running" | "completed" | "failed" | "cancelled";

export interface AssetsTable {
  symbol: string;
  name: string | null;
  coingecko_id: string | null;
  binance_pair: string | null;
  coinbase_id: string | null;
}

export interface NewsItemsTable {
  id: Generated<string>;
  content_hash: string;
  title: string;
  url: string;
  published_at: Timestamp;
  canonical_payload: string;
  first_seen_at: Generated<Date>;
}

export interface SnapshotsTable {
  id: Generated<string>;
  snapshot_hash: string;
  /** `JSONB`: o `pg` devolve objeto já parseado, nunca string. */
  payload: ColumnType<unknown, string, string>;
  created_at: Generated<Date>;
}

export interface UsersTable {
  id: Generated<string>;
  email: string;
  password_hash: string;
  role: Generated<"user" | "admin">;
  created_at: Generated<Date>;
}

export interface RefreshTokensTable {
  id: Generated<string>;
  user_id: string;
  family_id: string;
  token_hash: string;
  /** Token que este substituiu; `null` no primeiro da família (0008). */
  rotated_from: string | null;
  rotated_at: Timestamp | null;
  revoked_at: Timestamp | null;
  expires_at: Timestamp;
}

export interface ScansTable {
  id: Generated<string>;
  requestor: string | null;
  kind: ScanKind;
  status: Generated<ScanStatus>;
  digest_alg: Generated<string>;
  content_hash: string | null;
  failure_reason: string | null;
  /** Sem FK: o scan sobrevive à remoção do asset (ver `0007`). */
  asset_symbol: string | null;
  duration_ms: number | null;
  created_at: Generated<Date>;
  started_at: Timestamp | null;
  finished_at: Timestamp | null;
}

export interface ScanArtifactsTable {
  id: Generated<string>;
  scan_id: string;
  content_hash: string;
  bytes: ColumnType<string, string | number, string | number>;
  first_seen_at: Generated<Date>;
}

export interface ScanMatchesTable {
  scan_id: string;
  content_hash: string;
  matched_at: Generated<Date>;
}

export interface BlocklistHashesTable {
  content_hash: string;
  added_by: string | null;
  added_at: Generated<Date>;
}

export interface NewsletterSubscriptionsTable {
  id: Generated<string>;
  email: string;
  frequency: "Daily" | "Weekly" | "Biweekly";
  format: "Summary" | "Deep Dive";
  created_at: Generated<Date>;
}

export interface DB {
  assets: AssetsTable;
  news_items: NewsItemsTable;
  snapshots: SnapshotsTable;
  users: UsersTable;
  refresh_tokens: RefreshTokensTable;
  scans: ScansTable;
  scan_artifacts: ScanArtifactsTable;
  scan_matches: ScanMatchesTable;
  blocklist_hashes: BlocklistHashesTable;
  newsletter_subscriptions: NewsletterSubscriptionsTable;
}

export type ScanRow = Selectable<ScansTable>;
export type NewsRow = Selectable<NewsItemsTable>;
export type AssetRow = Selectable<AssetsTable>;
