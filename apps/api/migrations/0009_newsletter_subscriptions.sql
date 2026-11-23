-- Newsletter subscriptions live in Postgres so the API's 409 is a unique
-- index, not a JSON file rewrite. Enums are CHECKs, not Postgres ENUMs:
-- adding a value stays a normal migration.
CREATE TABLE newsletter_subscriptions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT NOT NULL UNIQUE,
  frequency  TEXT NOT NULL DEFAULT 'Weekly' CHECK (frequency IN ('Daily', 'Weekly', 'Biweekly')),
  format     TEXT NOT NULL DEFAULT 'Summary' CHECK (format IN ('Summary', 'Deep Dive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
