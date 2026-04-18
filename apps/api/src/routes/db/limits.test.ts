import assert from "node:assert/strict";
import test from "node:test";

import { Hono } from "hono";

import type { OrgContext } from "../../types.js";
import type { ProjectRow } from "@beomz-studio/studio-db";

process.env.ANTHROPIC_API_KEY ??= "test-anthropic-key";
process.env.STUDIO_SUPABASE_URL ??= "https://example.supabase.co";
process.env.STUDIO_SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const { getFeatureLimits } = await import("../../lib/features.js");
const {
  countActiveDbEnabledProjects,
  createEnableDbRoute,
} = await import("./enable.js");
const { createMigrateDbRoute } = await import("./migrate.js");

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

function createTestOrgContext(
  project: ProjectRow,
  dbOverrides: Partial<OrgContext["db"]> = {},
  plan = "free",
): OrgContext {
  const now = new Date().toISOString();

  return {
    db: {
      findProjectById: async (id: string) => (id === project.id ? project : null),
      countDbEnabledProjectsByOrgId: async () => 0,
      findProjectsByOrgId: async () => [project],
      updateProject: async (_id: string, patch: Record<string, unknown>) => ({
        ...project,
        ...patch,
      }) as ProjectRow,
      insertProjectDbLimits: async () => ({
        id: "limits-1",
        project_id: project.id,
        plan_storage_mb: 200,
        plan_rows: 0,
        tables_limit: 0,
        extra_storage_mb: 0,
        extra_rows: 0,
        created_at: now,
        updated_at: now,
      }),
      getProjectDbLimits: async () => null,
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
      plan,
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

function mountRoute(path: string, route: Hono): Hono {
  const app = new Hono();
  app.route(path, route);
  return app;
}

function createEnableApp(
  orgContext: OrgContext,
  deps: Parameters<typeof createEnableDbRoute>[0] = {},
): Hono {
  const route = createEnableDbRoute({
    authMiddleware: async (_c, next) => {
      await next();
    },
    loadOrgContextMiddleware: async (c, next) => {
      c.set("orgContext", orgContext);
      await next();
    },
    ...deps,
  });
  return mountRoute("/projects/:id/db/enable", route);
}

function createMigrateApp(
  orgContext: OrgContext,
  deps: Parameters<typeof createMigrateDbRoute>[0] = {},
): Hono {
  const route = createMigrateDbRoute({
    authMiddleware: async (_c, next) => {
      await next();
    },
    loadOrgContextMiddleware: async (c, next) => {
      c.set("orgContext", orgContext);
      await next();
    },
    ...deps,
  });
  return mountRoute("/projects/:id/db/migrate", route);
}

test("getFeatureLimits returns the Apr 18 storage and db project caps", () => {
  assert.equal(getFeatureLimits("free").storage_mb, 200);
  assert.equal(getFeatureLimits("free").db_projects, 1);
  assert.equal(getFeatureLimits("business").db_projects, 1);
  assert.equal(getFeatureLimits("business").storage_mb, 15360);
});

test("countActiveDbEnabledProjects excludes deleted projects", () => {
  const count = countActiveDbEnabledProjects([
    createProject({ id: "active-1", database_enabled: true }),
    createProject({
      id: "deleted-1",
      database_enabled: true,
      deleted_at: "2026-04-18T12:00:00.000Z",
    }),
    createProject({ id: "inactive-1", database_enabled: false }),
  ]);

  assert.equal(count, 1);
});

test("db enable succeeds when the org has 0 DB-enabled projects", async () => {
  const project = createProject();
  const insertCalls: Array<{ storageMb: number; rows: number; tables: number }> = [];
  const orgContext = createTestOrgContext(project, {
    findProjectsByOrgId: async () => [],
    insertProjectDbLimits: async (_projectId: string, storageMb: number, rows: number, tables: number) => {
      insertCalls.push({ storageMb, rows, tables });
      return {
        id: "limits-1",
        project_id: project.id,
        plan_storage_mb: storageMb,
        plan_rows: rows,
        tables_limit: tables,
        extra_storage_mb: 0,
        extra_rows: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    },
  });

  const app = createEnableApp(orgContext, {
    isUserDataConfigured: () => true,
    runSql: async () => [],
    createBeomzDbFunction: async () => undefined,
    insertSchemaRegistry: async () => undefined,
    exposeSchemaInPostgREST: async () => undefined,
  });

  const response = await app.request(`http://localhost/projects/${project.id}/db/enable`, {
    method: "POST",
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "connected" });
  assert.deepEqual(insertCalls, [{ storageMb: 200, rows: 0, tables: 0 }]);
});

test("db enable returns the spec 402 when the org already has 1 DB-enabled project", async () => {
  const project = createProject();
  let provisioningCalls = 0;
  const orgContext = createTestOrgContext(project, {
    findProjectsByOrgId: async () => [createProject({ id: "active-1", database_enabled: true })],
  });

  const app = createEnableApp(orgContext, {
    isUserDataConfigured: () => true,
    runSql: async () => {
      provisioningCalls += 1;
      return [];
    },
    createBeomzDbFunction: async () => {
      provisioningCalls += 1;
    },
    insertSchemaRegistry: async () => {
      provisioningCalls += 1;
    },
    exposeSchemaInPostgREST: async () => {
      provisioningCalls += 1;
    },
  });

  const response = await app.request(`http://localhost/projects/${project.id}/db/enable`, {
    method: "POST",
  });
  const payload = await response.json();

  assert.equal(response.status, 402);
  assert.deepEqual(payload, {
    status: 402,
    error: "db_project_limit_reached",
    current: 1,
    limit: 1,
    plan: "free",
  });
  assert.equal(provisioningCalls, 0);
});

test("db enable keeps existing enabled projects untouched even when the org already has 1 DB-enabled project", async () => {
  const project = createProject({
    database_enabled: true,
    db_provider: "beomz",
  });
  let countCalls = 0;
  const orgContext = createTestOrgContext(project, {
    findProjectsByOrgId: async () => {
      countCalls += 1;
      return [createProject({ id: "active-1", database_enabled: true })];
    },
  });

  const app = createEnableApp(orgContext, {
    isUserDataConfigured: () => true,
  });

  const response = await app.request(`http://localhost/projects/${project.id}/db/enable`, {
    method: "POST",
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    status: "already_connected",
    provider: "beomz",
  });
  assert.equal(countCalls, 0);
});

test("db migrate still returns 402 storage_limit_reached when storage is exhausted", async () => {
  const project = createProject({
    database_enabled: true,
    db_provider: "beomz",
    db_schema: "app_test",
  });
  const orgContext = createTestOrgContext(project, {
    getProjectDbLimits: async () => ({
      id: "limits-1",
      project_id: project.id,
      plan_storage_mb: 200,
      plan_rows: 0,
      tables_limit: 0,
      extra_storage_mb: 0,
      extra_rows: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
  });

  const app = createMigrateApp(orgContext, {
    isUserDataConfigured: () => true,
    isAllowedMigrationStatement: () => true,
    runSql: async (sql: string) => {
      if (sql.includes("SUM(n_live_tup)")) return [{ rows_used: "10" }];
      if (sql.includes("AS storage_mb")) return [{ storage_mb: "200" }];
      return [];
    },
  });

  const response = await app.request(`http://localhost/projects/${project.id}/db/migrate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sql: ["INSERT INTO users (id) VALUES (1)"] }),
  });
  const payload = await response.json();

  assert.equal(response.status, 402);
  assert.equal(payload.error, "storage_limit_reached");
});

test('db enable maps "Resource has been removed" to a friendly 400 response', async () => {
  const project = createProject();
  const orgContext = createTestOrgContext(project, {
    findProjectsByOrgId: async () => [],
  });

  const app = createEnableApp(orgContext, {
    isUserDataConfigured: () => true,
    runSql: async () => {
      throw new Error('SQL execution failed (400): {"message":"Resource has been removed"}');
    },
  });

  const response = await app.request(`http://localhost/projects/${project.id}/db/enable`, {
    method: "POST",
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "db_setup_failed",
    message: "Something went wrong setting up your database. Please try again.",
  });
});

test("db migrate no longer returns 402 for row or table limits", async () => {
  const project = createProject({
    database_enabled: true,
    db_provider: "beomz",
    db_schema: "app_test",
  });
  const executedStatements: string[] = [];
  const orgContext = createTestOrgContext(project, {
    getProjectDbLimits: async () => ({
      id: "limits-1",
      project_id: project.id,
      plan_storage_mb: 200,
      plan_rows: 100,
      tables_limit: 1,
      extra_storage_mb: 0,
      extra_rows: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
  });

  const app = createMigrateApp(orgContext, {
    isUserDataConfigured: () => true,
    isAllowedMigrationStatement: () => true,
    runSql: async (sql: string) => {
      if (sql.includes("COUNT(*) AS tables_used")) {
        assert.fail("tables_limit_reached query should not run");
      }
      if (sql.includes("SUM(n_live_tup)")) return [{ rows_used: "999999" }];
      if (sql.includes("AS storage_mb")) return [{ storage_mb: "10" }];
      executedStatements.push(sql.trim());
      return [];
    },
  });

  const response = await app.request(`http://localhost/projects/${project.id}/db/migrate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sql: [
        "CREATE TABLE widgets (id uuid primary key)",
        "INSERT INTO widgets (id) VALUES ('00000000-0000-0000-0000-000000000000')",
      ],
    }),
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(payload, { applied: 2 });
  assert.ok(executedStatements.some((sql) => sql.startsWith("CREATE TABLE widgets")));
  assert.ok(executedStatements.some((sql) => sql.startsWith("INSERT INTO widgets")));
});
