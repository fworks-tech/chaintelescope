-- Found by test/repos.test.ts: 0004 declared `status NOT NULL` without a
-- default, so an INSERT that does not name a status fails. A new scan always
-- starts pending; let the database say so.
ALTER TABLE scans ALTER COLUMN status SET DEFAULT 'pending';
