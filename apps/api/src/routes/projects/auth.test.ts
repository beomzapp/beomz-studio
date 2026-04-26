import assert from "node:assert/strict";
import test from "node:test";

import { Hono } from "hono";

import type { OrgContext } from "../../types.js";
import type { ProjectRow } from "@beomz-studio/studio-db";

process.env.STUDIO_SUPABASE_URL ??= "https://example.supabase.co";
process.env.STUDIO_SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
process.env.ANTHROPIC_API_KEY ??= "test-anthropic-key";

const { createProjectAuthRoute, PROJECT_AUTH_CORS_HEADERS } = await import("./auth.js");

function createProject(overrides: Partial<ProjectRow> = {}): ProjectRow {
  const now = new Date().toISOString();
  return {
    id: "project-1",
    org_id: "org-1",
    name: "Auth Proxy Test",
    template: "blank",
    status: "ready",
    icon: null,
    created_at: now,
    updated_at: now,
    last_opened_at: null,
    database_enabled: false,
    db_schema: null,
    db_nonce: null,
    db_provider: null,
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

function createOrgContext(project: ProjectRow, orgId = "org-1"): OrgContext {
  const now = new Date().toISOString();
  return {
    db: {
      findProjectById: async (id: string) => (id === project.id ? project : null),
      getProjectDbLimits: async () => null,
    } as OrgContext["db"],
    jwt: { sub: "platform-user" },
    membership: {
      org_id: orgId,
      role: "owner",
      user_id: "user-1",
      created_at: now,
    },
    org: {
      id: orgId,
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
  deps: Parameters<typeof createProjectAuthRoute>[0] = {},
): Hono {
  const route = createProjectAuthRoute({
    authMiddleware: async (_c, next) => {
      await next();
    },
    loadOrgContextMiddleware: async (c, next) => {
      c.set("orgContext", orgContext);
      await next();
    },
    ...deps,
  });

  const app = new Hono();
  app.route("/projects/:id/auth", route);
  return app;
}

test("project auth signup falls back to mock auth for projects without a DB", async () => {
  const project = createProject();
  const app = createApp(createOrgContext(project));

  const response = await app.request(`http://localhost/projects/${project.id}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "demo@example.com",
      password: "secret123",
    }),
  });

  assert.equal(response.status, 201);
  const payload = await response.json();
  assert.equal(payload.token, "mock-token");
  assert.equal(payload.user.email, "demo@example.com");
  assert.equal(payload.user.role, "user");
  assert.match(String(payload.user.id), /^mock-/);
  assert.equal(response.headers.get("X-Beomz-Auth"), "mock");
  assert.equal(
    response.headers.get("access-control-allow-origin"),
    PROJECT_AUTH_CORS_HEADERS["access-control-allow-origin"],
  );
  assert.equal(
    response.headers.get("cross-origin-resource-policy"),
    PROJECT_AUTH_CORS_HEADERS["cross-origin-resource-policy"],
  );
});

test("project auth route returns 404 for projects outside the user's org", async () => {
  const project = createProject({ org_id: "org-2" });
  const app = createApp(createOrgContext(project, "org-1"));

  const response = await app.request(`http://localhost/projects/${project.id}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "demo@example.com",
      password: "secret123",
    }),
  });

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "Project not found" });
});

test("project auth route responds to CORS preflight", async () => {
  const project = createProject();
  const app = createApp(createOrgContext(project));

  const response = await app.request(`http://localhost/projects/${project.id}/auth/login`, {
    method: "OPTIONS",
  });

  assert.equal(response.status, 204);
  assert.equal(
    response.headers.get("access-control-allow-origin"),
    PROJECT_AUTH_CORS_HEADERS["access-control-allow-origin"],
  );
  assert.equal(
    response.headers.get("access-control-allow-headers"),
    PROJECT_AUTH_CORS_HEADERS["access-control-allow-headers"],
  );
});

test("project auth logout and me delegate to the resolved tier", async () => {
  const project = createProject();
  const seenTokens: string[] = [];
  const app = createApp(createOrgContext(project), {
    resolveAuthTierFn: () => ({
      kind: "neon",
      signup: async () => ({
        token: "unused",
        user: { id: "user-1", email: "demo@example.com", role: "user" },
      }),
      login: async () => ({
        token: "unused",
        user: { id: "user-1", email: "demo@example.com", role: "user" },
      }),
      logout: async (token: string) => {
        seenTokens.push(`logout:${token}`);
        return { success: true };
      },
      me: async (token: string) => {
        seenTokens.push(`me:${token}`);
        return {
          user: {
            id: "user-1",
            email: "demo@example.com",
            role: "user",
          },
        };
      },
    }),
  });

  const logoutResponse = await app.request(`http://localhost/projects/${project.id}/auth/logout`, {
    method: "POST",
    headers: {
      Authorization: "Bearer project-auth-token",
    },
  });

  assert.equal(logoutResponse.status, 200);
  assert.deepEqual(await logoutResponse.json(), { success: true });
  assert.equal(logoutResponse.headers.get("X-Beomz-Auth"), "neon");

  const meResponse = await app.request(`http://localhost/projects/${project.id}/auth/me`, {
    headers: {
      Authorization: "Bearer project-auth-token",
    },
  });

  assert.equal(meResponse.status, 200);
  assert.deepEqual(await meResponse.json(), {
    user: {
      id: "user-1",
      email: "demo@example.com",
      role: "user",
    },
  });
  assert.deepEqual(seenTokens, [
    "logout:project-auth-token",
    "me:project-auth-token",
  ]);
});
