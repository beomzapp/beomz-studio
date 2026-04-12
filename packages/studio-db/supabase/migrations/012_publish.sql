-- Migration 012 — BEO-262: Publish backend
-- Run on: beomz-studio (srflynvdrsdazxvcxmzb)

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS published        BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS published_slug   TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS published_at     TIMESTAMPTZ;
