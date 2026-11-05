-- Metrics the orchestrator records and the analytics queries (#114) read.
-- `asset_symbol` carries no FK on purpose: a scan outlives the asset registry,
-- and the coverage report exists precisely to surface orphaned symbols.
ALTER TABLE scans ADD COLUMN asset_symbol TEXT;
ALTER TABLE scans ADD COLUMN duration_ms INTEGER CHECK (duration_ms >= 0);

CREATE INDEX scans_asset_symbol_idx ON scans (asset_symbol);
