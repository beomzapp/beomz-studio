import assert from "node:assert/strict";
import test from "node:test";

import { Hono } from "hono";

import type { OrgContext } from "../../types.js";

process.env.ANTHROPIC_API_KEY ??= "test-anthropic-key";
process.env.STUDIO_SUPABASE_URL ??= "https://example.supabase.co";
process.env.STUDIO_SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const { createRequireAdmin } = await import("../../middleware/requireAdmin.js");
const { calculateAdminBuildDurationMs, createAdminBuildsRoute } = await import("./builds.js");

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

function createApp(route: ReturnType<typeof createAdminBuildsRoute>) {
  const app = new Hono();
  app.route("/admin/builds", route);
  return app;
}

test("calculateAdminBuildDurationMs returns the completed build duration in milliseconds", () => {
  assert.equal(
    calculateAdminBuildDurationMs("2026-04-26T09:55:00.000Z", "2026-04-26T09:59:00.000Z"),
    240000,
  );
  assert.equal(calculateAdminBuildDurationMs("2026-04-26T10:00:00.000Z", null), null);
});

test("GET /admin/builds rejects non-admin users", async () => {
  const app = createApp(createAdminBuildsRoute({
    authMiddleware: async (_c, next) => {
      await next();
    },
    getBuilds: async () => {
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

  const response = await app.request("http://localhost/admin/builds");
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "Admin access required." });
});

test("GET /admin/builds returns in-flight and recent build payloads", async () => {
  const app = createApp(createAdminBuildsRoute({
    authMiddleware: async (_c, next) => {
      await next();
    },
    getBuilds: async () => ({
      builds: [
        {
          completed_at: null,
          cost_usd: null,
          duration_ms: null,
          error_reason: null,
          id: "build-1",
          project_id: "project-1",
          started_at: "2026-04-26T10:00:00.000Z",
          status: "building",
          token_usage: null,
          tokens_used: null,
          user_email: "omar@example.com",
        },
        {
          completed_at: "2026-04-26T09:59:00.000Z",
          cost_usd: 1.234567,
          duration_ms: 240000,
          error_reason: null,
          id: "build-2",
          project_id: "project-2",
          started_at: "2026-04-26T09:55:00.000Z",
          status: "success",
          token_usage: 12345,
          tokens_used: 12345,
          user_email: "team@example.com",
        },
      ],
      in_flight: [
        {
          completed_at: null,
          cost_usd: null,
          duration_ms: null,
          error_reason: null,
          id: "build-1",
          project_id: "project-1",
          started_at: "2026-04-26T10:00:00.000Z",
          status: "building",
          token_usage: null,
          tokens_used: null,
          user_email: "omar@example.com",
        },
      ],
      recent: [
        {
          completed_at: "2026-04-26T09:59:00.000Z",
          cost_usd: 1.234567,
          duration_ms: 240000,
          error_reason: null,
          id: "build-2",
          project_id: "project-2",
          started_at: "2026-04-26T09:55:00.000Z",
          status: "success",
          token_usage: 12345,
          tokens_used: 12345,
          user_email: "team@example.com",
        },
      ],
    }),
    loadOrgContextMiddleware: async (c, next) => {
      c.set("orgContext", createOrgContext());
      await next();
    },
    requireAdminMiddleware: createRequireAdmin({
      fetchAdminStatus: async () => true,
    }),
  }));

  const response = await app.request("http://localhost/admin/builds");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    builds: [
      {
        completed_at: null,
        cost_usd: null,
        duration_ms: null,
        error_reason: null,
        id: "build-1",
        project_id: "project-1",
        started_at: "2026-04-26T10:00:00.000Z",
        status: "building",
        token_usage: null,
        tokens_used: null,
        user_email: "omar@example.com",
      },
      {
        completed_at: "2026-04-26T09:59:00.000Z",
        cost_usd: 1.234567,
        duration_ms: 240000,
        error_reason: null,
        id: "build-2",
        project_id: "project-2",
        started_at: "2026-04-26T09:55:00.000Z",
        status: "success",
        token_usage: 12345,
        tokens_used: 12345,
        user_email: "team@example.com",
      },
    ],
    in_flight: [
      {
        completed_at: null,
        cost_usd: null,
        duration_ms: null,
        error_reason: null,
        id: "build-1",
        project_id: "project-1",
        started_at: "2026-04-26T10:00:00.000Z",
        status: "building",
        token_usage: null,
        tokens_used: null,
        user_email: "omar@example.com",
      },
    ],
    recent: [
      {
        completed_at: "2026-04-26T09:59:00.000Z",
        cost_usd: 1.234567,
        duration_ms: 240000,
        error_reason: null,
        id: "build-2",
        project_id: "project-2",
        started_at: "2026-04-26T09:55:00.000Z",
        status: "success",
        token_usage: 12345,
        tokens_used: 12345,
        user_email: "team@example.com",
      },
    ],
  });
});

test("GET /admin/builds/stats returns today stats payload", async () => {
  const app = createApp(createAdminBuildsRoute({
    authMiddleware: async (_c, next) => {
      await next();
    },
    getBuildStats: async () => ({
      avg_tokens: 43210,
      success_rate: 87.5,
      today_failed: 2,
      today_success: 14,
      today_total: 18,
    }),
    loadOrgContextMiddleware: async (c, next) => {
      c.set("orgContext", createOrgContext());
      await next();
    },
    requireAdminMiddleware: createRequireAdmin({
      fetchAdminStatus: async () => true,
    }),
  }));

  const response = await app.request("http://localhost/admin/builds/stats");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    avg_tokens: 43210,
    success_rate: 87.5,
    today_failed: 2,
    today_success: 14,
    today_total: 18,
  });
});
