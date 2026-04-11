-- BEO-261: Credits & Payments system
-- Ports V1's (apps/builder) credit system to V2's org-based model.
-- V1 reference: supabase/migrations/20260312_usage_deduction_atomic.sql
--               supabase/migrations/20260312_credit_system_stability.sql

-- ── 1. Upgrade orgs ──────────────────────────────────────────────────────────

-- Upgrade credits to NUMERIC(10,1) — V1 uses NUMERIC(10,1) for decimal amounts
-- (e.g. 3.8, 5.5, 19.7 from the 3.0 + tokens/600 formula)
ALTER TABLE public.orgs
  ALTER COLUMN credits TYPE NUMERIC(10,1) USING credits::NUMERIC(10,1);

-- Two-pool model: topup_credits (purchased) consumed FIRST, never expire
-- Mirrors V1 profiles.topup_credits
ALTER TABLE public.orgs
  ADD COLUMN IF NOT EXISTS topup_credits NUMERIC(10,1) NOT NULL DEFAULT 0;

-- Stripe customer linkage — for webhook → org lookup and portal reuse
-- Mirrors V1 profiles.stripe_customer_id
ALTER TABLE public.orgs
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

-- Free tier lazy daily reset — stores last reset timestamp
-- Reset happens on next build request (no cron), mirrors V1 profiles.daily_reset_at
ALTER TABLE public.orgs
  ADD COLUMN IF NOT EXISTS daily_reset_at TIMESTAMPTZ;

-- ── 2. Enrich build_telemetry ─────────────────────────────────────────────────

-- Upgrade credits_used to NUMERIC for decimal amounts
ALTER TABLE public.build_telemetry
  ALTER COLUMN credits_used TYPE NUMERIC(10,1) USING credits_used::NUMERIC(10,1);

-- Token count — V1's ai_generation_logs.output_tokens equivalent
ALTER TABLE public.build_telemetry
  ADD COLUMN IF NOT EXISTS output_tokens INTEGER NOT NULL DEFAULT 0;

-- Cost estimate — V1's ai_generation_logs.cost_usd equivalent ($0.045/credit)
ALTER TABLE public.build_telemetry
  ADD COLUMN IF NOT EXISTS cost_usd NUMERIC(8,4);

-- ── 3. Credit transactions ledger ────────────────────────────────────────────

-- Org-scoped mirror of V1's credit_transactions table.
-- Column names match V1 exactly: amount, type, description, stripe_payment_intent_id
CREATE TABLE IF NOT EXISTS public.credit_transactions (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                   UUID        NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  amount                   NUMERIC(10,1) NOT NULL,  -- positive=added, negative=spent
  type                     TEXT        NOT NULL,     -- 'usage','purchase','subscription_reset','signup_bonus'
  build_id                 UUID,                     -- nullable, links to generations.id
  description              TEXT,
  stripe_payment_intent_id TEXT        UNIQUE,       -- idempotency key for purchase events
  created_at               TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS credit_transactions_org_id_idx
  ON public.credit_transactions(org_id);

CREATE INDEX IF NOT EXISTS credit_transactions_build_id_idx
  ON public.credit_transactions(build_id)
  WHERE build_id IS NOT NULL;

-- ── 4. RPC: apply_org_usage_deduction ────────────────────────────────────────
-- Ports V1's apply_usage_deduction (profiles) → orgs.
-- Row-locks the org row to prevent race conditions on concurrent builds.
-- Deducts topup_credits FIRST (purchased), then monthly credits pool.
-- GREATEST(0, ...) prevents going below zero.
-- Inserts a negative credit_transactions row of type 'usage'.
-- Returns (deducted, credits, topup_credits) — mirrors V1 return shape.

CREATE OR REPLACE FUNCTION public.apply_org_usage_deduction(
  p_org_id     UUID,
  p_amount     NUMERIC,
  p_build_id   UUID    DEFAULT NULL,
  p_description TEXT   DEFAULT 'App generation'
)
RETURNS TABLE (deducted NUMERIC, credits NUMERIC, topup_credits NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_credits    NUMERIC := 0;
  v_topup      NUMERIC := 0;
  v_to_deduct  NUMERIC := GREATEST(0, COALESCE(p_amount, 0));
  v_from_topup   NUMERIC := 0;
  v_from_credits NUMERIC := 0;
  v_deducted   NUMERIC := 0;
BEGIN
  SELECT COALESCE(o.credits, 0), COALESCE(o.topup_credits, 0)
    INTO v_credits, v_topup
    FROM public.orgs o
   WHERE o.id = p_org_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Org not found: %', p_org_id;
  END IF;

  -- Topup consumed first, then monthly pool
  v_from_topup   := LEAST(v_topup,    v_to_deduct);
  v_from_credits := LEAST(v_credits,  GREATEST(0, v_to_deduct - v_from_topup));
  v_deducted     := v_from_topup + v_from_credits;

  v_topup   := GREATEST(0, v_topup   - v_from_topup);
  v_credits := GREATEST(0, v_credits - v_from_credits);

  UPDATE public.orgs
     SET topup_credits = v_topup,
         credits       = v_credits
   WHERE id = p_org_id;

  IF v_deducted > 0 THEN
    INSERT INTO public.credit_transactions(org_id, amount, type, build_id, description)
    VALUES (p_org_id, -v_deducted, 'usage', p_build_id, COALESCE(p_description, 'App generation'));
  END IF;

  RETURN QUERY SELECT v_deducted, v_credits, v_topup;
END;
$$;

-- ── 5. RPC: apply_org_topup_purchase ─────────────────────────────────────────
-- Ports V1's apply_topup_purchase — exactly-once purchase crediting via
-- unique index on stripe_payment_intent_id.
-- Inserts transaction row first (ON CONFLICT DO NOTHING), then updates balance.
-- Returns FALSE if already processed (safe to call multiple times).

CREATE OR REPLACE FUNCTION public.apply_org_topup_purchase(
  p_org_id             UUID,
  p_amount             NUMERIC,
  p_payment_intent_id  TEXT,
  p_description        TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted_count INTEGER := 0;
BEGIN
  IF p_payment_intent_id IS NULL OR length(trim(p_payment_intent_id)) = 0 THEN
    RAISE EXCEPTION 'payment_intent_id is required';
  END IF;

  -- Insert transaction row first — ON CONFLICT DO NOTHING is the idempotency guard
  INSERT INTO public.credit_transactions(org_id, amount, type, description, stripe_payment_intent_id)
  VALUES (p_org_id, p_amount, 'purchase',
          COALESCE(p_description, 'Purchased credits'),
          p_payment_intent_id)
  ON CONFLICT (stripe_payment_intent_id) DO NOTHING;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;

  -- Already processed (webhook/confirm-topup race — safe, correct)
  IF inserted_count = 0 THEN
    RETURN FALSE;
  END IF;

  UPDATE public.orgs
     SET topup_credits = COALESCE(topup_credits, 0) + p_amount
   WHERE id = p_org_id;

  RETURN TRUE;
END;
$$;
