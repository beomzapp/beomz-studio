ALTER TABLE project_db_limits
  ADD COLUMN IF NOT EXISTS neon_project_id text,
  ADD COLUMN IF NOT EXISTS db_url text;
