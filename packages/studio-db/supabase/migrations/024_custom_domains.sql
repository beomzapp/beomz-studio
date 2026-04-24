-- Migration 024 — BEO-556: custom domains for published apps

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS custom_domains TEXT[] DEFAULT '{}';

COMMENT ON COLUMN public.projects.custom_domains IS
  'User-managed custom domains attached to the published Vercel deployment.';
