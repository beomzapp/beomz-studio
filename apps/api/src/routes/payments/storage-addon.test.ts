import assert from "node:assert/strict";
import test from "node:test";

import { Hono } from "hono";

import type { OrgContext } from "../../types.js";
import type { ProjectRow } from "@beomz-studio/studio-db";

process.env.ANTHROPIC_API_KEY ??= "test-anthropic-key";
process.env.STUDIO_SUPABASE_URL ??= "https://example.supabase.co";
process.env.STUDIO_SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
process.env.STRIPE_SECRET_KEY ??= "sk_test_123";
process.env.STRIPE_STORAGE_500MB = "price_500mb_test";
process.env.STRIPE_STORAGE_2GB = "price_2gb_test";
process.env.STRIPE_STORAGE_10GB = "price_10gb_test";
process.env.STRIPE_DEDICATED_DB_MONTHLY = "price_dedicated_test";

const { STORAGE_ADDONS } = await import("../../lib/features.js");
const { createStorageAddonRoute } = await import("./storage-addon.js");

function createProject(overrides: Partial<ProjectRow> = {}): ProjectRow {
  const now = new Date().toISOString();
  return {
    id: "project-1",
    org_id: "org-1",
    name: "Test Project",
    template: "blank",
    status: "ready",
    icon: null,
    created_at: now,
    updated_at: now,
    last_opened_at: null,
    database_enabled: true,
    db_schema: "app_test",
    db_nonce: null,
    db_provider: "beomz",
    db_config: null,
    db_wired: false,
    thumbnail_url: null,
    published: false,
    published_slug: null,
    published_at: null,
    beomz_app_url: null,
    beomz_app_deployed_at: null,
    build_phases: null,
    current_phase: 0,
    phases_total: 0,
    phase_mode: false,
    ...overrides,
  };
}

function createOrgContext(project: ProjectRow, dbOverrides: Partial<OrgContext["db"]> = {}): OrgContext {
  const now = new Date().toISOString();
  return {
    db: {
      findProjectById: async (id: string) => (id === project.id ? project : null),
      updateOrg: async () => undefined,
      ...dbOverrides,
    } as OrgContext["db"],
    jwt: { sub: "platform-user" },
    membership: {
      org_id: "org-1",
      role: "owner",
      user_id: "user-1",
      created_at: now,
    },
    org: {
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
      stripe_customer_id: null,
      stripe_subscription_id: null,
      daily_reset_at: null,
      created_at: now,
    },
    user: {
      id: "user-1",
      email: "omar@example.com",
      platform_user_id: "platform-user",
      created_at: now,
    },
  };
}

function createApp(
  orgContext: OrgContext,
  deps: Parameters<typeof createStorageAddonRoute>[0] = {},
): Hono {
  const sharedDeps = {
    authMiddleware: async (_c, next) => {
      await next();
    },
    loadOrgContextMiddleware: async (c, next) => {
      c.set("orgContext", orgContext);
      await next();
    },
    ...deps,
  };

  const app = new Hono();
  app.route("/payments/storage-addon", createStorageAddonRoute(sharedDeps));
  app.route("/payments/storage-addons", createStorageAddonRoute(sharedDeps));
  return app;
}

test("STORAGE_ADDONS uses the env-driven price IDs", () => {
  assert.equal(STORAGE_ADDONS.length, 3);
  assert.deepEqual(
    STORAGE_ADDONS.map((addon) => addon.price_id),
    ["price_500mb_test", "price_2gb_test", "price_10gb_test"],
  );
});

test("POST /payments/storage-addon/checkout succeeds with a valid price_id", async () => {
  const project = createProject();
  let updatedCustomerId: string | null = null;
  const orgContext = createOrgContext(project, {
    updateOrg: async (_orgId: string, patch: Record<string, unknown>) => {
      updatedCustomerId = patch.stripe_customer_id as string;
      return null;
    },
  });

  const app = createApp(orgContext, {
    createStripe: () => ({
      customers: {
        create: async () => ({ id: "cus_test_123" }),
      },
      checkout: {
        sessions: {
          create: async () => ({ url: "https://checkout.stripe.test/session" }),
        },
      },
    }),
  });

  const response = await app.request("http://localhost/payments/storage-addon/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      priceId: "price_2gb_test",
      projectId: project.id,
    }),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    url: "https://checkout.stripe.test/session",
  });
  assert.equal(updatedCustomerId, "cus_test_123");
});

test("POST /payments/storage-addon/checkout rejects an invalid price_id", async () => {
  const project = createProject();
  const orgContext = createOrgContext(project);
  const app = createApp(orgContext, {
    createStripe: () => {
      assert.fail("Stripe should not be called for invalid price IDs");
    },
  });

  const response = await app.request("http://localhost/payments/storage-addon/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      priceId: "price_invalid",
      projectId: project.id,
    }),
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "invalid_price_id" });
});

test("GET /payments/storage-addons returns the public addon list without price_ids", async () => {
  const project = createProject();
  const orgContext = createOrgContext(project);
  const app = createApp(orgContext);

  const response = await app.request("http://localhost/payments/storage-addons", {
    method: "GET",
  });
  const payload = await response.json() as Array<Record<string, unknown>>;

  assert.equal(response.status, 200);
  assert.equal(payload.length, 3);
  assert.deepEqual(payload, [
    { label: "+500MB", price_usd: 5, extra_storage_mb: 512 },
    { label: "+2GB", price_usd: 12, extra_storage_mb: 2048 },
    { label: "+10GB", price_usd: 29, extra_storage_mb: 10240 },
  ]);
  for (const addon of payload) {
    assert.equal("price_id" in addon, false);
  }
});
