import assert from "node:assert/strict";
import test from "node:test";

import { Hono } from "hono";

import type { OrgContext } from "../../types.js";
import type { ProjectRow } from "@beomz-studio/studio-db";

process.env.STUDIO_SUPABASE_URL ??= "https://example.supabase.co";
process.env.STUDIO_SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
process.env.ANTHROPIC_API_KEY ??= "test-anthropic-key";

const { createProjectsRoute } = await import("./index.js");

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
    db_schema: "app_test_schema",
    db_nonce: null,
    db_provider: "beomz",
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

function createOrgContext(project: ProjectRow, dbOverrides: Partial<OrgContext["db"]> = {}): OrgContext {
  const now = new Date().toISOString();
  return {
    db: {
      findProjectById: async (id: string) => (id === project.id ? project : null),
      deleteProject: async () => undefined,
      deleteProjectDbLimits: async () => undefined,
      ...dbOverrides,
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

function createApp(
  orgContext: OrgContext,
  deps: Parameters<typeof createProjectsRoute>[0] = {},
): Hono {
  const route = createProjectsRoute({
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
  app.route("/projects", route);
  return app;
}

test("project deletion triggers project_db_limits cleanup", async () => {
  const project = createProject();
  let limitsCleanupProjectId: string | null = null;
  const droppedSchemas: string[] = [];
  let deletedRegistrySchema: string | null = null;
  const orgContext = createOrgContext(project, {
    deleteProjectDbLimits: async (projectId: string) => {
      limitsCleanupProjectId = projectId;
    },
  });

  const app = createApp(orgContext, {
    isUserDataConfigured: () => true,
    runSql: async (sql: string) => {
      droppedSchemas.push(sql);
      return [];
    },
    deleteSchemaRegistry: async (schemaName: string) => {
      deletedRegistrySchema = schemaName;
    },
  });

  const response = await app.request(`http://localhost/projects/${project.id}`, {
    method: "DELETE",
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(limitsCleanupProjectId, project.id);
  assert.equal(
    droppedSchemas.some((sql) => sql.includes('DROP SCHEMA IF EXISTS "app_test_schema" CASCADE;')),
    true,
  );
  assert.equal(
    droppedSchemas.some((sql) => sql.includes(`DROP SCHEMA IF EXISTS "project_${project.id}" CASCADE;`)),
    true,
  );
  assert.equal(deletedRegistrySchema, "app_test_schema");
});

test("project deletion cleans up Neon project when neon_project_id exists", async () => {
  const project = createProject({
    db_provider: "neon",
    db_schema: null,
  });
  const neonDeleteCalls: string[] = [];
  const orgContext = createOrgContext(project, {
    getProjectDbLimits: async () => ({
      id: "limits-1",
      project_id: project.id,
      plan_storage_mb: 200,
      plan_rows: 0,
      tables_limit: 0,
      extra_storage_mb: 0,
      extra_rows: 0,
      neon_project_id: "neon-proj-123",
      neon_branch_id: null,
      db_url: "postgresql://user:pass@host/db",
      neon_auth_base_url: null,
      neon_auth_pub_key: null,
      neon_auth_secret_key: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
  });

  const app = createApp(orgContext, {
    isUserDataConfigured: () => true,
    runSql: async () => [],
    deleteSchemaRegistry: async () => undefined,
    deleteNeonProject: async (neonProjectId: string) => {
      neonDeleteCalls.push(neonProjectId);
    },
  });

  const response = await app.request(`http://localhost/projects/${project.id}`, {
    method: "DELETE",
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.deepEqual(neonDeleteCalls, ["neon-proj-123"]);
});

test("byo-db validates connection string format", async () => {
  const project = createProject();
  const orgContext = createOrgContext(project);
  const app = createApp(orgContext, {
    testPostgresConnection: async () => undefined,
  });

  const response = await app.request(`http://localhost/projects/${project.id}/byo-db`, {
    method: "POST",
    body: JSON.stringify({ connectionString: "mysql://root@localhost/app" }),
    headers: { "content-type": "application/json" },
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "Connection string must start with postgres:// or postgresql://",
  });
});

test("byo-db saves validated connection string and returns host", async () => {
  const project = createProject();
  const updates: Record<string, unknown>[] = [];
  const rewired: Array<{ projectId: string; connectionString: string }> = [];
  const orgContext = createOrgContext(project, {
    updateProject: async (_projectId: string, patch: Record<string, unknown>) => {
      updates.push(patch);
      return { ...project, ...patch };
    },
  });
  const app = createApp(orgContext, {
    rewireByoPostgres: async (projectId: string, connectionString: string) => {
      rewired.push({ projectId, connectionString });
    },
    testPostgresConnection: async () => undefined,
  });

  const response = await app.request(`http://localhost/projects/${project.id}/byo-db`, {
    method: "POST",
    body: JSON.stringify({
      connectionString: "postgresql://user:pass@db.example.com:5432/app",
    }),
    headers: { "content-type": "application/json" },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    success: true,
    host: "db.example.com",
  });
  assert.deepEqual(updates, [
    {
      byo_db_url: "postgresql://user:pass@db.example.com:5432/app",
      database_enabled: true,
      db_config: null,
      db_nonce: null,
      db_provider: "postgres",
      db_schema: null,
      db_wired: true,
    },
  ]);
  assert.deepEqual(rewired, [
    {
      projectId: project.id,
      connectionString: "postgresql://user:pass@db.example.com:5432/app",
    },
  ]);
});

test("byo-db returns a clear connection error when SELECT 1 fails", async () => {
  const project = createProject();
  const orgContext = createOrgContext(project, {
    updateProject: async () => project,
  });
  const app = createApp(orgContext, {
    testPostgresConnection: async () => {
      throw new Error("password authentication failed");
    },
  });

  const response = await app.request(`http://localhost/projects/${project.id}/byo-db`, {
    method: "POST",
    body: JSON.stringify({
      connectionString: "postgresql://user:pass@db.example.com:5432/app",
    }),
    headers: { "content-type": "application/json" },
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "Failed to connect to Postgres: password authentication failed",
  });
});
