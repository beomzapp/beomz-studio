import Stripe from "stripe";
import { Hono } from "hono";

import { loadOrgContext } from "../../middleware/loadOrgContext.js";
import { verifyPlatformJwt } from "../../middleware/verifyPlatformJwt.js";
import { apiConfig } from "../../config.js";
import type { OrgContext } from "../../types.js";

const portalRoute = new Hono();

/**
 * POST /payments/portal
 * Body: { returnUrl?: string }
 *
 * Creates a Stripe Billing Portal session so the user can manage their subscription,
 * update payment method, or cancel. Reuses or creates orgs.stripe_customer_id.
 * Returns: { url: string }
 */
portalRoute.post("/", verifyPlatformJwt, loadOrgContext, async (c) => {
  if (!apiConfig.STRIPE_SECRET_KEY) {
    return c.json({ error: "Payments not configured." }, 503);
  }

  const orgContext = c.get("orgContext") as OrgContext;
  const org = orgContext.org;
  const user = orgContext.user;

  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
  const returnUrl = typeof body.returnUrl === "string"
    ? body.returnUrl
    : "https://beomz.ai/dashboard";

  const stripe = new Stripe(apiConfig.STRIPE_SECRET_KEY);

  let customerId = org.stripe_customer_id ?? undefined;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { org_id: org.id, user_id: user.id },
    });
    customerId = customer.id;
    await orgContext.db.updateOrg(org.id, { stripe_customer_id: customerId });
  }

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });

  return c.json({ url: portalSession.url });
});

export default portalRoute;
