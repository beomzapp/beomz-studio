-- Migration 010 — BEO-130: Built-in DB + BYO Supabase
-- Run on: beomz-studio (srflynvdrsdazxvcxmzb)

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS database_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS db_schema        TEXT,
  ADD COLUMN IF NOT EXISTS db_nonce         TEXT,
  ADD COLUMN IF NOT EXISTS db_provider      TEXT,
  ADD COLUMN IF NOT EXISTS db_config        JSONB,
  ADD COLUMN IF NOT EXISTS db_wired         BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.projects.db_schema IS
  'Random schema name in beomz-user-data (app_ + 32 hex chars). Never derived from project UUID.';
COMMENT ON COLUMN public.projects.db_nonce IS
  'Per-project HMAC nonce for beomz_db RPC access verification. Server-side only — never in client response.';
COMMENT ON COLUMN public.projects.db_config IS
  'BYO Supabase credentials: { url, anonKey }. Service role key is never stored.';
