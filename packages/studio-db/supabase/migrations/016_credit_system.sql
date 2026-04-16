-- BEO-322: Add multi-bucket credit system columns to orgs table.
-- Three separate credit buckets: monthly_credits, rollover_credits (existing topup_credits stays).
-- Downgrade scheduling fields: downgrade_at_period_end, pending_plan.
-- Billing period tracking: credits_period_start, credits_period_end.

ALTER TABLE public.orgs
  ADD COLUMN IF NOT EXISTS monthly_credits  INTEGER      NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rollover_credits INTEGER      NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rollover_cap     INTEGER      NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credits_period_start TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS credits_period_end   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS downgrade_at_period_end BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pending_plan     TEXT;
