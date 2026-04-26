import assert from "node:assert/strict";
import test from "node:test";

import { Hono } from "hono";
import type { OrgContext } from "../../types.js";

process.env.ANTHROPIC_API_KEY ??= "test-anthropic-key";
process.env.STUDIO_SUPABASE_URL ??= "https://example.supabase.co";
process.env.STUDIO_SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const { createRequireAdmin } = await import("../../middleware/requireAdmin.js");
const { createAdminUsersRoute } = await import("./users.js");

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

function createApp(route: ReturnType<typeof createAdminUsersRoute>) {
  const app = new Hono();
  app.route("/admin/users", route);
  return app;
}

test("GET /admin/users rejects non-admin users", async () => {
  const app = createApp(createAdminUsersRoute({
    authMiddleware: async (_c, next) => {
      await next();
    },
    listUsers: async () => {
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

  const response = await app.request("http://localhost/admin/users");
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "Admin access required." });
});

test("GET /admin/users parses query params and returns the paginated list payload", async () => {
  const calls: Array<Record<string, unknown>> = [];
  const app = createApp(createAdminUsersRoute({
    authMiddleware: async (_c, next) => {
      await next();
    },
    listUsers: async (input) => {
      calls.push(input);
      return {
        limit: input.limit,
        page: input.page,
        total: 1,
        users: [
          {
            created_at: "2026-04-26T10:00:00.000Z",
            credits: 125,
            email: "omar@example.com",
            id: "user-1",
            last_active: "2026-04-26T11:00:00.000Z",
            name: "Omar Fareda",
            org_id: "org-1",
            plan: "pro_builder",
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

  const response = await app.request("http://localhost/admin/users?search=omar&plan=pro_builder&page=2&limit=25");
  assert.equal(response.status, 200);
  assert.deepEqual(calls, [
    {
      limit: 25,
      page: 2,
      plan: "pro_builder",
      search: "omar",
    },
  ]);
  assert.deepEqual(await response.json(), {
    limit: 25,
    page: 2,
    total: 1,
    users: [
      {
        created_at: "2026-04-26T10:00:00.000Z",
        credits: 125,
        email: "omar@example.com",
        id: "user-1",
        last_active: "2026-04-26T11:00:00.000Z",
        name: "Omar Fareda",
        org_id: "org-1",
        plan: "pro_builder",
      },
    ],
  });
});

test("GET /admin/users/:id/credits returns the latest credit transactions", async () => {
  const app = createApp(createAdminUsersRoute({
    authMiddleware: async (_c, next) => {
      await next();
    },
    getUserCreditHistory: async (userId) => {
      assert.equal(userId, "user-1");
      return [
        {
          created_at: "2026-04-26T12:00:00.000Z",
          delta: 50,
          id: "txn-1",
          reason: "Manual goodwill credit",
          source: "manual_admin",
        },
      ];
    },
    loadOrgContextMiddleware: async (c, next) => {
      c.set("orgContext", createOrgContext());
      await next();
    },
    requireAdminMiddleware: createRequireAdmin({
      fetchAdminStatus: async () => true,
    }),
  }));

  const response = await app.request("http://localhost/admin/users/user-1/credits");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    transactions: [
      {
        created_at: "2026-04-26T12:00:00.000Z",
        delta: 50,
        id: "txn-1",
        reason: "Manual goodwill credit",
        source: "manual_admin",
      },
    ],
  });
});

test("POST /admin/users/:id/credits validates the body and returns the updated balance", async () => {
  const calls: Array<Record<string, unknown>> = [];
  const app = createApp(createAdminUsersRoute({
    adjustUserCredits: async (input) => {
      calls.push(input);
      return { credits: 275 };
    },
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

  const invalidResponse = await app.request("http://localhost/admin/users/user-1/credits", {
    body: JSON.stringify({ delta: "20", reason: "" }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  assert.equal(invalidResponse.status, 400);

  const response = await app.request("http://localhost/admin/users/user-1/credits", {
    body: JSON.stringify({ delta: -25, reason: "Refunded duplicate grant" }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  assert.equal(response.status, 200);
  assert.deepEqual(calls, [
    {
      delta: -25,
      reason: "Refunded duplicate grant",
      userId: "user-1",
    },
  ]);
  assert.deepEqual(await response.json(), { credits: 275 });
});
