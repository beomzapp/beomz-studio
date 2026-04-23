import assert from "node:assert/strict";
import test from "node:test";

import { Hono } from "hono";

import type { OrgContext } from "../../types.js";
import type { ProjectRow } from "@beomz-studio/studio-db";
import type { StudioFile } from "@beomz-studio/contracts";

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
      findLatestGenerationByProjectId: async () => null,
      createGeneration: async (input: Record<string, unknown>) => input,
      updateProject: async (_projectId: string, patch: Record<string, unknown>) => ({ ...project, ...patch }),
      deleteProject: async () => undefined,
      deleteProjectDbLimits: async () => undefined,
      getProjectDbLimits: async () => null,
      updateProjectDbConnection: async () => undefined,
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

test("byo-db validates Supabase URL format", async () => {
  const project = createProject();
  const orgContext = createOrgContext(project);
  const app = createApp(orgContext);

  const response = await app.request(`http://localhost/projects/${project.id}/byo-db`, {
    method: "POST",
    body: JSON.stringify({
      supabaseUrl: "http://demo-project.supabase.co",
      supabaseAnonKey: "anon-key",
    }),
    headers: { "content-type": "application/json" },
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "Supabase URL must start with https://",
  });
});

test("byo-db requires Supabase anon key", async () => {
  const project = createProject();
  const orgContext = createOrgContext(project);
  const app = createApp(orgContext);

  const response = await app.request(`http://localhost/projects/${project.id}/byo-db`, {
    method: "POST",
    body: JSON.stringify({
      supabaseUrl: "https://demo-project.supabase.co",
    }),
    headers: { "content-type": "application/json" },
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "supabaseAnonKey is required",
  });
});

test("byo-db runs migration, saves Supabase credentials, and returns host", async () => {
  const project = createProject();
  const updates: Record<string, unknown>[] = [];
  let migrationRuns = 0;
  const orgContext = createOrgContext(project, {
    updateProject: async (_projectId: string, patch: Record<string, unknown>) => {
      updates.push(patch);
      return { ...project, ...patch };
    },
  });
  const app = createApp(orgContext, {
    ensureByoDbAnonKeyColumn: async () => {
      migrationRuns += 1;
    },
  });

  const response = await app.request(`http://localhost/projects/${project.id}/byo-db`, {
    method: "POST",
    body: JSON.stringify({
      supabaseUrl: "https://demo-project.supabase.co",
      supabaseAnonKey: "anon-key",
    }),
    headers: { "content-type": "application/json" },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    success: true,
    host: "demo-project.supabase.co",
    wiring: false,
  });
  assert.equal(migrationRuns, 1);
  assert.deepEqual(updates, [
    {
      byo_db_url: "https://demo-project.supabase.co",
      byo_db_anon_key: "anon-key",
    },
  ]);
});

test("byo-db queues a silent auto-wire iteration when a previous build exists", async () => {
  const project = createProject({ template: "workspace-task" });
  const existingFiles: StudioFile[] = [
    {
      path: "App.tsx",
      kind: "route",
      language: "tsx",
      content: "export default function App() { return <div>Hello</div>; }\n",
      source: "ai",
      locked: false,
    },
  ];
  const updates: Record<string, unknown>[] = [];
  const createdGenerations: Record<string, unknown>[] = [];
  const buildRuns: Array<Record<string, unknown>> = [];
  const orgContext = createOrgContext(project, {
    updateProject: async (_projectId: string, patch: Record<string, unknown>) => {
      updates.push(patch);
      return { ...project, ...patch };
    },
    findLatestGenerationByProjectId: async () => ({
      id: "generation-prev",
      files: existingFiles,
    }),
    createGeneration: async (input: Record<string, unknown>) => {
      createdGenerations.push(input);
      return {
        ...input,
        project_id: project.id,
        template_id: project.template,
      };
    },
  });
  const app = createApp(orgContext, {
    runBuildInBackground: async (input: Record<string, unknown>) => {
      buildRuns.push(input);
    },
  });

  const response = await app.request(`http://localhost/projects/${project.id}/byo-db`, {
    method: "POST",
    body: JSON.stringify({
      supabaseUrl: "https://demo-project.supabase.co",
      supabaseAnonKey: "anon-key",
    }),
    headers: { "content-type": "application/json" },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    success: true,
    host: "demo-project.supabase.co",
    wiring: true,
  });
  assert.equal(createdGenerations.length, 1);
  assert.equal(buildRuns.length, 1);
  assert.deepEqual(updates, [
    {
      byo_db_url: "https://demo-project.supabase.co",
      byo_db_anon_key: "anon-key",
    },
  ]);
  assert.equal(createdGenerations[0]?.operation_id, "projectIteration");
  assert.equal(createdGenerations[0]?.status, "queued");
  assert.equal(buildRuns[0]?.isIteration, true);
  assert.equal(buildRuns[0]?.model, "claude-sonnet-4-6");
  assert.equal(buildRuns[0]?.projectId, project.id);
  assert.deepEqual(buildRuns[0]?.existingFiles, existingFiles);
  assert.match(String(buildRuns[0]?.prompt ?? ""), /Rewire the entire app to use Supabase instead of hardcoded data\./);
  assert.match(String(buildRuns[0]?.prompt ?? ""), /import \{ createClient \} from "@supabase\/supabase-js"/);
  assert.match(String(buildRuns[0]?.prompt ?? ""), /do NOT use "\.\/supabase-js", "supabase-js", or any relative path\./);
});

test("byo-db delete clears saved Supabase credentials", async () => {
  const project = createProject({
    byo_db_url: "https://demo-project.supabase.co",
    byo_db_anon_key: "anon-key",
  });
  const updates: Record<string, unknown>[] = [];
  const orgContext = createOrgContext(project, {
    updateProject: async (_projectId: string, patch: Record<string, unknown>) => {
      updates.push(patch);
      return { ...project, ...patch };
    },
  });
  const app = createApp(orgContext);

  const response = await app.request(`http://localhost/projects/${project.id}/byo-db`, {
    method: "DELETE",
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.deepEqual(updates, [
    {
      byo_db_url: null,
      byo_db_anon_key: null,
    },
  ]);
});

test("upgrade-to-byo migrates data, deletes Neon, and queues a Supabase rewire", async () => {
  const project = createProject({
    db_provider: "neon",
    db_schema: null,
  });
  const existingFiles: StudioFile[] = [
    {
      path: "App.tsx",
      kind: "route",
      language: "tsx",
      content: "export default function App() { return <div>Hello</div>; }\n",
      source: "ai",
      locked: false,
    },
  ];
  const updates: Record<string, unknown>[] = [];
  const connectionUpdates: Record<string, unknown>[] = [];
  const dumpCalls: string[] = [];
  const restoreCalls: Array<Record<string, unknown>> = [];
  const deleteCalls: string[] = [];
  const createdGenerations: Record<string, unknown>[] = [];
  const buildRuns: Array<Record<string, unknown>> = [];
  const dumpTables = [
    {
      name: "tasks",
      columns: [
        {
          name: "id",
          sqlType: "uuid",
          isNullable: false,
          defaultExpression: "gen_random_uuid()",
        },
      ],
      primaryKeyColumns: ["id"],
      sequenceColumns: [],
      rows: [{ id: "task-1" }],
    },
  ];
  const orgContext = createOrgContext(project, {
    updateProject: async (_projectId: string, patch: Record<string, unknown>) => {
      updates.push(patch);
      return { ...project, ...patch };
    },
    updateProjectDbConnection: async (_projectId: string, patch: Record<string, unknown>) => {
      connectionUpdates.push(patch);
    },
    getProjectDbLimits: async () => ({
      id: "limits-1",
      project_id: project.id,
      plan_storage_mb: 200,
      plan_rows: 0,
      tables_limit: 0,
      extra_storage_mb: 0,
      extra_rows: 0,
      neon_project_id: "neon-proj-123",
      neon_branch_id: "branch-1",
      db_url: "postgresql://user:pass@host/db",
      neon_auth_base_url: "https://auth.neon.tech/project",
      neon_auth_pub_key: "pub-key",
      neon_auth_secret_key: "secret-key",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
    findLatestGenerationByProjectId: async () => ({
      id: "generation-prev",
      files: existingFiles,
    }),
    createGeneration: async (input: Record<string, unknown>) => {
      createdGenerations.push(input);
      return {
        ...input,
        project_id: project.id,
        template_id: project.template,
      };
    },
  });
  const app = createApp(orgContext, {
    ensureByoDbAnonKeyColumn: async () => undefined,
    dumpNeonDatabase: async (connectionString: string) => {
      dumpCalls.push(connectionString);
      return dumpTables;
    },
    restoreSupabaseDatabase: async (input: Record<string, unknown>) => {
      restoreCalls.push(input);
    },
    deleteNeonProject: async (neonProjectId: string) => {
      deleteCalls.push(neonProjectId);
    },
    runBuildInBackground: async (input: Record<string, unknown>) => {
      buildRuns.push(input);
    },
  });

  const response = await app.request(`http://localhost/projects/${project.id}/upgrade-to-byo`, {
    method: "POST",
    body: JSON.stringify({
      byo_db_url: "https://demo-project.supabase.co",
      byo_db_anon_key: "anon-key",
    }),
    headers: { "content-type": "application/json" },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { migrating: true });
  assert.deepEqual(dumpCalls, ["postgresql://user:pass@host/db"]);
  assert.deepEqual(restoreCalls, [
    {
      supabaseUrl: "https://demo-project.supabase.co",
      supabaseAnonKey: "anon-key",
      tables: dumpTables,
    },
  ]);
  assert.deepEqual(deleteCalls, ["neon-proj-123"]);
  assert.deepEqual(updates, [
    {
      byo_db_url: "https://demo-project.supabase.co",
      byo_db_anon_key: "anon-key",
      database_enabled: true,
      db_provider: "supabase",
      db_config: {
        url: "https://demo-project.supabase.co",
        anonKey: "anon-key",
      },
      db_schema: null,
      db_nonce: null,
      db_wired: false,
    },
  ]);
  assert.deepEqual(connectionUpdates, [
    {
      neon_project_id: null,
      neon_branch_id: null,
      db_url: null,
      neon_auth_base_url: null,
      neon_auth_pub_key: null,
      neon_auth_secret_key: null,
    },
  ]);
  assert.equal(createdGenerations.length, 1);
  assert.equal(buildRuns.length, 1);
  assert.equal(createdGenerations[0]?.operation_id, "projectIteration");
  assert.equal(createdGenerations[0]?.status, "queued");
  assert.equal(buildRuns[0]?.isIteration, true);
  assert.equal(buildRuns[0]?.model, "claude-sonnet-4-6");
  assert.equal(buildRuns[0]?.projectId, project.id);
  assert.deepEqual(buildRuns[0]?.existingFiles, existingFiles);
  assert.match(String(buildRuns[0]?.prompt ?? ""), /use Supabase instead of Neon\./);
  assert.match(String(buildRuns[0]?.prompt ?? ""), /import \{ createClient \} from "@supabase\/supabase-js"/);
  assert.match(String(buildRuns[0]?.prompt ?? ""), /do NOT use "\.\/supabase-js", "supabase-js", or any relative path\./);
});

test("upgrade-to-byo continues when Neon deletion fails after a successful migration", async () => {
  const project = createProject({
    db_provider: "neon",
    db_schema: null,
  });
  const updates: Record<string, unknown>[] = [];
  const buildRuns: Array<Record<string, unknown>> = [];
  const orgContext = createOrgContext(project, {
    updateProject: async (_projectId: string, patch: Record<string, unknown>) => {
      updates.push(patch);
      return { ...project, ...patch };
    },
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
    findLatestGenerationByProjectId: async () => ({
      id: "generation-prev",
      files: [],
    }),
  });
  const app = createApp(orgContext, {
    ensureByoDbAnonKeyColumn: async () => undefined,
    dumpNeonDatabase: async () => [],
    restoreSupabaseDatabase: async () => undefined,
    deleteNeonProject: async () => {
      throw new Error("boom");
    },
    runBuildInBackground: async (input: Record<string, unknown>) => {
      buildRuns.push(input);
    },
  });

  const response = await app.request(`http://localhost/projects/${project.id}/upgrade-to-byo`, {
    method: "POST",
    body: JSON.stringify({
      byo_db_url: "https://demo-project.supabase.co",
      byo_db_anon_key: "anon-key",
    }),
    headers: { "content-type": "application/json" },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { migrating: true });
  assert.equal(updates.length, 1);
  assert.equal(buildRuns.length, 1);
  assert.equal(buildRuns[0]?.isIteration, true);
});

test("upgrade-to-byo requires BYO Supabase credentials", async () => {
  const project = createProject({
    db_provider: "neon",
    db_schema: null,
  });
  const orgContext = createOrgContext(project);
  const app = createApp(orgContext);

  const response = await app.request(`http://localhost/projects/${project.id}/upgrade-to-byo`, {
    method: "POST",
    body: JSON.stringify({}),
    headers: { "content-type": "application/json" },
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "byo_db_url is required",
  });
});
