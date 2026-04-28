import assert from "node:assert/strict";
import test from "node:test";

import type Stripe from "stripe";
import type { OrgRow, StudioDbClient } from "@beomz-studio/studio-db";

process.env.ANTHROPIC_API_KEY ??= "test-anthropic-key";
process.env.STUDIO_SUPABASE_URL ??= "https://example.supabase.co";
process.env.STUDIO_SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
process.env.STRIPE_SECRET_KEY ??= "sk_test_123";
process.env.STRIPE_WEBHOOK_SECRET ??= "whsec_test_123";
process.env.STRIPE_STARTER_MONTHLY_PRICE_ID ??= "price_starter_monthly";
process.env.STRIPE_BUSINESS_MONTHLY_PRICE_ID ??= "price_business_monthly";

const { PLAN_LIMITS } = await import("../../lib/credits.js");
const { createWebhookRoute } = await import("./webhook.js");

function createOrg(overrides: Partial<OrgRow> = {}): OrgRow {
  const now = new Date().toISOString();
  return {
    id: "org-1",
    owner_id: "user-1",
    name: "Test Org",
    plan: "free",
    credits: 0,
    topup_credits: 0,
    monthly_credits: 0,
    rollover_credits: 0,
    rollover_cap: 0,
    credits_period_start: null,
    credits_period_end: null,
    downgrade_at_period_end: false,
    pending_plan: null,
    stripe_customer_id: "cus_test_123",
    stripe_subscription_id: null,
    daily_reset_at: null,
    created_at: now,
    ...overrides,
  };
}

function createDb(org: OrgRow) {
  const creditGrants: Array<{ amount: number; description: string }> = [];
  let resetCalls = 0;

  const db = {
    client: {
      from: (table: string) => {
        assert.equal(table, "credit_transactions");
        return {
          insert: async (row: Record<string, unknown>) => {
            creditGrants.push({
              amount: Number(row.amount ?? 0),
              description: String(row.description ?? ""),
            });
            return { error: null };
          },
        };
      },
    },
    getOrgWithBalance: async (_orgId: string) => ({ ...org }),
    updateOrg: async (_orgId: string, patch: Record<string, unknown>) => {
      Object.assign(org, patch);
      return { ...org };
    },
    resetOrgMonthlyCredits: async () => {
      resetCalls += 1;
    },
    findOrgById: async () => null,
    findOrgByStripeCustomerId: async (customerId: string) =>
      customerId === org.stripe_customer_id ? { ...org } : null,
    findProjectsByOrgId: async () => [],
    updateProjectDbPlanLimits: async () => undefined,
    incrementProjectDbExtraLimits: async () => undefined,
    applyOrgTopupPurchase: async () => true,
    resetOrgBillingCycle: async () => undefined,
  } as unknown as StudioDbClient;

  return {
    db,
    creditGrants,
    getResetCalls: () => resetCalls,
  };
}

function createStripeMock(subscriptionPrices: Record<string, string> = {}): Stripe {
  return {
    webhooks: {
      constructEvent: (rawBody: string) => JSON.parse(rawBody) as Stripe.Event,
    },
    subscriptions: {
      retrieve: async (subscriptionId: string) => ({
        id: subscriptionId,
        items: {
          data: [
            {
              price: {
                id: subscriptionPrices[subscriptionId] ?? process.env.STRIPE_STARTER_MONTHLY_PRICE_ID,
              },
            },
          ],
        },
      }),
    },
    checkout: {
      sessions: {
        retrieve: async (sessionId: string) => ({
          id: sessionId,
          payment_intent: "pi_test_123",
        }),
      },
    },
  } as unknown as Stripe;
}

async function postWebhookEvent(
  route: ReturnType<typeof createWebhookRoute>,
  event: Record<string, unknown>,
) {
  return route.request("http://localhost/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "stripe-signature": "sig_test_123",
    },
    body: JSON.stringify(event),
  });
}

test("customer.subscription.updated upgrade preserves existing credits and adds new allocation", async () => {
  const existingCredits = 87;
  const org = createOrg({
    plan: "pro_starter",
    credits: existingCredits,
    monthly_credits: PLAN_LIMITS.pro_starter.credits,
    rollover_credits: 12,
    rollover_cap: PLAN_LIMITS.pro_starter.rolloverCap,
    stripe_subscription_id: "sub_upgrade_123",
  });
  const { db, creditGrants, getResetCalls } = createDb(org);
  const route = createWebhookRoute({
    createStudioDbClient: () => db,
    createStripe: () => createStripeMock(),
  });

  const response = await postWebhookEvent(route, {
    id: "evt_upgrade_123",
    type: "customer.subscription.updated",
    data: {
      object: {
        id: "sub_upgrade_123",
        customer: "cus_test_123",
        metadata: { org_id: org.id },
        items: {
          data: [
            {
              price: {
                id: process.env.STRIPE_BUSINESS_MONTHLY_PRICE_ID,
              },
            },
          ],
        },
      },
      previous_attributes: {},
    },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { received: true });
  assert.equal(org.plan, "business");
  assert.equal(org.credits, existingCredits + PLAN_LIMITS.business.credits);
  assert.equal(org.monthly_credits, PLAN_LIMITS.business.credits);
  assert.equal(org.rollover_credits, 12);
  assert.equal(creditGrants.length, 1);
  assert.deepEqual(creditGrants[0], {
    amount: PLAN_LIMITS.business.credits,
    description: "Plan upgrade allocation (business)",
  });
  assert.equal(getResetCalls(), 0);
});

test("checkout activation preserves existing credits and subscription.created does not double-add", async () => {
  const existingCredits = 55;
  const org = createOrg({
    credits: existingCredits,
    stripe_subscription_id: null,
  });
  const { db, creditGrants, getResetCalls } = createDb(org);
  const route = createWebhookRoute({
    createStudioDbClient: () => db,
    createStripe: () => createStripeMock({
      sub_checkout_123: process.env.STRIPE_STARTER_MONTHLY_PRICE_ID ?? "price_starter_monthly",
    }),
  });

  const checkoutResponse = await postWebhookEvent(route, {
    id: "evt_checkout_123",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_123",
        mode: "subscription",
        metadata: {
          org_id: org.id,
          plan: "starter",
        },
        subscription: "sub_checkout_123",
      },
    },
  });

  assert.equal(checkoutResponse.status, 200);
  assert.equal(org.plan, "pro_starter");
  assert.equal(org.credits, existingCredits + PLAN_LIMITS.pro_starter.credits);
  assert.equal(creditGrants.length, 1);

  const createdResponse = await postWebhookEvent(route, {
    id: "evt_created_123",
    type: "customer.subscription.created",
    data: {
      object: {
        id: "sub_checkout_123",
        customer: "cus_test_123",
        metadata: {
          org_id: org.id,
          plan: "pro_starter",
        },
        billing_cycle_anchor: 1_714_000_000,
        items: {
          data: [
            {
              price: {
                id: process.env.STRIPE_STARTER_MONTHLY_PRICE_ID,
              },
            },
          ],
        },
      },
    },
  });

  assert.equal(createdResponse.status, 200);
  assert.deepEqual(await createdResponse.json(), { received: true });
  assert.equal(org.credits, existingCredits + PLAN_LIMITS.pro_starter.credits);
  assert.equal(creditGrants.length, 1);
  assert.deepEqual(creditGrants[0], {
    amount: PLAN_LIMITS.pro_starter.credits,
    description: "Subscription activation allocation (pro_starter)",
  });
  assert.equal(getResetCalls(), 0);
});
