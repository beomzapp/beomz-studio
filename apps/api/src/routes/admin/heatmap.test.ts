import assert from "node:assert/strict";
import test from "node:test";

import { Hono } from "hono";

import type { OrgContext } from "../../types.js";

process.env.ANTHROPIC_API_KEY ??= "test-anthropic-key";
process.env.STUDIO_SUPABASE_URL ??= "https://example.supabase.co";
process.env.STUDIO_SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const { createRequireAdmin } = await import("../../middleware/requireAdmin.js");
const { createAdminHeatmapRoute } = await import("./heatmap.js");

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

function createApp(route: ReturnType<typeof createAdminHeatmapRoute>) {
  const app = new Hono();
  app.route("/admin/heatmap", route);
  return app;
}

test("GET /admin/heatmap rejects non-admin users", async () => {
  const app = createApp(createAdminHeatmapRoute({
    authMiddleware: async (_c, next) => {
      await next();
    },
    getHeatmap: async () => {
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

  const response = await app.request("http://localhost/admin/heatmap");
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "Admin access required." });
});

test("GET /admin/heatmap defaults to 24h and returns grouped points", async () => {
  const ranges: string[] = [];
  const app = createApp(createAdminHeatmapRoute({
    authMiddleware: async (_c, next) => {
      await next();
    },
    getHeatmap: async (range) => {
      ranges.push(range);
      return [{
        count: 3,
        country_code: "US",
        country_name: "United States",
        lat: 37.0902,
        lng: -95.7129,
      }];
    },
    loadOrgContextMiddleware: async (c, next) => {
      c.set("orgContext", createOrgContext());
      await next();
    },
    requireAdminMiddleware: createRequireAdmin({
      fetchAdminStatus: async () => true,
    }),
  }));

  const response = await app.request("http://localhost/admin/heatmap");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), [{
    count: 3,
    country_code: "US",
    country_name: "United States",
    lat: 37.0902,
    lng: -95.7129,
  }]);
  assert.deepEqual(ranges, ["24h"]);
});

test("GET /admin/heatmap validates the range query", async () => {
  const app = createApp(createAdminHeatmapRoute({
    authMiddleware: async (_c, next) => {
      await next();
    },
    getHeatmap: async () => [],
    loadOrgContextMiddleware: async (c, next) => {
      c.set("orgContext", createOrgContext());
      await next();
    },
    requireAdminMiddleware: createRequireAdmin({
      fetchAdminStatus: async () => true,
    }),
  }));

  const response = await app.request("http://localhost/admin/heatmap?range=30d");
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    details: {
      fieldErrors: {
        range: ["Invalid enum value. Expected '1h' | '24h' | '7d' | 'all', received '30d'"],
      },
      formErrors: [],
    },
    error: "Invalid heatmap query.",
  });
});
