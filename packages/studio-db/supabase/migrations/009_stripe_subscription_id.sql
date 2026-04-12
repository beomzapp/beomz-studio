-- BEO-263: Plan gating — stripe_subscription_id on orgs
-- Stores the active Stripe subscription ID so we can update/cancel
-- the subscription via the billing portal and webhook handlers.

ALTER TABLE public.orgs
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
