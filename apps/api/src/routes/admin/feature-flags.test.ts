import assert from "node:assert/strict";
import test from "node:test";

import { Hono } from "hono";

import type { OrgContext } from "../../types.js";

process.env.ANTHROPIC_API_KEY ??= "test-anthropic-key";
process.env.STUDIO_SUPABASE_URL ??= "https://example.supabase.co";
process.env.STUDIO_SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const { createRequireAdmin } = await import("../../middleware/requireAdmin.js");
const { createAdminFeatureFlagsRoute } = await import("./feature-flags.js");

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

function createApp(route: ReturnType<typeof createAdminFeatureFlagsRoute>) {
  const app = new Hono();
  app.route("/admin/feature-flags", route);
  return app;
}

test("GET /admin/feature-flags rejects non-admin users", async () => {
  const app = createApp(createAdminFeatureFlagsRoute({
    authMiddleware: async (_c, next) => {
      await next();
    },
    getFeatureFlags: async () => {
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

  const response = await app.request("http://localhost/admin/feature-flags");
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "Admin access required." });
});

test("GET /admin/feature-flags returns all flags", async () => {
  const app = createApp(createAdminFeatureFlagsRoute({
    authMiddleware: async (_c, next) => {
      await next();
    },
    getFeatureFlags: async () => ({
      experimental_banner: {
        enabled: true,
      },
      modules: {
        agents: "live",
        images: "coming_soon",
        mobile_apps: "coming_soon",
        videos: "coming_soon",
        web_apps: "live",
        websites: "disabled",
      },
    }),
    loadOrgContextMiddleware: async (c, next) => {
      c.set("orgContext", createOrgContext());
      await next();
    },
    requireAdminMiddleware: createRequireAdmin({
      fetchAdminStatus: async () => true,
    }),
  }));

  const response = await app.request("http://localhost/admin/feature-flags");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    experimental_banner: {
      enabled: true,
    },
    modules: {
      agents: "live",
      images: "coming_soon",
      mobile_apps: "coming_soon",
      videos: "coming_soon",
      web_apps: "live",
      websites: "disabled",
    },
  });
});

test("PATCH /admin/feature-flags validates module flag values", async () => {
  const app = createApp(createAdminFeatureFlagsRoute({
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
    updateFeatureFlags: async () => {
      throw new Error("should not be called");
    },
  }));

  const response = await app.request("http://localhost/admin/feature-flags", {
    body: JSON.stringify({
      modules: {
        agents: "live",
        images: "soon",
        mobile_apps: "coming_soon",
        videos: "coming_soon",
        web_apps: "live",
        websites: "live",
      },
    }),
    headers: { "Content-Type": "application/json" },
    method: "PATCH",
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    details: {
      fieldErrors: {
        images: ["Invalid enum value. Expected 'live' | 'coming_soon' | 'disabled', received 'soon'"],
      },
      formErrors: [],
    },
    error: "Invalid feature flags payload.",
  });
});

test("PATCH /admin/feature-flags updates and returns all flags", async () => {
  let receivedBody: Record<string, unknown> | null = null;

  const app = createApp(createAdminFeatureFlagsRoute({
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
    updateFeatureFlags: async (input) => {
      receivedBody = input;
      return {
        custom_rollout: "beta",
        modules: input.modules,
      };
    },
  }));

  const response = await app.request("http://localhost/admin/feature-flags", {
    body: JSON.stringify({
      custom_rollout: "beta",
      modules: {
        agents: "disabled",
        images: "coming_soon",
        mobile_apps: "coming_soon",
        videos: "disabled",
        web_apps: "live",
        websites: "live",
      },
    }),
    headers: { "Content-Type": "application/json" },
    method: "PATCH",
  });

  assert.deepEqual(receivedBody, {
    custom_rollout: "beta",
    modules: {
      agents: "disabled",
      images: "coming_soon",
      mobile_apps: "coming_soon",
      videos: "disabled",
      web_apps: "live",
      websites: "live",
    },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    custom_rollout: "beta",
    modules: {
      agents: "disabled",
      images: "coming_soon",
      mobile_apps: "coming_soon",
      videos: "disabled",
      web_apps: "live",
      websites: "live",
    },
  });
});
