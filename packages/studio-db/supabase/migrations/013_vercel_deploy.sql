-- Migration 013 — Vercel deploy columns
-- Run on: beomz-studio (srflynvdrsdazxvcxmzb)

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS beomz_app_url        TEXT,
  ADD COLUMN IF NOT EXISTS beomz_app_deployed_at TIMESTAMPTZ;
