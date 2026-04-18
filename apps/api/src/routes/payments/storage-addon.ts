/**
 * GET  /payments/storage-addons
 * POST /payments/storage-addon/checkout
 */
import Stripe from "stripe";
import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";

import { loadOrgContext } from "../../middleware/loadOrgContext.js";
import { verifyPlatformJwt } from "../../middleware/verifyPlatformJwt.js";
import { apiConfig } from "../../config.js";
import {
  getPublicStorageAddons,
  getStorageAddonByPriceId,
} from "../../lib/features.js";
import type { OrgContext } from "../../types.js";

type StripeCustomerClient = {
  create(input: {
    email: string;
    metadata: Record<string, string>;
  }): Promise<{ id: string }>;
};

type StripeCheckoutClient = {
  sessions: {
    create(input: {
      mode: "payment";
      customer?: string;
      line_items: Array<{ price: string; quantity: number }>;
      success_url: string;
      cancel_url: string;
      metadata: Record<string, string>;
      payment_intent_data: { metadata: Record<string, string> };
    }): Promise<{ url: string | null }>;
  };
};

type StripeLike = {
  customers: StripeCustomerClient;
  checkout: StripeCheckoutClient;
};

interface StorageAddonRouteDeps {
  authMiddleware?: MiddlewareHandler;
  loadOrgContextMiddleware?: MiddlewareHandler;
  createStripe?: (secretKey: string) => StripeLike;
}

export function createStorageAddonRoute(deps: StorageAddonRouteDeps = {}) {
  const storageAddonRoute = new Hono();
  const authMiddleware = deps.authMiddleware ?? verifyPlatformJwt;
  const loadOrgContextMiddleware = deps.loadOrgContextMiddleware ?? loadOrgContext;
  const createStripe =
    deps.createStripe ?? ((secretKey: string) => new Stripe(secretKey) as unknown as StripeLike);

  storageAddonRoute.get("/", authMiddleware, loadOrgContextMiddleware, async (c) => {
    return c.json(getPublicStorageAddons());
  });

  storageAddonRoute.post("/checkout", authMiddleware, loadOrgContextMiddleware, async (c) => {
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

    const VALID_STORAGE_PRICE_IDS = [
      process.env.STRIPE_STORAGE_500MB,
      process.env.STRIPE_STORAGE_2GB,
      process.env.STRIPE_STORAGE_10GB,
    ].filter((id): id is string => Boolean(id));

    if (!VALID_STORAGE_PRICE_IDS.includes(priceId)) {
      return c.json({ error: "invalid_price_id" }, 400);
    }

    const addon = getStorageAddonByPriceId(priceId);
    if (!addon) {
      return c.json({ error: "invalid_price_id" }, 400);
    }

    // Verify project belongs to this org
    const project = await db.findProjectById(projectId);
    if (!project || project.org_id !== org.id) {
      return c.json({ error: "Project not found." }, 404);
    }
    if (!project.database_enabled || project.db_provider !== "beomz") {
      return c.json({ error: "Built-in database not enabled for this project." }, 400);
    }

    const stripe = createStripe(apiConfig.STRIPE_SECRET_KEY);

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
      },
      payment_intent_data: {
        metadata: {
          org_id: org.id,
          project_id: projectId,
          type: "storage_addon",
          extra_storage_mb: String(addon.extra_storage_mb),
        },
      },
    });

    return c.json({ url: session.url });
  });

  return storageAddonRoute;
}

const storageAddonRoute = createStorageAddonRoute();

export default storageAddonRoute;
