import Stripe from "stripe";
import { Hono } from "hono";

import { loadOrgContext } from "../../middleware/loadOrgContext.js";
import { verifyPlatformJwt } from "../../middleware/verifyPlatformJwt.js";
import { apiConfig } from "../../config.js";
import type { OrgContext } from "../../types.js";

/**
 * Builds a map of allowed Stripe price IDs → credit amounts for top-up packs.
 * Reads both the current naming (STRIPE_CREDITS_50/150/400_PRICE_ID) and the
 * legacy naming deployed on the server (STRIPE_CREDITS_200/500/1200_PRICE_ID).
 * See BEO-197 for the server env var → credit amount mapping.
 */
function buildTopupPriceMap(): Record<string, number> {
  const map: Record<string, number> = {};

  const entries: Array<[keyof typeof apiConfig, number]> = [
    // Current naming (matches CREDIT_PACKS ids)
    ["STRIPE_CREDITS_50_PRICE_ID",   50],
    ["STRIPE_CREDITS_150_PRICE_ID",  150],
    ["STRIPE_CREDITS_400_PRICE_ID",  400],
    // Legacy naming as set on the production server (BEO-197)
    ["STRIPE_CREDITS_200_PRICE_ID",  50],   // price_1TMrSK8... $5  → 50 credits
    ["STRIPE_CREDITS_500_PRICE_ID",  150],  // price_1TMrU58... $12 → 150 credits
    ["STRIPE_CREDITS_1200_PRICE_ID", 400],  // price_1TMrVf8... $29 → 400 credits
  ];

  for (const [key, credits] of entries) {
    const priceId = apiConfig[key] as string | undefined;
    if (priceId && !map[priceId]) map[priceId] = credits;
  }

  return map;
}

const topupCheckoutRoute = new Hono();

/**
 * POST /payments/topup/checkout
 * Body: { priceId: string }
 *
 * Creates a Stripe Checkout session (mode: payment) for a one-time top-up
 * credit pack purchase. Returns { url } — the hosted Stripe Checkout URL.
 *
 * The existing checkout.session.completed webhook handler picks up the
 * completed payment via session.mode === "payment" + metadata.credits.
 * No plan restriction — any org (including Free) may purchase top-up credits.
 */
topupCheckoutRoute.post("/", verifyPlatformJwt, loadOrgContext, async (c) => {
  if (!apiConfig.STRIPE_SECRET_KEY) {
    return c.json({ error: "Payments not configured." }, 503);
  }

  const orgContext = c.get("orgContext") as OrgContext;
  const org = orgContext.org;
  const user = orgContext.user;

  const body = await c.req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.priceId !== "string" || !body.priceId.trim()) {
    return c.json({ error: "Missing priceId." }, 400);
  }

  const priceId = body.priceId.trim();
  const priceMap = buildTopupPriceMap();
  const credits = priceMap[priceId];

  if (credits === undefined) {
    return c.json({ error: "Invalid priceId — not a recognised top-up pack." }, 400);
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

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: "https://beomz.ai/studio/home?checkout=topup_success",
    cancel_url: "https://beomz.ai/studio/home",
    metadata: {
      org_id: org.id,
      type: "topup",
      credits: String(credits),
    },
    payment_intent_data: {
      metadata: {
        org_id: org.id,
        type: "topup",
        credits: String(credits),
      },
    },
  });

  console.log("[topup/checkout] session created.", {
    orgId: org.id, priceId, credits, sessionId: session.id,
  });

  return c.json({ url: session.url });
});

export default topupCheckoutRoute;
