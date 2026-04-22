-- Migration 021 — BEO-445: BYO Postgres connection string on projects

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS byo_db_url TEXT;

COMMENT ON COLUMN public.projects.byo_db_url IS
  'Optional BYO Postgres connection string used for generated app previews and runtime wiring.';
