ALTER TABLE public.orgs
  ADD COLUMN IF NOT EXISTS payment_failed_at timestamptz DEFAULT NULL;

NOTIFY pgrst, 'reload schema';
