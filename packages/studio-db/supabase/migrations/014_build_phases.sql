-- Migration 014 — BEO-197: Phased build system
-- Run on: beomz-studio (srflynvdrsdazxvcxmzb)

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS build_phases     JSONB,
  ADD COLUMN IF NOT EXISTS current_phase    INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS phases_total     INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS phase_mode       BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.projects.build_phases IS
  'Planned build phases array: [{index, title, description, focus[]}]. Null when phase_mode is false.';
COMMENT ON COLUMN public.projects.current_phase IS
  '1-based index of the phase currently built (0 = not started / no phase mode).';
COMMENT ON COLUMN public.projects.phases_total IS
  'Total number of planned phases (0 when phase_mode is false).';
COMMENT ON COLUMN public.projects.phase_mode IS
  'True when this project is being built in phases (complex prompt detected).';
