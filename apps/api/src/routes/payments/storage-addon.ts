/**
 * POST /payments/storage-addon/checkout
 *
 * Creates a Stripe Checkout session (mode: payment) for a storage add-on purchase.
 * Body: { priceId: string, projectId: string }
 *
 * Validates priceId against the 3 known storage add-on price IDs defined in features.ts.
 * On success, returns { url: string } — the Stripe Checkout hosted URL.
 * The success webhook (checkout.session.completed, type=storage_addon) increments
 * project_db_limits.extra_storage_mb / extra_rows accordingly.
 */
import Stripe from "stripe";
import { Hono } from "hono";

import { loadOrgContext } from "../../middleware/loadOrgContext.js";
import { verifyPlatformJwt } from "../../middleware/verifyPlatformJwt.js";
import { apiConfig } from "../../config.js";
import { getStorageAddonByPriceId } from "../../lib/features.js";
import type { OrgContext } from "../../types.js";

const storageAddonCheckoutRoute = new Hono();

storageAddonCheckoutRoute.post("/", verifyPlatformJwt, loadOrgContext, async (c) => {
  if (!apiConfig.STRIPE_SECRET_KEY) {
    return c.json({ error: "Payments not configured." }, 503);
  }

  const orgContext = c.get("orgContext") as OrgContext;
  const { org, user, db } = orgContext;

  const body = await c.req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.priceId !== "string" || typeof body.projectId !== "string") {
    return c.json({ error: "priceId and projectId are required." }, 400);
  }

  const { priceId, projectId } = body as { priceId: string; projectId: string };

  const addon = getStorageAddonByPriceId(priceId);
  if (!addon) {
    return c.json({ error: "Invalid storage add-on price ID." }, 400);
  }

  // Verify project belongs to this org
  const project = await db.findProjectById(projectId);
  if (!project || project.org_id !== org.id) {
    return c.json({ error: "Project not found." }, 404);
  }
  if (!project.database_enabled || project.db_provider !== "beomz") {
    return c.json({ error: "Built-in database not enabled for this project." }, 400);
  }

  const stripe = new Stripe(apiConfig.STRIPE_SECRET_KEY);

  // Resolve or create Stripe customer
  let customerId = org.stripe_customer_id ?? undefined;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { org_id: org.id, user_id: user.id },
    });
    customerId = customer.id;
    await db.updateOrg(org.id, { stripe_customer_id: customerId });
  }

  const successUrl = `https://beomz.ai/studio/project/${projectId}?checkout=storage_success`;
  const cancelUrl  = `https://beomz.ai/studio/project/${projectId}`;

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      org_id: org.id,
      project_id: projectId,
      type: "storage_addon",
      extra_storage_mb: String(addon.extra_storage_mb),
      extra_rows: String(addon.extra_rows),
    },
    payment_intent_data: {
      metadata: {
        org_id: org.id,
        project_id: projectId,
        type: "storage_addon",
        extra_storage_mb: String(addon.extra_storage_mb),
        extra_rows: String(addon.extra_rows),
      },
    },
  });

  return c.json({ url: session.url });
});

export default storageAddonCheckoutRoute;
