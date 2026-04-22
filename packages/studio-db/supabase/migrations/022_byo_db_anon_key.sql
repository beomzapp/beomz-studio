-- Migration 022 — BEO-522: BYO Supabase anon key on projects

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS byo_db_anon_key TEXT;

COMMENT ON COLUMN public.projects.byo_db_anon_key IS
  'Optional BYO Supabase anon key used for generated app previews and runtime wiring.';
