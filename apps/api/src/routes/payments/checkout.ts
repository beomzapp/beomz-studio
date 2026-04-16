import Stripe from "stripe";
import { Hono } from "hono";

import { loadOrgContext } from "../../middleware/loadOrgContext.js";
import { verifyPlatformJwt } from "../../middleware/verifyPlatformJwt.js";
import { apiConfig } from "../../config.js";
import { CREDIT_PACKS } from "../../lib/credits.js";
import type { OrgContext } from "../../types.js";

// Maps plan+interval → Stripe price ID from env
function getPlanPriceId(plan: string, interval: "monthly" | "yearly"): string | undefined {
  const key = `STRIPE_${plan.toUpperCase()}_${interval.toUpperCase()}_PRICE_ID` as keyof typeof apiConfig;
  return apiConfig[key] as string | undefined;
}

// Maps pack ID → Stripe price ID from env (V1 pack IDs: credits_200/500/1200)
function getPackPriceId(packId: string): string | undefined {
  const key = `STRIPE_${packId.toUpperCase()}_PRICE_ID` as keyof typeof apiConfig;
  return apiConfig[key] as string | undefined;
}

const checkoutRoute = new Hono();

/**
 * POST /payments/checkout
 * Body: { type: "subscription", plan: "starter"|"pro"|"business", interval: "monthly"|"yearly" }
 *     | { type: "pack", packId: "pack_50"|"pack_100"|"pack_300" }
 *
 * Returns: { url: string } — Stripe Checkout hosted URL
 */
checkoutRoute.post("/", verifyPlatformJwt, loadOrgContext, async (c) => {
  if (!apiConfig.STRIPE_SECRET_KEY) {
    return c.json({ error: "Payments not configured." }, 503);
  }

  const orgContext = c.get("orgContext") as OrgContext;
  const org = orgContext.org;
  const user = orgContext.user;

  const body = await c.req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.type !== "string") {
    return c.json({ error: "Missing type field." }, 400);
  }

  const stripe = new Stripe(apiConfig.STRIPE_SECRET_KEY);

  // Resolve or create the Stripe customer, caching it in orgs.stripe_customer_id
  let customerId = org.stripe_customer_id ?? undefined;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { org_id: org.id, user_id: user.id },
    });
    customerId = customer.id;
    await orgContext.db.updateOrg(org.id, { stripe_customer_id: customerId });
  }

  const successUrl = apiConfig.STRIPE_SUCCESS_URL ?? "https://beomz.ai/studio/home?checkout=success";
  const cancelUrl  = apiConfig.STRIPE_CANCEL_URL  ?? "https://beomz.ai/studio/home?checkout=cancel";

  if (body.type === "subscription") {
    const plan     = body.plan as string;
    const interval = body.interval as "monthly" | "yearly";

    if (!["starter", "pro", "builder", "business"].includes(plan)) {
      return c.json({ error: "Invalid plan." }, 400);
    }
    if (!["monthly", "yearly"].includes(interval)) {
      return c.json({ error: "Invalid interval." }, 400);
    }
    if (org.plan !== "free") {
      return c.json({ error: "Manage your existing subscription via the billing portal." }, 409);
    }

    // "builder" is the PricingModal alias for "pro" (maps to STRIPE_PRO_*_PRICE_ID)
    const planKey = plan === "builder" ? "pro" : plan;
    const priceId = getPlanPriceId(planKey, interval);
    if (!priceId) {
      return c.json({ error: `Price ID for ${planKey} ${interval} not configured.` }, 503);
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: { org_id: org.id, plan: planKey, interval },
      subscription_data: {
        metadata: { org_id: org.id, plan: planKey },
      },
    });

    return c.json({ url: session.url });
  }

  if (body.type === "pack") {
    const packId = body.packId as string;
    const pack = CREDIT_PACKS.find((p) => p.id === packId);
    if (!pack) return c.json({ error: "Invalid pack ID." }, 400);
    if (org.plan === "free") {
      return c.json({ error: "Upgrade to a paid plan to purchase credit packs." }, 403);
    }

    const priceId = getPackPriceId(packId);
    if (!priceId) {
      return c.json({ error: `Price ID for ${packId} not configured.` }, 503);
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${successUrl}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl,
      metadata: { org_id: org.id, pack_id: packId, credits: String(pack.credits) },
      payment_intent_data: {
        metadata: { org_id: org.id, pack_id: packId, credits: String(pack.credits) },
      },
    });

    return c.json({ url: session.url });
  }

  return c.json({ error: "Invalid checkout type." }, 400);
});

export default checkoutRoute;
