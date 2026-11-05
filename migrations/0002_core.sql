-- Content-addressed core: every ingested artifact is identified by its digest.
CREATE TABLE assets (
  symbol       TEXT PRIMARY KEY,
  name         TEXT,
  coingecko_id TEXT UNIQUE,
  binance_pair TEXT UNIQUE,
  coinbase_id  TEXT UNIQUE
);

CREATE TABLE news_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_hash  TEXT NOT NULL UNIQUE,
  title         TEXT NOT NULL,
  url           TEXT NOT NULL,
  published_at  TIMESTAMPTZ NOT NULL,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX news_items_published_at_idx ON news_items (published_at DESC);

CREATE TABLE snapshots (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_hash TEXT NOT NULL UNIQUE,
  payload       JSONB NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
