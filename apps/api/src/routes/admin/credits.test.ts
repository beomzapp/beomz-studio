import assert from "node:assert/strict";
import test from "node:test";

import { Hono } from "hono";

import type { OrgContext } from "../../types.js";

process.env.ANTHROPIC_API_KEY ??= "test-anthropic-key";
process.env.STUDIO_SUPABASE_URL ??= "https://example.supabase.co";
process.env.STUDIO_SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const { createRequireAdmin } = await import("../../middleware/requireAdmin.js");
const { createAdminCreditsRoute } = await import("./credits.js");

function createOrgContext(): OrgContext {
  const now = new Date().toISOString();
  return {
    db: {} as OrgContext["db"],
    jwt: { sub: "platform-user" },
    membership: {
      created_at: now,
      org_id: "org-1",
      role: "owner",
      user_id: "user-1",
    },
    org: {
      created_at: now,
      credits: 40,
      credits_period_end: null,
      credits_period_start: null,
      daily_reset_at: null,
      downgrade_at_period_end: false,
      id: "org-1",
      monthly_credits: 40,
      name: "Test Org",
      owner_id: "user-1",
      pending_plan: null,
      plan: "pro_builder",
      rollover_cap: 0,
      rollover_credits: 0,
      stripe_customer_id: null,
      stripe_subscription_id: null,
      topup_credits: 5,
    },
    user: {
      created_at: now,
      email: "omar@example.com",
      id: "user-1",
      platform_user_id: "platform-user",
    },
  };
}

function createApp(route: ReturnType<typeof createAdminCreditsRoute>) {
  const app = new Hono();
  app.route("/admin/credits", route);
  return app;
}

test("GET /admin/credits rejects non-admin users", async () => {
  const app = createApp(createAdminCreditsRoute({
    authMiddleware: async (_c, next) => {
      await next();
    },
    listCredits: async () => {
      throw new Error("should not be called");
    },
    loadOrgContextMiddleware: async (c, next) => {
      c.set("orgContext", createOrgContext());
      await next();
    },
    requireAdminMiddleware: createRequireAdmin({
      fetchAdminStatus: async () => false,
    }),
  }));

  const response = await app.request("http://localhost/admin/credits");
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "Admin access required." });
});

test("GET /admin/credits parses query params and returns paginated ledger data", async () => {
  const calls: Array<Record<string, unknown>> = [];
  const app = createApp(createAdminCreditsRoute({
    authMiddleware: async (_c, next) => {
      await next();
    },
    listCredits: async (input) => {
      calls.push(input);
      return {
        limit: input.limit,
        page: input.page,
        total: 1,
        transactions: [
          {
            created_at: "2026-04-26T12:00:00.000Z",
            delta: -12.5,
            id: "txn-1",
            reason: "App generation",
            source: "build",
            user_email: "omar@example.com",
          },
        ],
      };
    },
    loadOrgContextMiddleware: async (c, next) => {
      c.set("orgContext", createOrgContext());
      await next();
    },
    requireAdminMiddleware: createRequireAdmin({
      fetchAdminStatus: async () => true,
    }),
  }));

  const response = await app.request("http://localhost/admin/credits?source=build&page=2&limit=25");
  assert.equal(response.status, 200);
  assert.deepEqual(calls, [
    {
      limit: 25,
      page: 2,
      source: "build",
    },
  ]);
  assert.deepEqual(await response.json(), {
    limit: 25,
    page: 2,
    total: 1,
    transactions: [
      {
        created_at: "2026-04-26T12:00:00.000Z",
        delta: -12.5,
        id: "txn-1",
        reason: "App generation",
        source: "build",
        user_email: "omar@example.com",
      },
    ],
  });
});

test("GET /admin/credits validates pagination query params", async () => {
  const app = createApp(createAdminCreditsRoute({
    authMiddleware: async (_c, next) => {
      await next();
    },
    loadOrgContextMiddleware: async (c, next) => {
      c.set("orgContext", createOrgContext());
      await next();
    },
    requireAdminMiddleware: createRequireAdmin({
      fetchAdminStatus: async () => true,
    }),
  }));

  const response = await app.request("http://localhost/admin/credits?page=0&limit=999");
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    details: {
      fieldErrors: {
        limit: ["Too big: expected number to be <=200"],
        page: ["Too small: expected number to be >=1"],
      },
      formErrors: [],
    },
    error: "Invalid credits query.",
  });
});
