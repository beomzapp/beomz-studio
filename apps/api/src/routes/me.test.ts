import assert from "node:assert/strict";
import test from "node:test";

import { Hono } from "hono";

import type { OrgContext } from "../types.js";

process.env.ANTHROPIC_API_KEY ??= "test-anthropic-key";
process.env.STUDIO_SUPABASE_URL ??= "https://example.supabase.co";
process.env.STUDIO_SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const { createMeRoute } = await import("./me.js");

function createOrgContext(): OrgContext {
  const now = new Date().toISOString();
  return {
    db: {
      getOrgWithBalance: async () => ({
        id: "org-1",
        owner_id: "user-1",
        name: "Test Org",
        plan: "starter",
        credits: 40,
        topup_credits: 5,
        monthly_credits: 40,
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
      }),
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
      plan: "starter",
      credits: 40,
      topup_credits: 5,
      monthly_credits: 40,
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

test("GET /me returns the current user profile with plan and total credits", async () => {
  const orgContext = createOrgContext();
  const route = createMeRoute({
    authMiddleware: async (_c, next) => { await next(); },
    loadOrgContextMiddleware: async (c, next) => {
      c.set("orgContext", orgContext);
      await next();
    },
    fetchUserProfile: async () => ({
      id: "user-1",
      email: "omar@example.com",
      created_at: "2026-04-19T00:00:00.000Z",
      full_name: "Omar Fareda",
      display_name: "omar-fareda",
      avatar_url: "https://example.com/avatar.png",
      building_for: "SaaS",
      referral_source: "Twitter/X",
      onboarding_completed: false,
      workspace_knowledge: "Always optimize for fast launch cycles.",
    }),
  });

  const app = new Hono();
  app.route("/me", route);

  const response = await app.request("http://localhost/me");

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    id: "user-1",
    email: "omar@example.com",
    full_name: "Omar Fareda",
    display_name: "omar-fareda",
    avatar_url: "https://example.com/avatar.png",
    building_for: "SaaS",
    referral_source: "Twitter/X",
    onboarding_completed: false,
    workspace_knowledge: "Always optimize for fast launch cycles.",
    created_at: "2026-04-19T00:00:00.000Z",
    plan: "starter",
    credits: 45,
  });
});

test("PATCH /me validates display_name and updates full_name and display_name separately", async () => {
  const orgContext = createOrgContext();
  const updates: unknown[] = [];
  const route = createMeRoute({
    authMiddleware: async (_c, next) => { await next(); },
    loadOrgContextMiddleware: async (c, next) => {
      c.set("orgContext", orgContext);
      await next();
    },
    fetchUserProfile: async () => null,
    updateUserProfile: async (_userId, patch) => {
      updates.push(patch);
      return {
        id: "user-1",
        email: "omar@example.com",
        created_at: "2026-04-19T00:00:00.000Z",
        full_name: "Omar Fareda",
        display_name: "omar-builds",
        avatar_url: null,
        building_for: "Agency",
        referral_source: null,
        onboarding_completed: false,
        workspace_knowledge: "Prefer polished dashboards.",
      };
    },
  });

  const app = new Hono();
  app.route("/me", route);

  const invalidResponse = await app.request("http://localhost/me", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ display_name: "!!" }),
  });

  assert.equal(invalidResponse.status, 400);

  const validResponse = await app.request("http://localhost/me", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      full_name: "Omar Fareda",
      display_name: "omar-builds",
      building_for: "Agency",
      workspace_knowledge: "Prefer polished dashboards.",
    }),
  });

  assert.equal(validResponse.status, 200);
  assert.deepEqual(updates, [
    {
      full_name: "Omar Fareda",
      display_name: "omar-builds",
      building_for: "Agency",
      workspace_knowledge: "Prefer polished dashboards.",
    },
  ]);
  assert.deepEqual(await validResponse.json(), {
    id: "user-1",
    email: "omar@example.com",
    full_name: "Omar Fareda",
    display_name: "omar-builds",
    avatar_url: null,
    building_for: "Agency",
    referral_source: null,
    onboarding_completed: false,
    workspace_knowledge: "Prefer polished dashboards.",
    created_at: "2026-04-19T00:00:00.000Z",
    plan: "starter",
    credits: 45,
  });
});

test("POST /me/complete-onboarding marks onboarding as complete", async () => {
  const orgContext = createOrgContext();
  const completed: string[] = [];
  const route = createMeRoute({
    authMiddleware: async (_c, next) => { await next(); },
    loadOrgContextMiddleware: async (c, next) => {
      c.set("orgContext", orgContext);
      await next();
    },
    fetchUserProfile: async () => null,
    completeOnboarding: async (userId) => {
      completed.push(userId);
    },
  });

  const app = new Hono();
  app.route("/me", route);

  const response = await app.request("http://localhost/me/complete-onboarding", {
    method: "POST",
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true });
  assert.deepEqual(completed, ["user-1"]);
});
