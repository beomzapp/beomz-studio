-- BEO-329: Per-project database storage/row/table limits table.
-- Tracks plan defaults + extra purchased via storage add-on.

CREATE TABLE IF NOT EXISTS public.project_db_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  plan_storage_mb integer NOT NULL DEFAULT 1024,
  plan_rows integer NOT NULL DEFAULT 100000,
  tables_limit integer NOT NULL DEFAULT 20,
  extra_storage_mb integer NOT NULL DEFAULT 0,
  extra_rows integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(project_id)
);

CREATE OR REPLACE VIEW public.project_db_effective_limits AS
SELECT
  project_id,
  plan_storage_mb + extra_storage_mb AS total_storage_mb,
  plan_rows + extra_rows AS total_rows,
  tables_limit
FROM public.project_db_limits;
