import assert from "node:assert/strict";
import test from "node:test";

import { Hono } from "hono";

import type { OrgContext } from "../../types.js";

process.env.ANTHROPIC_API_KEY ??= "test-anthropic-key";
process.env.STUDIO_SUPABASE_URL ??= "https://example.supabase.co";
process.env.STUDIO_SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const { createRequireAdmin } = await import("../../middleware/requireAdmin.js");
const { buildHeatmap, createAdminHeatmapRoute } = await import("./heatmap.js");

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

test("buildHeatmap groups by country using the most recent event per user and tracks active users", () => {
  const now = Date.parse("2026-04-27T13:30:00.000Z");

  const points = buildHeatmap([
    {
      country_code: "US",
      country_name: "United States",
      created_at: "2026-04-27T13:20:00.000Z",
      lat: 40,
      lng: -74,
      user_id: "user-1",
    },
    {
      country_code: "CA",
      country_name: "Canada",
      created_at: "2026-04-27T13:10:00.000Z",
      lat: 56,
      lng: -106,
      user_id: "user-1",
    },
    {
      country_code: "US",
      country_name: "United States",
      created_at: "2026-04-27T12:40:00.000Z",
      lat: 34,
      lng: -118,
      user_id: "user-2",
    },
    {
      country_code: "AE",
      country_name: "United Arab Emirates",
      created_at: "2026-04-27T13:25:00.000Z",
      lat: 25.2048,
      lng: 55.2708,
      user_id: "user-3",
    },
    {
      country_code: "AE",
      country_name: "United Arab Emirates",
      created_at: "2026-04-27T13:15:00.000Z",
      lat: null,
      lng: null,
      user_id: "user-4",
    },
    {
      country_code: "US",
      country_name: "United States",
      created_at: "2026-04-27T13:05:00.000Z",
      lat: 37.7749,
      lng: -122.4194,
      user_id: null,
    },
  ], now);

  assert.deepEqual(points, [
    {
      active: 1,
      country_code: "US",
      country_name: "United States",
      lat: 37,
      lng: -96,
      total: 2,
    },
    {
      active: 1,
      country_code: "AE",
      country_name: "United Arab Emirates",
      lat: 25.2048,
      lng: 55.2708,
      total: 1,
    },
  ]);
});

test("GET /admin/heatmap defaults to 24h and returns grouped country totals", async () => {
  const ranges: string[] = [];
  const app = createApp(createAdminHeatmapRoute({
    authMiddleware: async (_c, next) => {
      await next();
    },
    getHeatmap: async (range) => {
      ranges.push(range);
      return [{
        active: 1,
        country_code: "US",
        country_name: "United States",
        lat: 37.0902,
        lng: -95.7129,
        total: 3,
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
    active: 1,
    country_code: "US",
    country_name: "United States",
    lat: 37.0902,
    lng: -95.7129,
    total: 3,
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
