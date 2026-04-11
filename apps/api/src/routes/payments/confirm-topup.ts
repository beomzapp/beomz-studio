import Stripe from "stripe";
import { Hono } from "hono";

import { loadOrgContext } from "../../middleware/loadOrgContext.js";
import { verifyPlatformJwt } from "../../middleware/verifyPlatformJwt.js";
import { apiConfig } from "../../config.js";
import { CREDIT_PACKS } from "../../lib/credits.js";
import type { OrgContext } from "../../types.js";

const confirmTopupRoute = new Hono();

/**
 * POST /payments/confirm-topup
 * Body: { sessionId: string }
 *
 * Called after a successful Stripe Checkout redirect for a one-time pack purchase.
 * Idempotent — safe to call multiple times (RPC uses unique constraint on payment_intent_id).
 * Returns: { applied: boolean, credits: number }
 */
confirmTopupRoute.post("/", verifyPlatformJwt, loadOrgContext, async (c) => {
  if (!apiConfig.STRIPE_SECRET_KEY) {
    return c.json({ error: "Payments not configured." }, 503);
  }

  const orgContext = c.get("orgContext") as OrgContext;
  const body = await c.req.json().catch(() => null) as Record<string, unknown> | null;

  if (!body || typeof body.sessionId !== "string" || !body.sessionId) {
    return c.json({ error: "Missing sessionId." }, 400);
  }

  const stripe = new Stripe(apiConfig.STRIPE_SECRET_KEY);
  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.retrieve(body.sessionId, {
      expand: ["payment_intent"],
    });
  } catch {
    return c.json({ error: "Invalid session ID." }, 400);
  }

  if (session.status !== "complete") {
    return c.json({ applied: false, message: "Session not completed." });
  }

  const orgId = session.metadata?.org_id;
  if (!orgId || orgId !== orgContext.org.id) {
    return c.json({ error: "Session does not belong to this org." }, 403);
  }

  const creditsStr = session.metadata?.credits;
  const credits = creditsStr ? parseFloat(creditsStr) : 0;
  if (!credits || credits <= 0) {
    return c.json({ error: "Invalid credits amount in session metadata." }, 400);
  }

  const paymentIntent = session.payment_intent;
  const paymentIntentId = typeof paymentIntent === "string"
    ? paymentIntent
    : (paymentIntent as Stripe.PaymentIntent | null)?.id;

  if (!paymentIntentId) {
    return c.json({ error: "Missing payment intent ID." }, 400);
  }

  const packId = session.metadata?.pack_id ?? "pack";
  const pack = CREDIT_PACKS.find((p) => p.id === packId);
  const description = pack ? `${pack.label} purchase` : `${credits} credits purchase`;

  const applied = await orgContext.db.applyOrgTopupPurchase(
    orgContext.org.id,
    credits,
    paymentIntentId,
    description,
  );

  const org = await orgContext.db.getOrgWithBalance(orgContext.org.id);

  return c.json({
    applied,
    balance: org ? Number(org.credits ?? 0) + Number(org.topup_credits ?? 0) : null,
  });
});

export default confirmTopupRoute;
