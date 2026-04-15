-- BEO-326: phase file diff observability
-- Stores per-phase diff { created, modified, unchangedCount } for each generation row.

ALTER TABLE public.build_telemetry
  ADD COLUMN IF NOT EXISTS phase_file_diff JSONB DEFAULT NULL;
