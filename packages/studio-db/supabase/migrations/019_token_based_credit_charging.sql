-- BEO-439: token-based charging with 2dp precision and negative balance support.

ALTER TABLE public.orgs
  ALTER COLUMN credits TYPE NUMERIC(10,2) USING credits::NUMERIC(10,2);

ALTER TABLE public.credit_transactions
  ALTER COLUMN amount TYPE NUMERIC(10,2) USING amount::NUMERIC(10,2);

-- Keep active credit buckets/telemetry aligned with 2dp deductions.
ALTER TABLE public.orgs
  ALTER COLUMN topup_credits TYPE NUMERIC(10,2) USING topup_credits::NUMERIC(10,2);

ALTER TABLE public.build_telemetry
  ALTER COLUMN credits_used TYPE NUMERIC(10,2) USING credits_used::NUMERIC(10,2);

CREATE OR REPLACE FUNCTION public.apply_org_usage_deduction(
  p_org_id      UUID,
  p_amount      NUMERIC,
  p_build_id    UUID DEFAULT NULL,
  p_description TEXT DEFAULT 'App generation'
)
RETURNS TABLE (deducted NUMERIC, credits NUMERIC, topup_credits NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_credits      NUMERIC := 0;
  v_topup        NUMERIC := 0;
  v_to_deduct    NUMERIC := GREATEST(0, COALESCE(p_amount, 0));
  v_from_topup   NUMERIC := 0;
  v_from_credits NUMERIC := 0;
  v_deducted     NUMERIC := 0;
BEGIN
  SELECT COALESCE(o.credits, 0), COALESCE(o.topup_credits, 0)
    INTO v_credits, v_topup
    FROM public.orgs o
   WHERE o.id = p_org_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Org not found: %', p_org_id;
  END IF;

  -- Topup stays non-negative; the main credits bucket may go negative so the
  -- current build can finish even when it slightly overruns the balance.
  v_from_topup   := LEAST(v_topup, v_to_deduct);
  v_topup        := GREATEST(0, v_topup - v_from_topup);
  v_from_credits := GREATEST(0, v_to_deduct - v_from_topup);
  v_credits      := v_credits - v_from_credits;
  v_deducted     := v_from_topup + v_from_credits;

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
