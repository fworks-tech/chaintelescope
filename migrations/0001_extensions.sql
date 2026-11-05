-- gen_random_uuid() ships with pgcrypto; kept explicit so the schema works on
-- any postgres:16 image variant and on older clusters.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
