-- Migration 010b — BEO-130: beomz_schema_registry
-- Run on: beomz-user-data (snmocsydvcvqerlommek)
-- Purpose: nonce-based ownership registry for per-project schemas

CREATE TABLE IF NOT EXISTS public.beomz_schema_registry (
  schema_name TEXT        PRIMARY KEY,
  nonce       TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

COMMENT ON TABLE public.beomz_schema_registry IS
  'Maps random schema names to their per-project nonces. Only service role can read/write.';

ALTER TABLE public.beomz_schema_registry ENABLE ROW LEVEL SECURITY;

-- Deny all access to anon / authenticated — only service role bypasses RLS
CREATE POLICY "service_only" ON public.beomz_schema_registry
  USING (false);
