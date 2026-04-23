ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS byo_db_service_key TEXT;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS supabase_oauth_access_token TEXT;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS supabase_oauth_refresh_token TEXT;
