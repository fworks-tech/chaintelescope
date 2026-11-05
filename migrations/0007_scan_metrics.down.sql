DROP INDEX scans_asset_symbol_idx;
ALTER TABLE scans DROP COLUMN duration_ms;
ALTER TABLE scans DROP COLUMN asset_symbol;
