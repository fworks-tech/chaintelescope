-- Scan jobs: a finite state machine whose invariants are enforced by the
-- database, not only by application code.
CREATE TABLE scans (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requestor      UUID REFERENCES users(id) ON DELETE SET NULL,
  kind           TEXT NOT NULL CHECK (kind IN ('upload', 'feed', 'snapshot')),
  status         TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  digest_alg     TEXT NOT NULL DEFAULT 'sha256',
  content_hash   TEXT,
  failure_reason TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at     TIMESTAMPTZ,
  finished_at    TIMESTAMPTZ,
  CHECK ((status IN ('completed', 'failed', 'cancelled')) = (finished_at IS NOT NULL)),
  CHECK ((status = 'completed') = (content_hash IS NOT NULL))
);

-- The daemon polls for pending work only; a partial index keeps that scan tiny.
CREATE INDEX scans_pending_idx ON scans (created_at) WHERE status = 'pending';
CREATE INDEX scans_requestor_idx ON scans (requestor, created_at DESC);

CREATE TABLE scan_artifacts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id       UUID NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  content_hash  TEXT NOT NULL UNIQUE,
  bytes         BIGINT NOT NULL CHECK (bytes >= 0),
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE scan_matches (
  scan_id      UUID NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  content_hash TEXT NOT NULL,
  matched_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (scan_id, content_hash)
);

CREATE TABLE blocklist_hashes (
  content_hash TEXT PRIMARY KEY,
  added_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  added_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
