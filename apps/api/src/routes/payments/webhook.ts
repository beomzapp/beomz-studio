import Stripe from "stripe";
import { Hono } from "hono";

import { createStudioDbClient } from "@beomz-studio/studio-db";
import { apiConfig } from "../../config.js";
import { CREDIT_PACKS, PLAN_LIMITS } from "../../lib/credits.js";

// Maps Stripe price ID → plan key — populated from env vars
function buildPriceToPlan(): Record<string, string> {
  const map: Record<string, string> = {};
  const entries: Array<[keyof typeof apiConfig, string]> = [
    ["STRIPE_STARTER_MONTHLY_PRICE_ID", "starter"],
    ["STRIPE_STARTER_YEARLY_PRICE_ID",  "starter"],
    ["STRIPE_PRO_MONTHLY_PRICE_ID",     "pro"],
    ["STRIPE_PRO_YEARLY_PRICE_ID",      "pro"],
    ["STRIPE_BUSINESS_MONTHLY_PRICE_ID","business"],
    ["STRIPE_BUSINESS_YEARLY_PRICE_ID", "business"],
  ];
  for (const [key, plan] of entries) {
    const id = apiConfig[key] as string | undefined;
    if (id) map[id] = plan;
  }
  return map;
}

const webhookRoute = new Hono();

/**
 * POST /payments/webhook
 * No JWT — Stripe calls this directly.  Signature is verified via STRIPE_WEBHOOK_SECRET.
 *
 * Handled events:
 *  - checkout.session.completed      → one-time pack purchase → apply_org_topup_purchase
 *  - customer.subscription.created   → update org.plan + reset credits
 *  - customer.subscription.updated   → update org.plan
 *  - customer.subscription.deleted   → downgrade to free + reset credits
 *  - invoice.paid                    → monthly credit refresh for paid plans
 */
webhookRoute.post("/", async (c) => {
  if (!apiConfig.STRIPE_SECRET_KEY || !apiConfig.STRIPE_WEBHOOK_SECRET) {
    return c.json({ error: "Payments not configured." }, 503);
  }

  const rawBody = await c.req.text();
  const sig = c.req.header("stripe-signature") ?? "";

  const stripe = new Stripe(apiConfig.STRIPE_SECRET_KEY);
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, apiConfig.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[webhook] Signature verification failed:", msg);
    return c.json({ error: `Webhook signature invalid: ${msg}` }, 400);
  }

  const db = createStudioDbClient();
  const PRICE_TO_PLAN = buildPriceToPlan();

  console.log("[webhook] Received event:", event.type, event.id);

  try {
    switch (event.type) {
      // ── One-time credit pack purchase ───────────────────────────────────────
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode !== "payment") break;

        const orgId     = session.metadata?.org_id;
        const packId    = session.metadata?.pack_id;
        const creditsStr = session.metadata?.credits;
        const credits   = creditsStr ? parseFloat(creditsStr) : 0;

        if (!orgId || !credits || credits <= 0) {
          console.warn("[webhook] checkout.session.completed: missing metadata", { orgId, credits });
          break;
        }

        // Retrieve payment_intent_id for idempotency
        let paymentIntentId: string | null = null;
        if (typeof session.payment_intent === "string") {
          paymentIntentId = session.payment_intent;
        } else if (session.payment_intent && typeof (session.payment_intent as Stripe.PaymentIntent).id === "string") {
          paymentIntentId = (session.payment_intent as Stripe.PaymentIntent).id;
        }
        if (!paymentIntentId) {
          // Expand the session to get the payment_intent_id
          const expanded = await stripe.checkout.sessions.retrieve(session.id, {
            expand: ["payment_intent"],
          });
          const pi = expanded.payment_intent;
          paymentIntentId = typeof pi === "string" ? pi : (pi as Stripe.PaymentIntent | null)?.id ?? null;
        }
        if (!paymentIntentId) {
          console.error("[webhook] checkout.session.completed: no payment_intent_id", { sessionId: session.id });
          break;
        }

        const pack = CREDIT_PACKS.find((p) => p.id === packId);
        const description = pack ? `${pack.label} purchase` : `${credits} credits purchase`;

        const applied = await db.applyOrgTopupPurchase(orgId, credits, paymentIntentId, description);
        console.log("[webhook] topup applied:", { orgId, credits, applied });
        break;
      }

      // ── Subscription created ────────────────────────────────────────────────
      case "customer.subscription.created": {
        const sub = event.data.object as Stripe.Subscription;
        const orgId = (sub.metadata?.org_id as string | undefined)
          ?? await resolveOrgByCustomer(db, stripe, sub.customer as string);
        if (!orgId) { console.warn("[webhook] subscription.created: no org_id", { subId: sub.id }); break; }

        const priceId = sub.items.data[0]?.price.id;
        const plan = priceId ? (PRICE_TO_PLAN[priceId] ?? sub.metadata?.plan ?? "starter") : "starter";
        const planLimit = PLAN_LIMITS[plan] ?? PLAN_LIMITS.starter!;

        await db.updateOrg(orgId, { plan, stripe_subscription_id: sub.id });
        await db.resetOrgMonthlyCredits(orgId, planLimit.credits);
        console.log("[webhook] subscription.created: org upgraded to", plan, { orgId });
        break;
      }

      // ── Subscription updated ─────────────────────────────────────────────────
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const orgId = (sub.metadata?.org_id as string | undefined)
          ?? await resolveOrgByCustomer(db, stripe, sub.customer as string);
        if (!orgId) { console.warn("[webhook] subscription.updated: no org_id", { subId: sub.id }); break; }

        const priceId = sub.items.data[0]?.price.id;
        const plan = priceId ? (PRICE_TO_PLAN[priceId] ?? sub.metadata?.plan) : undefined;
        const patch: Parameters<typeof db.updateOrg>[1] = { stripe_subscription_id: sub.id };
        if (plan) patch.plan = plan;
        await db.updateOrg(orgId, patch);
        if (plan) console.log("[webhook] subscription.updated: org plan updated to", plan, { orgId });
        break;
      }

      // ── Subscription cancelled ───────────────────────────────────────────────
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const orgId = (sub.metadata?.org_id as string | undefined)
          ?? await resolveOrgByCustomer(db, stripe, sub.customer as string);
        if (!orgId) { console.warn("[webhook] subscription.deleted: no org_id", { subId: sub.id }); break; }

        await db.updateOrg(orgId, { plan: "free", stripe_subscription_id: null });
        await db.resetOrgMonthlyCredits(orgId, PLAN_LIMITS.free!.credits);
        console.log("[webhook] subscription.deleted: org downgraded to free", { orgId });
        break;
      }

      // ── Invoice paid → monthly credit refresh ────────────────────────────────
      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        if (invoice.billing_reason !== "subscription_cycle") break;

        const customerId = invoice.customer as string;
        const orgId = await resolveOrgByCustomer(db, stripe, customerId);
        if (!orgId) { console.warn("[webhook] invoice.paid: no org for customer", { customerId }); break; }

        const org = await db.getOrgWithBalance(orgId);
        if (!org) break;

        const planLimit = PLAN_LIMITS[org.plan] ?? PLAN_LIMITS.free!;
        if (!planLimit.credits) break;

        await db.resetOrgMonthlyCredits(orgId, planLimit.credits);
        console.log("[webhook] invoice.paid: credits reset for", org.plan, { orgId, credits: planLimit.credits });
        break;
      }

      default:
        console.log("[webhook] Unhandled event type:", event.type);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[webhook] Handler error:", msg, { eventType: event.type, eventId: event.id });
    // Return 200 so Stripe doesn't retry indefinitely for application-level errors
    return c.json({ received: true, warning: msg });
  }

  return c.json({ received: true });
});

async function resolveOrgByCustomer(
  db: ReturnType<typeof createStudioDbClient>,
  _stripe: Stripe,
  customerId: string,
): Promise<string | null> {
  const org = await db.findOrgByStripeCustomerId(customerId);
  return org?.id ?? null;
}

export default webhookRoute;
