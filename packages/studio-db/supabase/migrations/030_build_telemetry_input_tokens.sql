-- BEO-652: persist full token usage, not output tokens alone.

ALTER TABLE public.build_telemetry
  ADD COLUMN IF NOT EXISTS input_tokens INTEGER NOT NULL DEFAULT 0;
