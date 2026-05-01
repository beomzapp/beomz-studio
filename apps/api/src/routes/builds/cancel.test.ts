import assert from "node:assert/strict";
import test from "node:test";

import { Hono } from "hono";

import type { OrgContext } from "../../types.js";

const { createBuildsCancelRoute } = await import("./cancel.js");
const { registerActiveBuild, unregisterActiveBuild } = await import("../../lib/activeBuilds.js");

function createOrgContext(status: string): OrgContext {
  const now = new Date().toISOString();

  return {
    db: {
      findGenerationById: async (id: string) => (
        id === "build-1"
          ? {
              id,
              project_id: "project-1",
              status,
            }
          : null
      ),
      findProjectById: async (id: string) => (
        id === "project-1"
          ? {
              id,
              org_id: "org-1",
            }
          : null
      ),
    } as OrgContext["db"],
    jwt: { sub: "platform-user" },
    membership: { org_id: "org-1", role: "owner", user_id: "user-1", created_at: now },
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

function createRoute(orgContext: OrgContext) {
  const route = createBuildsCancelRoute({
    authMiddleware: async (_c, next) => {
      await next();
    },
    loadOrgContextMiddleware: async (c, next) => {
      c.set("orgContext", orgContext);
      await next();
    },
  });

  const app = new Hono();
  app.route("/builds/:id/cancel", route);
  return app;
}

test("POST /builds/:id/cancel aborts an active build explicitly", async () => {
  const controller = new AbortController();
  registerActiveBuild("build-1", "project-1", controller);

  try {
    const route = createRoute(createOrgContext("running"));
    const response = await route.request("http://localhost/builds/build-1/cancel", {
      method: "POST",
    });

    assert.equal(response.status, 202);
    assert.equal(controller.signal.aborted, true);
    assert.equal(controller.signal.reason, "cancelled_by_user");
  } finally {
    unregisterActiveBuild("build-1");
  }
});

test("POST /builds/:id/cancel rejects terminal builds", async () => {
  const route = createRoute(createOrgContext("completed"));
  const response = await route.request("http://localhost/builds/build-1/cancel", {
    method: "POST",
  });

  assert.equal(response.status, 409);
});
