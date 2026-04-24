import assert from "node:assert/strict";
import test from "node:test";

import { Hono } from "hono";

import type { OrgContext } from "../../types.js";
import type { ProjectDbLimitsRow, ProjectRow } from "@beomz-studio/studio-db";

process.env.ANTHROPIC_API_KEY ??= "test-anthropic-key";
process.env.STUDIO_SUPABASE_URL ??= "https://example.supabase.co";
process.env.STUDIO_SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const { createStatusDbRoute } = await import("./status.js");
const {
  createSchemaDbRoute,
  listSupabaseSchemaTables,
  listSupabaseSchemaTablesWithServiceRole,
} = await import("./schema.js");
const { encryptProjectSecret } = await import("../../lib/projectSecrets.js");
const { createUsageDbRoute } = await import("./usage.js");

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

test("db status returns 200 + neon dbUrl for wired Neon projects", async () => {
  const project = createProject();
  const limits = createLimits();
  const orgContext = createOrgContext(project, limits);

  const app = mountRoute(
    "/projects/:id/db/status",
    createStatusDbRoute({
      authMiddleware: async (_c, next) => { await next(); },
      loadOrgContextMiddleware: async (_c, next) => { await next(); },
    }),
    orgContext,
  );

  const response = await app.request(`http://localhost/projects/${project.id}/db/status`);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    enabled: true,
    provider: "neon",
    wired: true,
    dbUrl: "postgresql://user:pass@host/db",
  });
});

test("db status returns BYO Supabase env + host even when managed DB flags are false", async () => {
  const project = createProject({
    database_enabled: false,
    db_provider: null,
    db_wired: false,
    byo_db_url: "https://demo-project.supabase.co",
    byo_db_anon_key: "anon-key",
  });
  const orgContext = createOrgContext(project, null);

  const app = mountRoute(
    "/projects/:id/db/status",
    createStatusDbRoute({
      authMiddleware: async (_c, next) => { await next(); },
      loadOrgContextMiddleware: async (_c, next) => { await next(); },
    }),
    orgContext,
  );

  const response = await app.request(`http://localhost/projects/${project.id}/db/status`);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    enabled: true,
    provider: "byo",
    wired: true,
    supabaseUrl: "https://demo-project.supabase.co",
    anonKey: "anon-key",
    schemaName: "public",
    byoDbHost: "demo-project.supabase.co",
    env: {
      url: "https://demo-project.supabase.co",
      anonKey: "anon-key",
      dbSchema: "public",
      nonce: "",
    },
  });
});

test("db status infers neon when legacy project row is missing db_provider but has a neon db_url", async () => {
  const project = createProject({ db_provider: null });
  const limits = createLimits();
  const orgContext = createOrgContext(project, limits);

  const app = mountRoute(
    "/projects/:id/db/status",
    createStatusDbRoute({
      authMiddleware: async (_c, next) => { await next(); },
      loadOrgContextMiddleware: async (_c, next) => { await next(); },
    }),
    orgContext,
  );

  const response = await app.request(`http://localhost/projects/${project.id}/db/status`);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    enabled: true,
    provider: "neon",
    wired: true,
    dbUrl: "postgresql://user:pass@host/db",
  });
});

test("db schema returns live tables for Neon projects", async () => {
  const project = createProject();
  const limits = createLimits();
  const orgContext = createOrgContext(project, limits);

  const app = mountRoute(
    "/projects/:id/db/schema",
    createSchemaDbRoute({
      authMiddleware: async (_c, next) => { await next(); },
      loadOrgContextMiddleware: async (_c, next) => { await next(); },
      getNeonSchemaTableList: async () => [
        {
          table_name: "workspace_todos",
          columns: [
            { name: "id", type: "integer" },
            { name: "title", type: "text" },
          ],
        },
      ],
    }),
    orgContext,
  );

  const response = await app.request(`http://localhost/projects/${project.id}/db/schema`);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    tables: [
      {
        table_name: "workspace_todos",
        columns: [
          { name: "id", type: "integer" },
          { name: "title", type: "text" },
        ],
      },
    ],
  });
});

test("db schema returns BYO Supabase tables using byo_db_url + byo_db_anon_key first", async () => {
  const project = createProject({
    database_enabled: false,
    db_provider: null,
    db_wired: false,
    byo_db_url: "https://demo-project.supabase.co",
    byo_db_anon_key: "anon-key",
  });
  const orgContext = createOrgContext(project, null);

  const app = mountRoute(
    "/projects/:id/db/schema",
    createSchemaDbRoute({
      authMiddleware: async (_c, next) => { await next(); },
      loadOrgContextMiddleware: async (_c, next) => { await next(); },
      listSupabaseSchemaTables: async () => ({
        tables: [
          {
            table_name: "todos",
            columns: [
              { name: "id", type: "uuid" },
              { name: "title", type: "text" },
            ],
          },
        ],
      }),
    }),
    orgContext,
  );

  const response = await app.request(`http://localhost/projects/${project.id}/db/schema`);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    tables: [
      {
        table_name: "todos",
        columns: [
          { name: "id", type: "uuid" },
          { name: "title", type: "text" },
        ],
      },
    ],
  });
});

test("db schema falls back to service_role introspection when the OpenAPI spec returns no tables", async () => {
  const project = createProject({
    database_enabled: false,
    db_provider: null,
    db_wired: false,
    byo_db_url: "https://demo-project.supabase.co",
    byo_db_anon_key: "anon-key",
    byo_db_service_key: encryptProjectSecret("service-role-key"),
  });
  const orgContext = createOrgContext(project, null);

  const app = mountRoute(
    "/projects/:id/db/schema",
    createSchemaDbRoute({
      authMiddleware: async (_c, next) => { await next(); },
      loadOrgContextMiddleware: async (_c, next) => { await next(); },
      listSupabaseSchemaTables: async () => ({ tables: [] }),
      listSupabaseSchemaTablesWithServiceRole: async (supabaseUrl: string, serviceRoleKey: string) => {
        assert.equal(supabaseUrl, "https://demo-project.supabase.co");
        assert.equal(serviceRoleKey, "service-role-key");
        return {
          tables: [
            { table_name: "profiles", columns: [] },
            { table_name: "todos", columns: [] },
          ],
        };
      },
    }),
    orgContext,
  );

  const response = await app.request(`http://localhost/projects/${project.id}/db/schema`);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    tables: [
      { table_name: "profiles", columns: [] },
      { table_name: "todos", columns: [] },
    ],
  });
});

test("listSupabaseSchemaTables parses BYO tables from the OpenAPI spec without exec_sql", async () => {
  const result = await listSupabaseSchemaTables(
    "https://demo-project.supabase.co",
    "anon-key",
    async () => new Response(JSON.stringify({
      paths: {
        "/todos": {
          get: {
            responses: {
              "200": {
                content: {
                  "application/json": {
                    schema: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          id: { type: "string", format: "uuid" },
                          title: { type: "string" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        "/rpc/exec_sql": {},
      },
    }), {
      status: 200,
      headers: { "Content-Type": "application/openapi+json" },
    }),
  );

  assert.deepEqual(result, {
    tables: [
      {
        table_name: "todos",
        columns: [
          { name: "id", type: "string" },
          { name: "title", type: "string" },
        ],
      },
    ],
  });
});

test("listSupabaseSchemaTables returns an empty table list when the OpenAPI spec is unavailable", async () => {
  const result = await listSupabaseSchemaTables(
    "https://demo-project.supabase.co",
    "anon-key",
    async () => new Response("missing", { status: 404 }),
  );

  assert.deepEqual(result, { tables: [] });
});

test("listSupabaseSchemaTablesWithServiceRole returns public base table names", async () => {
  const originalFetch = globalThis.fetch;
  const fetchCalls: Array<{ url: string; headers: HeadersInit | undefined }> = [];
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    fetchCalls.push({ url: String(input), headers: init?.headers });
    return new Response(JSON.stringify([
      { table_name: "todos" },
      { table_name: "profiles" },
      { table_name: "todos" },
      { table_name: "invalid-name!" },
    ]), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const result = await listSupabaseSchemaTablesWithServiceRole(
      "https://demo-project.supabase.co",
      "service-role-key",
    );

    assert.deepEqual(result, {
      tables: [
        { table_name: "profiles", columns: [] },
        { table_name: "todos", columns: [] },
      ],
    });
    assert.equal(fetchCalls.length > 0, true);
    assert.match(fetchCalls[0]?.url ?? "", /demo-project\.supabase\.co\/rest\/v1\/tables/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("db usage returns Neon metrics with legacy-compatible keys", async () => {
  const project = createProject();
  const limits = createLimits();
  const orgContext = createOrgContext(project, limits);

  const app = mountRoute(
    "/projects/:id/db/usage",
    createUsageDbRoute({
      authMiddleware: async (_c, next) => { await next(); },
      loadOrgContextMiddleware: async (_c, next) => { await next(); },
      getNeonUsage: async () => ({
        storageMbUsed: 12.34,
        rowsUsed: 77,
        tablesUsed: 3,
      }),
    }),
    orgContext,
  );

  const response = await app.request(`http://localhost/projects/${project.id}/db/usage`);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    used_mb: 12.34,
    rows_used: 77,
    tables_used: 3,
    storage_mb_used: 12.34,
    limits: {
      storage_mb: 250,
      total_storage_mb: 250,
      total_rows: 1250,
      tables_limit: 20,
    },
  });
});
