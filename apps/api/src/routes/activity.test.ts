import assert from "node:assert/strict";
import test from "node:test";

import { Hono } from "hono";

import type { OrgContext } from "../types.js";

process.env.ANTHROPIC_API_KEY ??= "test-anthropic-key";
process.env.STUDIO_SUPABASE_URL ??= "https://example.supabase.co";
process.env.STUDIO_SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const { createActivityRoute } = await import("./activity.js");

function createOrgContext(): OrgContext {
  const now = new Date().toISOString();
  return {
    db: {
      listRecentActivityByOrgId: async () => [],
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

test("GET /activity returns build, iteration, and publish events for the studio homepage", async () => {
  const orgContext = createOrgContext();
  orgContext.db.listRecentActivityByOrgId = async () => ([
    {
      id: "build-1",
      project_id: "project-1",
      project_name: "Taskly",
      created_at: "2026-04-26T15:00:00.000Z",
      event_type: "build_complete",
    },
    {
      id: "build-2",
      project_id: "project-1",
      project_name: "Taskly",
      created_at: "2026-04-26T16:00:00.000Z",
      event_type: "iteration_complete",
    },
    {
      id: "project-2:published",
      project_id: "project-2",
      project_name: "Launchpad",
      created_at: "2026-04-26T17:00:00.000Z",
      event_type: "published",
    },
  ]);

  const app = new Hono();
  app.route("/", createActivityRoute({
    authMiddleware: async (_c, next) => {
      await next();
    },
    loadOrgContextMiddleware: async (c, next) => {
      c.set("orgContext", orgContext);
      await next();
    },
  }));

  const response = await app.request("http://localhost/?limit=3");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    activity: [
      {
        appName: "Taskly",
        createdAt: "2026-04-26T15:00:00.000Z",
        description: "Taskly — new build",
        id: "build-1",
        label: "Taskly — new build",
        projectId: "project-1",
        projectName: "Taskly",
        type: "build_complete",
      },
      {
        appName: "Taskly",
        createdAt: "2026-04-26T16:00:00.000Z",
        description: "Taskly — updated",
        id: "build-2",
        label: "Taskly — updated",
        projectId: "project-1",
        projectName: "Taskly",
        type: "iteration_complete",
      },
      {
        appName: "Launchpad",
        createdAt: "2026-04-26T17:00:00.000Z",
        description: "Launchpad published",
        id: "project-2:published",
        label: "Launchpad published",
        projectId: "project-2",
        projectName: "Launchpad",
        type: "published",
      },
    ],
    events: [
      {
        appName: "Taskly",
        createdAt: "2026-04-26T15:00:00.000Z",
        description: "Taskly — new build",
        id: "build-1",
        label: "Taskly — new build",
        projectId: "project-1",
        projectName: "Taskly",
        type: "build_complete",
      },
      {
        appName: "Taskly",
        createdAt: "2026-04-26T16:00:00.000Z",
        description: "Taskly — updated",
        id: "build-2",
        label: "Taskly — updated",
        projectId: "project-1",
        projectName: "Taskly",
        type: "iteration_complete",
      },
      {
        appName: "Launchpad",
        createdAt: "2026-04-26T17:00:00.000Z",
        description: "Launchpad published",
        id: "project-2:published",
        label: "Launchpad published",
        projectId: "project-2",
        projectName: "Launchpad",
        type: "published",
      },
    ],
  });
});
