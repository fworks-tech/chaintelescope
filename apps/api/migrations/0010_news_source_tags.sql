-- News readers (GET /api/news) need source/tags without parsing
-- canonical_payload. Defaults keep pre-existing rows valid.
ALTER TABLE news_items ADD COLUMN source TEXT NOT NULL DEFAULT '';
ALTER TABLE news_items ADD COLUMN tags TEXT[] NOT NULL DEFAULT '{}';
