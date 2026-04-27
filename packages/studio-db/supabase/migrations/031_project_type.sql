-- Migration 031 — BEO-670: project type on projects
-- Run on: beomz-studio (srflynvdrsdazxvcxmzb)

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS project_type TEXT NOT NULL DEFAULT 'app'
  CHECK (project_type IN ('app', 'website'));

NOTIFY pgrst, 'reload schema';
