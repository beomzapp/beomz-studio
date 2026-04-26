-- BEO-615: Email/password auth + transactional email notifications.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS password_hash TEXT,
  ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_verify_token TEXT,
  ADD COLUMN IF NOT EXISTS email_verify_expires TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS password_reset_token TEXT,
  ADD COLUMN IF NOT EXISTS password_reset_expires TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_credits_low_email TIMESTAMPTZ;

-- Existing Google OAuth users should be treated as verified.
UPDATE public.users
SET email_verified = true
WHERE password_hash IS NULL;

CREATE INDEX IF NOT EXISTS users_email_verify_token_idx
  ON public.users (email_verify_token)
  WHERE email_verify_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS users_password_reset_token_idx
  ON public.users (password_reset_token)
  WHERE password_reset_token IS NOT NULL;
