import assert from "node:assert/strict";
import test from "node:test";

import type { ProjectDbLimitsRow, ProjectRow } from "@beomz-studio/studio-db";
import { Hono } from "hono";

import type { OrgContext } from "../../types.js";

process.env.ANTHROPIC_API_KEY ??= "test-anthropic-key";
process.env.STUDIO_SUPABASE_URL ??= "https://example.supabase.co";
process.env.STUDIO_SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
process.env.PROJECT_JWT_SECRET ??= "project-jwt-secret";

const { createDataDbRoute } = await import("./data.js");
const { createProjectAuthRoute } = await import("../auth/project-auth.js");

function createProject(overrides: Partial<ProjectRow> = {}): ProjectRow {
  const now = new Date().toISOString();
  return {
    id: "project-1",
    org_id: "org-1",
    name: "Test Project",
    template: "blank",
    status: "ready",
    icon: null,
    created_at: now,
    updated_at: now,
    last_opened_at: null,
    database_enabled: true,
    db_schema: null,
    db_nonce: null,
    db_provider: "neon",
    db_config: null,
    db_wired: true,
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

function createLimits(overrides: Partial<ProjectDbLimitsRow> = {}): ProjectDbLimitsRow {
  const now = new Date().toISOString();
  return {
    id: "limits-1",
    project_id: "project-1",
    plan_storage_mb: 200,
    plan_rows: 1000,
    tables_limit: 20,
    extra_storage_mb: 50,
    extra_rows: 250,
    neon_project_id: "neon-project-1",
    neon_branch_id: "branch-1",
    db_url: "postgresql://user:pass@host/db",
    neon_auth_base_url: null,
    neon_auth_pub_key: null,
    neon_auth_secret_key: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

function createOrgContext(
  project: ProjectRow,
  limits: ProjectDbLimitsRow | null,
): OrgContext {
  const now = new Date().toISOString();
  return {
    db: {
      findProjectById: async (id: string) => (id === project.id ? project : null),
      getProjectDbLimits: async (projectId: string) => (projectId === project.id ? limits : null),
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

function mountRoute(path: string, route: Hono, orgContext: OrgContext): Hono {
  const app = new Hono();
  app.use(path, async (c, next) => {
    c.set("orgContext", orgContext);
    await next();
  });
  app.route(path, route);
  return app;
}

test("db data returns rows and columns for Neon projects", async () => {
  const project = createProject();
  const limits = createLimits();
  const orgContext = createOrgContext(project, limits);

  const app = mountRoute(
    "/projects/:id/db/data",
    createDataDbRoute({
      authMiddleware: async (_c, next) => { await next(); },
      loadOrgContextMiddleware: async (_c, next) => { await next(); },
      fetchTableRows: async () => ({
        rows: [{ id: 1, title: "Ship it" }],
        columns: ["id", "title"],
      }),
    }),
    orgContext,
  );

  const response = await app.request(
    `http://localhost/projects/${project.id}/db/data?table=workspace_todos`,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    rows: [{ id: 1, title: "Ship it" }],
    columns: ["id", "title"],
  });
});

test("project auth signup, login, and me return JWT-backed user data", async () => {
  const project = createProject();
  const limits = createLimits();
  const createdUser = {
    id: 7,
    email: "new@example.com",
    name: "New User",
    created_at: "2026-04-19T12:00:00.000Z",
  };
  let userCreated = false;

  const route = createProjectAuthRoute({
    createStudioDbClient: () => ({
      findProjectById: async (projectId: string) => (projectId === project.id ? project : null),
      getProjectDbLimits: async (projectId: string) => (projectId === project.id ? limits : null),
    }),
    createUsersTable: async () => undefined,
    getUserByEmail: async (_dbUrl, email) => {
      if (userCreated && email === "new@example.com") {
        return {
          ...createdUser,
          password_hash: "hashed-password",
        };
      }
      return null;
    },
    getUserById: async (_dbUrl, id) => (id === createdUser.id ? createdUser : null),
    insertUser: async (_dbUrl, input) => {
      userCreated = true;
      return {
        ...createdUser,
        email: input.email,
        name: input.name ?? null,
      };
    },
    hashPassword: async (password) => `hashed:${password}`,
    comparePassword: async (password, hash) => hash === `hashed:${password}` || hash === "hashed-password",
    signJwt: ((payload: string | object | Buffer) => {
      const typedPayload = payload as { sub: string };
      return `token-for-${typedPayload.sub}`;
    }) as typeof import("jsonwebtoken").default.sign,
    verifyJwt: ((token: string) => {
      if (token !== `token-for-${createdUser.id}`) {
        throw new Error("invalid token");
      }
      return {
        sub: String(createdUser.id),
        projectId: project.id,
        email: createdUser.email,
        type: "project-auth",
      };
    }) as typeof import("jsonwebtoken").default.verify,
  });

  const app = new Hono();
  app.route("/projects/:projectId/auth", route);

  const signupResponse = await app.request(`http://localhost/projects/${project.id}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: createdUser.email,
      password: "secret123",
      name: createdUser.name,
    }),
  });

  assert.equal(signupResponse.status, 201);
  assert.deepEqual(await signupResponse.json(), {
    token: "token-for-7",
    user: createdUser,
  });

  const loginResponse = await app.request(`http://localhost/projects/${project.id}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: createdUser.email,
      password: "secret123",
    }),
  });

  assert.equal(loginResponse.status, 200);
  assert.deepEqual(await loginResponse.json(), {
    token: "token-for-7",
    user: createdUser,
  });

  const meResponse = await app.request(`http://localhost/projects/${project.id}/auth/me`, {
    headers: { Authorization: "Bearer token-for-7" },
  });

  assert.equal(meResponse.status, 200);
  assert.deepEqual(await meResponse.json(), {
    user: createdUser,
  });
});
