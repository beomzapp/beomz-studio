import Stripe from "stripe";
import { Hono } from "hono";

import { createStudioDbClient, type OrgRow, type StudioDbClient } from "@beomz-studio/studio-db";
import { apiConfig } from "../../config.js";
import { CREDIT_PACKS, PLAN_LIMITS } from "../../lib/credits.js";
import { getFeatureLimits } from "../../lib/features.js";
import { applyUpgradeReferralReward } from "../../lib/referrals.js";

// Maps Stripe price ID → plan key — populated from env vars.
// Supports both legacy keys (starter/pro) and new 4-plan keys (pro_starter/pro_builder).
function buildPriceToPlan(): Record<string, string> {
  const map: Record<string, string> = {};
  const entries: Array<[keyof typeof apiConfig, string]> = [
    // Legacy plan IDs map to new keys for backward compat
    ["STRIPE_STARTER_MONTHLY_PRICE_ID",      "pro_starter"],
    ["STRIPE_STARTER_YEARLY_PRICE_ID",       "pro_starter"],
    ["STRIPE_PRO_STARTER_MONTHLY_PRICE_ID",  "pro_starter"],
    ["STRIPE_PRO_STARTER_YEARLY_PRICE_ID",   "pro_starter"],
    ["STRIPE_PRO_MONTHLY_PRICE_ID",          "pro_builder"],
    ["STRIPE_PRO_YEARLY_PRICE_ID",           "pro_builder"],
    ["STRIPE_PRO_BUILDER_MONTHLY_PRICE_ID",  "pro_builder"],
    ["STRIPE_PRO_BUILDER_YEARLY_PRICE_ID",   "pro_builder"],
    ["STRIPE_BUSINESS_MONTHLY_PRICE_ID",     "business"],
    ["STRIPE_BUSINESS_YEARLY_PRICE_ID",      "business"],
  ];
  for (const [key, plan] of entries) {
    const id = apiConfig[key] as string | undefined;
    if (id) map[id] = plan;
  }
  return map;
}

interface CreateWebhookRouteDeps {
  createStudioDbClient?: () => StudioDbClient;
  createStripe?: (secretKey: string) => Stripe;
}

type CreditTransactionsClient = {
  from: (table: "credit_transactions") => {
    insert: (row: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
  };
};

async function recordSubscriptionAllocation(
  db: StudioDbClient,
  orgId: string,
  amount: number,
  description: string,
): Promise<void> {
  const client = (db as unknown as { client: CreditTransactionsClient }).client;
  const response = await client
    .from("credit_transactions")
    .insert({
      org_id: orgId,
      amount,
      type: "subscription_reset",
      description,
      created_at: new Date().toISOString(),
    });

  if (response.error) {
    throw new Error(response.error.message);
  }
}

function hasSubscriptionAllocationAlreadyApplied(
  org: OrgRow | null,
  plan: string,
  subId: string | null,
  planLimit: { credits: number; rolloverCap: number },
): boolean {
  if (!org) return false;
  if (org.plan !== plan) return false;
  if ((org.monthly_credits ?? 0) !== planLimit.credits) return false;
  if ((org.rollover_cap ?? 0) !== planLimit.rolloverCap) return false;
  if (org.downgrade_at_period_end) return false;
  if (org.pending_plan !== null) return false;
  if (subId && org.stripe_subscription_id !== subId) return false;
  return true;
}

async function applyImmediateSubscriptionAllocation(
  db: StudioDbClient,
  {
    orgId,
    plan,
    subId,
    planLimit,
    creditsPeriodStart,
    creditsPeriodEnd,
    resetRolloverCredits,
    allocationDescription,
  }: {
    orgId: string;
    plan: string;
    subId: string | null;
    planLimit: { credits: number; rolloverCap: number };
    creditsPeriodStart?: string;
    creditsPeriodEnd?: string;
    resetRolloverCredits?: boolean;
    allocationDescription: string;
  },
): Promise<{ creditsGranted: boolean }> {
  const org = await db.getOrgWithBalance(orgId);
  const creditsAlreadyGranted = hasSubscriptionAllocationAlreadyApplied(org, plan, subId, planLimit);
  const currentCredits = Number(org?.credits ?? 0);
  const nextCredits = currentCredits + planLimit.credits;

  await db.updateOrg(orgId, {
    plan,
    stripe_subscription_id: subId ?? undefined,
    monthly_credits: planLimit.credits,
    rollover_cap: planLimit.rolloverCap,
    downgrade_at_period_end: false,
    pending_plan: null,
    ...(!creditsAlreadyGranted ? { credits: nextCredits } : {}),
    ...(resetRolloverCredits ? { rollover_credits: 0 } : {}),
    ...(creditsPeriodStart ? { credits_period_start: creditsPeriodStart } : {}),
    ...(creditsPeriodEnd ? { credits_period_end: creditsPeriodEnd } : {}),
  });

  if (creditsAlreadyGranted) {
    return { creditsGranted: false };
  }

  await recordSubscriptionAllocation(db, orgId, planLimit.credits, allocationDescription);
  return { creditsGranted: true };
}

/**
 * POST /payments/webhook
 * No JWT — Stripe calls this directly.  Signature is verified via STRIPE_WEBHOOK_SECRET.
 *
 * Handled events:
 *  - checkout.session.completed      → one-time pack purchase → apply_org_topup_purchase
 *  - customer.subscription.created   → initial paid activation; preserve balance + add allocation once
 *  - customer.subscription.updated   → upgrade preserves balance; downgrade schedules period-end change
 *  - customer.subscription.deleted   → schedule downgrade to Free at period end
 *  - invoice.payment_succeeded       → billing cycle reset with rollover calculation
 *  - invoice.payment_failed          → log warning (future: flag account)
 */
export function createWebhookRoute(deps: CreateWebhookRouteDeps = {}): Hono {
  const webhookRoute = new Hono();

  webhookRoute.post("/", async (c) => {
    if (!apiConfig.STRIPE_SECRET_KEY || !apiConfig.STRIPE_WEBHOOK_SECRET) {
      return c.json({ error: "Payments not configured." }, 503);
    }

    const rawBody = await c.req.text();
    const sig = c.req.header("stripe-signature") ?? "";

    const stripe = deps.createStripe?.(apiConfig.STRIPE_SECRET_KEY) ?? new Stripe(apiConfig.STRIPE_SECRET_KEY);
    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(rawBody, sig, apiConfig.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[webhook] Signature verification failed:", msg);
      return c.json({ error: `Webhook signature invalid: ${msg}` }, 400);
    }

    const db = deps.createStudioDbClient?.() ?? createStudioDbClient();
    const PRICE_TO_PLAN = buildPriceToPlan();

    console.log("[webhook] Received event:", event.type, event.id);

    try {
      switch (event.type) {
      // ── One-time credit pack purchase ───────────────────────────────────────
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        // ── Pack purchase (one-time payment) ──────────────────────────────────
        if (session.mode === "payment") {
          const orgId  = session.metadata?.org_id;
          const type   = session.metadata?.type;

          // ── BEO-329: Storage add-on purchase ────────────────────────────
          if (type === "storage_addon") {
            const projectId      = session.metadata?.project_id;
            const extraStorageMb = parseInt(session.metadata?.extra_storage_mb ?? "0", 10);
            const extraRows      = parseInt(session.metadata?.extra_rows ?? "0", 10);

            if (!orgId || !projectId || !extraStorageMb) {
              console.warn("[webhook] checkout.session.completed(storage_addon): missing metadata", {
                orgId, projectId, extraStorageMb, extraRows,
              });
              break;
            }

            await db.incrementProjectDbExtraLimits(projectId, extraStorageMb, extraRows);
            console.log("[webhook] storage_addon applied:", { orgId, projectId, extraStorageMb, extraRows });
            break;
          }

          // ── Credit pack purchase ─────────────────────────────────────────
          const packId     = session.metadata?.pack_id;
          const creditsStr = session.metadata?.credits;
          const credits    = creditsStr ? parseFloat(creditsStr) : 0;

          if (!orgId || !credits || credits <= 0) {
            console.warn("[webhook] checkout.session.completed: missing metadata", { orgId, credits });
            break;
          }

          let paymentIntentId: string | null = null;
          if (typeof session.payment_intent === "string") {
            paymentIntentId = session.payment_intent;
          } else if (session.payment_intent && typeof (session.payment_intent as Stripe.PaymentIntent).id === "string") {
            paymentIntentId = (session.payment_intent as Stripe.PaymentIntent).id;
          }
          if (!paymentIntentId) {
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

        // ── New subscription checkout ──────────────────────────────────────────
        // BEO-354/BEO-693: grant plan credits immediately on checkout completion
        // without wiping any existing balance. customer.subscription.created also
        // fires, so this path must stay idempotent across both events.
        if (session.mode === "subscription") {
          const orgId = session.metadata?.org_id;
          if (!orgId) {
            console.warn("[webhook] checkout.session.completed(sub): no org_id", { sessionId: session.id });
            break;
          }

          // Resolve plan: prefer price ID from the subscription object (most reliable),
          // fall back to the plan stored in session metadata by checkout.ts.
          const subId = typeof session.subscription === "string" ? session.subscription : null;
          let plan: string = session.metadata?.plan ?? "pro_starter";
          if (subId) {
            try {
              const sub = await stripe.subscriptions.retrieve(subId);
              const priceId = sub.items.data[0]?.price.id;
              if (priceId && PRICE_TO_PLAN[priceId]) plan = PRICE_TO_PLAN[priceId];
            } catch { /* fall back to metadata plan */ }
          }
          // Normalise checkout.ts aliases ("pro", "starter") → canonical PLAN_LIMITS keys
          if (plan === "pro" || plan === "builder") plan = "pro_builder";
          if (plan === "starter")                   plan = "pro_starter";

          const planLimit = PLAN_LIMITS[plan as keyof typeof PLAN_LIMITS] ?? PLAN_LIMITS.pro_starter;
          const now = new Date();
          const periodEnd = new Date(Date.UTC(
            now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate(),
          )).toISOString();

          const result = await applyImmediateSubscriptionAllocation(db, {
            orgId,
            plan,
            subId,
            planLimit,
            creditsPeriodStart: now.toISOString(),
            creditsPeriodEnd: periodEnd,
            resetRolloverCredits: true,
            allocationDescription: `Subscription activation allocation (${plan})`,
          });
          console.log("[webhook] checkout.session.completed(sub): org upgraded to", plan, {
            orgId,
            monthly: planLimit.credits,
            rolloverCap: planLimit.rolloverCap,
            creditsGranted: result.creditsGranted,
          });

          // BEO-329: Sync DB limits for all DB-enabled projects in this org
          await syncOrgProjectDbLimits(db, orgId, plan);
          await maybeRewardReferralUpgradeForOrg(db, orgId);
          break;
        }

        break;
      }

      // ── Subscription created ────────────────────────────────────────────────
      case "customer.subscription.created": {
        const sub = event.data.object as Stripe.Subscription;
        const orgId = (sub.metadata?.org_id as string | undefined)
          ?? await resolveOrgByCustomer(db, stripe, sub.customer as string);
        if (!orgId) { console.warn("[webhook] subscription.created: no org_id", { subId: sub.id }); break; }

        const priceId = sub.items.data[0]?.price.id;
        const plan = priceId ? (PRICE_TO_PLAN[priceId] ?? sub.metadata?.plan ?? "pro_starter") : "pro_starter";
        const planLimit = PLAN_LIMITS[plan as keyof typeof PLAN_LIMITS] ?? PLAN_LIMITS.pro_starter;

        const periodStart = new Date((sub.billing_cycle_anchor ?? 0) * 1000).toISOString();
        // Estimate period end as 1 month from anchor for subscription.created
        const periodEnd   = new Date(((sub.billing_cycle_anchor ?? 0) + 30 * 24 * 3600) * 1000).toISOString();

        const result = await applyImmediateSubscriptionAllocation(db, {
          orgId,
          plan,
          subId: sub.id,
          planLimit,
          creditsPeriodStart: periodStart,
          creditsPeriodEnd: periodEnd,
          resetRolloverCredits: true,
          allocationDescription: `Subscription activation allocation (${plan})`,
        });
        console.log("[webhook] subscription.created: org upgraded to", plan, {
          orgId,
          creditsGranted: result.creditsGranted,
        });

        // BEO-329: Sync DB limits for all DB-enabled projects in this org
        await syncOrgProjectDbLimits(db, orgId, plan);
        break;
      }

      // ── Subscription updated ─────────────────────────────────────────────────
      // Handles plan upgrades and downgrades.
      // Downgrade: set downgrade_at_period_end=true + pending_plan so credits
      // survive until the billing period ends.
      case "customer.subscription.updated": {
        const sub   = event.data.object as Stripe.Subscription;
        const prevSub = event.data.previous_attributes as Partial<Stripe.Subscription> | undefined;
        const orgId = (sub.metadata?.org_id as string | undefined)
          ?? await resolveOrgByCustomer(db, stripe, sub.customer as string);
        if (!orgId) { console.warn("[webhook] subscription.updated: no org_id", { subId: sub.id }); break; }

        const priceId  = sub.items.data[0]?.price.id;
        const newPlan  = priceId ? (PRICE_TO_PLAN[priceId] ?? sub.metadata?.plan) : undefined;

        if (!newPlan) {
          await db.updateOrg(orgId, { stripe_subscription_id: sub.id });
          break;
        }

        const org = await db.getOrgWithBalance(orgId);
        const currentPlan = org?.plan ?? "free";

        const planOrder: Record<string, number> = {
          free: 0, pro_starter: 1, starter: 1, pro_builder: 2, pro: 2, business: 3,
        };
        const currentRank = planOrder[currentPlan] ?? 0;
        const newRank = planOrder[newPlan] ?? 0;
        const isDowngrade =
          newRank < currentRank;
        const isUpgrade =
          newRank > currentRank && newPlan !== "free";

        const planLimit = PLAN_LIMITS[newPlan as keyof typeof PLAN_LIMITS] ?? PLAN_LIMITS.pro_starter;

        if (isDowngrade) {
          // Schedule downgrade — apply new plan and lower rollover_cap at period end
          await db.updateOrg(orgId, {
            stripe_subscription_id: sub.id,
            downgrade_at_period_end: true,
            pending_plan: newPlan,
          });
          console.log("[webhook] subscription.updated: downgrade scheduled to", newPlan, { orgId });
        } else if (isUpgrade) {
          // Immediate upgrade — preserve the remaining balance and add the new
          // plan allocation on top instead of overwriting the current credits.
          const result = await applyImmediateSubscriptionAllocation(db, {
            orgId,
            plan: newPlan,
            subId: sub.id,
            planLimit,
            allocationDescription: `Plan upgrade allocation (${newPlan})`,
          });
          console.log("[webhook] subscription.updated: org plan upgraded to", newPlan, {
            orgId,
            creditsGranted: result.creditsGranted,
          });

          // BEO-329: Sync DB limits for all DB-enabled projects in this org
          await syncOrgProjectDbLimits(db, orgId, newPlan);
          await maybeRewardReferralUpgradeForOrg(db, orgId);
        } else {
          // Same plan / non-upgrade update — sync Stripe linkage and plan
          // metadata only. Do not reset or add credits on routine updates.
          await db.updateOrg(orgId, {
            plan: newPlan,
            stripe_subscription_id: sub.id,
            monthly_credits: planLimit.credits,
            rollover_cap: planLimit.rolloverCap,
            downgrade_at_period_end: false,
            pending_plan: null,
          });
          console.log("[webhook] subscription.updated: plan metadata synced without credit change", {
            orgId,
            plan: newPlan,
          });
        }

        void prevSub; // suppress unused var warning
        break;
      }

      // ── Subscription cancelled ───────────────────────────────────────────────
      // Schedule downgrade to free at period end — credits survive until then.
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const orgId = (sub.metadata?.org_id as string | undefined)
          ?? await resolveOrgByCustomer(db, stripe, sub.customer as string);
        if (!orgId) { console.warn("[webhook] subscription.deleted: no org_id", { subId: sub.id }); break; }

        await db.updateOrg(orgId, {
          downgrade_at_period_end: true,
          pending_plan: "free",
        });
        console.log("[webhook] subscription.deleted: downgrade to free scheduled at period end", { orgId });
        break;
      }

      // ── Invoice payment succeeded → monthly billing cycle reset ──────────────
      // Calculates rollover from unused prior-period balance, applies new monthly
      // allocation, and resets period timestamps.
      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        if (invoice.billing_reason !== "subscription_cycle") break;

        const customerId = invoice.customer as string;
        const orgId = await resolveOrgByCustomer(db, stripe, customerId);
        if (!orgId) { console.warn("[webhook] invoice.payment_succeeded: no org for customer", { customerId }); break; }

        const org = await db.getOrgWithBalance(orgId);
        if (!org) break;

        // Apply scheduled downgrade if pending
        const effectivePlan = (org.downgrade_at_period_end && org.pending_plan)
          ? org.pending_plan
          : org.plan;
        const planLimit = PLAN_LIMITS[effectivePlan as keyof typeof PLAN_LIMITS] ?? PLAN_LIMITS.free;

        if (!planLimit.credits && effectivePlan === "free") {
          // Free plan: no monthly allocation, just apply the downgrade
          if (org.downgrade_at_period_end) {
            await db.updateOrg(orgId, {
              plan: "free",
              monthly_credits: 0,
              rollover_credits: 0,
              rollover_cap: 0,
              credits: org.topup_credits ?? 0, // only topup survives cancellation
              downgrade_at_period_end: false,
              pending_plan: null,
            });
            console.log("[webhook] invoice.payment_succeeded: downgrade to free applied", { orgId });
          }
          break;
        }

        // Use invoice period timestamps directly (Stripe v22: period_start/end on Invoice)
        const periodStart = new Date((invoice.period_start ?? 0) * 1000).toISOString();
        const periodEnd   = new Date((invoice.period_end   ?? 0) * 1000).toISOString();

        await db.resetOrgBillingCycle(
          orgId,
          planLimit.credits,
          planLimit.rolloverCap,
          periodStart,
          periodEnd,
        );

        // If downgrade was pending, apply the new plan now
        if (org.downgrade_at_period_end && org.pending_plan) {
          await db.updateOrg(orgId, { plan: effectivePlan });
        }

        console.log("[webhook] invoice.payment_succeeded: billing cycle reset", {
          orgId,
          plan: effectivePlan,
          monthly: planLimit.credits,
          rolloverCap: planLimit.rolloverCap,
        });
        break;
      }

      // ── Legacy alias — keep for Stripe dashboard backward compat ─────────────
      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        if (invoice.billing_reason !== "subscription_cycle") break;
        // Handled by invoice.payment_succeeded above — log and skip to avoid double-reset
        console.log("[webhook] invoice.paid received (handled by invoice.payment_succeeded)");
        break;
      }

      // ── Invoice payment failed ───────────────────────────────────────────────
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;
        const orgId = await resolveOrgByCustomer(db, stripe, customerId);
        console.warn("[webhook] invoice.payment_failed:", {
          orgId,
          customerId,
          invoiceId: invoice.id,
          attemptCount: invoice.attempt_count,
        });
        // TODO BEO-327: flag org for payment failure UI nudge
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

  return webhookRoute;
}

async function resolveOrgByCustomer(
  db: ReturnType<typeof createStudioDbClient>,
  _stripe: Stripe,
  customerId: string,
): Promise<string | null> {
  const org = await db.findOrgByStripeCustomerId(customerId);
  return org?.id ?? null;
}

async function maybeRewardReferralUpgradeForOrg(
  db: ReturnType<typeof createStudioDbClient>,
  orgId: string,
): Promise<void> {
  const org = await db.findOrgById(orgId);
  const referredUserId = org?.owner_id ?? null;

  if (!referredUserId) {
    return;
  }

  await applyUpgradeReferralReward(db, referredUserId);
}

/**
 * BEO-329: Update plan_storage_mb, plan_rows, tables_limit for every DB-enabled
 * project in the org when the plan changes.
 * Extra storage purchased via add-ons is preserved (only plan_ columns are touched).
 */
async function syncOrgProjectDbLimits(
  db: ReturnType<typeof createStudioDbClient>,
  orgId: string,
  plan: string,
): Promise<void> {
  try {
    const limits = getFeatureLimits(plan);
    const projects = await db.findProjectsByOrgId(orgId);
    const dbEnabled = projects.filter((p) => p.database_enabled && p.db_provider === "beomz");
    await Promise.all(
      dbEnabled.map((p) =>
        db.updateProjectDbPlanLimits(p.id, {
          plan_storage_mb: limits.storage_mb,
          plan_rows: limits.rows ?? 0,
          tables_limit: limits.tables ?? 0,
        }),
      ),
    );
    console.log("[webhook] syncOrgProjectDbLimits: updated", dbEnabled.length, "project(s) to plan", plan, { orgId });
  } catch (err) {
    console.warn("[webhook] syncOrgProjectDbLimits failed (non-fatal):", err instanceof Error ? err.message : String(err));
  }
}

const webhookRoute = createWebhookRoute();

export default webhookRoute;
