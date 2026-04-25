-- Migration 025 — BEO-576: persist custom domain active status on project record

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS custom_domain  TEXT,
  ADD COLUMN IF NOT EXISTS domain_status  TEXT;

COMMENT ON COLUMN public.projects.custom_domain IS
  'The currently active custom domain (set when Vercel verifies domain ownership).';

COMMENT ON COLUMN public.projects.domain_status IS
  'Status of the active custom domain: ''active'' when live, NULL when none.';
