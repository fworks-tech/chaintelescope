-- Rotation lineage: which token this one replaced. Kept nullable because the
-- first token of a family has no predecessor.
ALTER TABLE refresh_tokens
  ADD COLUMN rotated_from UUID REFERENCES refresh_tokens(id) ON DELETE SET NULL;
