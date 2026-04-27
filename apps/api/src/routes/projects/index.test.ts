import assert from "node:assert/strict";
import test from "node:test";

import { Hono } from "hono";

import type { OrgContext } from "../../types.js";
import type { ProjectRow } from "@beomz-studio/studio-db";
import type { StudioFile } from "@beomz-studio/contracts";

process.env.STUDIO_SUPABASE_URL ??= "https://example.supabase.co";
process.env.STUDIO_SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
process.env.ANTHROPIC_API_KEY ??= "test-anthropic-key";
process.env.PROJECT_JWT_SECRET ??= "test-project-secret";

const { createProjectsRoute } = await import("./index.js");
const { encryptProjectSecret } = await import("../../lib/projectSecrets.js");

const expectedSupabaseSetupSql = [
  'CREATE TABLE IF NOT EXISTS public."tasks" (',
  '  "id" UUID DEFAULT gen_random_uuid() PRIMARY KEY,',
  '  "created_at" TIMESTAMPTZ DEFAULT now(),',
  '  "title" TEXT',
  ");",
  "",
  'ALTER TABLE public."tasks" ENABLE ROW LEVEL SECURITY;',
  "",
  'CREATE POLICY "Allow all for anon" ON public."tasks"',
  "  FOR ALL",
  "  TO anon",
  "  USING (true)",
  "  WITH CHECK (true);",
].join("\n");

function createProject(overrides: Partial<ProjectRow> = {}): ProjectRow {
  const now = new Date().toISOString();
  return {
    id: "project-1",
    org_id: "org-1",
    name: "Test Project",
    template: "blank",
    project_type: "app",
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
  const generationStore = new Map<string, Record<string, unknown>>();

  return {
    db: {
      createProject: async (input: Record<string, unknown>) => ({
        ...project,
        ...input,
        project_type: typeof input.project_type === "string" ? input.project_type : (project.project_type ?? "app"),
      }) as ProjectRow,
      findProjectById: async (id: string) => (id === project.id ? project : null),
      findLatestGenerationByProjectId: async () => null,
      createGeneration: async (input: Record<string, unknown>) => {
        generationStore.set(String(input.id), input);
        return input;
      },
      findGenerationById: async (id: string) => generationStore.get(id) ?? null,
      updateGeneration: async (id: string, patch: Record<string, unknown>) => {
        const current = generationStore.get(id) ?? {};
        const next = { ...current, ...patch };
        generationStore.set(id, next);
        return next;
      },
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

test("GET /projects includes project_type for each project", async () => {
  const websiteProject = createProject({
    id: "website-1",
    name: "Marketing Site",
    project_type: "website",
    template: "marketing-website",
  });
  const orgContext = createOrgContext(websiteProject, {
    findProjectsByOrgId: async () => [websiteProject],
    countGenerationsByProjectIds: async () => ({ [websiteProject.id]: 3 }),
  });
  const app = createApp(orgContext);

  const response = await app.request("http://localhost/projects", {
    method: "GET",
  });

  assert.equal(response.status, 200);
  const body = await response.json() as {
    projects: Array<{ id: string; project_type: string; generationCount: number }>;
  };
  assert.equal(body.projects.length, 1);
  assert.equal(body.projects[0]?.id, "website-1");
  assert.equal(body.projects[0]?.project_type, "website");
  assert.equal(body.projects[0]?.generationCount, 3);
});

test("POST /projects defaults project_type to app", async () => {
  const baseProject = createProject();
  let createdInput: Record<string, unknown> | null = null;
  const orgContext = createOrgContext(baseProject, {
    createProject: async (input: Record<string, unknown>) => {
      createdInput = input;
      return createProject({
        id: String(input.id),
        name: String(input.name),
        org_id: String(input.org_id),
        project_type: input.project_type === "website" ? "website" : "app",
        status: "draft",
        template: input.template as ProjectRow["template"],
      });
    },
  });
  const app = createApp(orgContext);

  const response = await app.request("http://localhost/projects", {
    method: "POST",
    body: JSON.stringify({ name: "New App" }),
    headers: { "content-type": "application/json" },
  });

  assert.equal(response.status, 200);
  assert.equal(createdInput?.project_type, "app");
  assert.deepEqual(await response.json(), {
    id: String(createdInput?.id),
    name: "New App",
    project_type: "app",
  });
});

test("POST /projects accepts project_type=website", async () => {
  const baseProject = createProject();
  let createdInput: Record<string, unknown> | null = null;
  const orgContext = createOrgContext(baseProject, {
    createProject: async (input: Record<string, unknown>) => {
      createdInput = input;
      return createProject({
        id: String(input.id),
        name: String(input.name),
        org_id: String(input.org_id),
        project_type: "website",
        status: "draft",
        template: input.template as ProjectRow["template"],
      });
    },
  });
  const app = createApp(orgContext);

  const response = await app.request("http://localhost/projects", {
    method: "POST",
    body: JSON.stringify({
      name: "Marketing Site",
      template: "marketing-website",
      project_type: "website",
    }),
    headers: { "content-type": "application/json" },
  });

  assert.equal(response.status, 200);
  assert.equal(createdInput?.project_type, "website");
  assert.deepEqual(await response.json(), {
    id: String(createdInput?.id),
    name: "Marketing Site",
    project_type: "website",
  });
});

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

test("project deletion cleans up Vercel deployment and custom domains after DB delete", async () => {
  const project = createProject({
    custom_domains: ["myapp.com", "docs.myapp.com"],
    vercel_deployment_id: "dpl_123",
  });
  const callOrder: string[] = [];
  const deletedDomains: string[][] = [];
  const deletedDeployments: string[] = [];
  const orgContext = createOrgContext(project, {
    deleteProject: async () => {
      callOrder.push("deleteProject");
    },
  });

  const app = createApp(orgContext, {
    isUserDataConfigured: () => false,
    deleteVercelDeployment: async (deploymentId: string) => {
      callOrder.push(`deleteVercelDeployment:${deploymentId}`);
      deletedDeployments.push(deploymentId);
    },
    removeAllProjectDomains: async (domains: readonly string[]) => {
      callOrder.push(`removeAllProjectDomains:${domains.join(",")}`);
      deletedDomains.push([...domains]);
    },
  });

  const response = await app.request(`http://localhost/projects/${project.id}`, {
    method: "DELETE",
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.deepEqual(callOrder, [
    "deleteProject",
    "deleteVercelDeployment:dpl_123",
    "removeAllProjectDomains:myapp.com,docs.myapp.com",
  ]);
  assert.deepEqual(deletedDeployments, ["dpl_123"]);
  assert.deepEqual(deletedDomains, [["myapp.com", "docs.myapp.com"]]);
});

test("project deletion still succeeds when Vercel cleanup throws unexpectedly", async () => {
  const project = createProject({
    custom_domains: ["myapp.com"],
    vercel_deployment_id: "dpl_123",
  });
  let deleteProjectCalled = false;
  let removeAllProjectDomainsCalled = false;
  const orgContext = createOrgContext(project, {
    deleteProject: async () => {
      deleteProjectCalled = true;
    },
  });

  const app = createApp(orgContext, {
    isUserDataConfigured: () => false,
    deleteVercelDeployment: async () => {
      throw new Error("unexpected deploy cleanup failure");
    },
    removeAllProjectDomains: async () => {
      removeAllProjectDomainsCalled = true;
    },
  });

  const response = await app.request(`http://localhost/projects/${project.id}`, {
    method: "DELETE",
  });

  assert.equal(deleteProjectCalled, true);
  assert.equal(removeAllProjectDomainsCalled, true);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
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

test("byo-db runs migration, saves Supabase credentials, and always queues auto-wire for fresh projects", async () => {
  const project = createProject();
  const updates: Record<string, unknown>[] = [];
  const createdGenerations: Record<string, unknown>[] = [];
  const buildRuns: Array<Record<string, unknown>> = [];
  const generatedFiles: StudioFile[] = [
    {
      path: "App.tsx",
      kind: "route",
      language: "tsx",
      content: [
        'import { createClient } from "@supabase/supabase-js";',
        "const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);",
        "const { data } = await supabase.from('tasks').select('id, title, created_at').order('created_at', { ascending: false });",
      ].join("\n"),
      source: "ai",
      locked: false,
    },
  ];
  let migrationRuns = 0;
  let orgContext!: OrgContext;
  orgContext = createOrgContext(project, {
    updateProject: async (_projectId: string, patch: Record<string, unknown>) => {
      updates.push(patch);
      return { ...project, ...patch };
    },
    createGeneration: async (input: Record<string, unknown>) => {
      createdGenerations.push(input);
      const row = {
        ...input,
        project_id: project.id,
        template_id: project.template,
      };
      await orgContext.db.updateGeneration(String(input.id), row);
      return row;
    },
  });
  const app = createApp(orgContext, {
    ensureByoDbAnonKeyColumn: async () => {
      migrationRuns += 1;
    },
    runBuildInBackground: async (input: Record<string, unknown>) => {
      buildRuns.push(input);
      await orgContext.db.updateGeneration(String(input.buildId), {
        completed_at: new Date().toISOString(),
        files: generatedFiles,
        metadata: {},
        status: "completed",
        summary: "Rewired to Supabase.",
      });
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
    setupSql: expectedSupabaseSetupSql,
  });
  assert.equal(migrationRuns, 1);
  assert.equal(createdGenerations.length, 1);
  assert.equal(buildRuns.length, 1);
  assert.deepEqual(buildRuns[0]?.existingFiles, []);
  assert.equal(buildRuns[0]?.isIteration, true);
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
  const generatedFiles: StudioFile[] = [
    {
      path: "App.tsx",
      kind: "route",
      language: "tsx",
      content: [
        'import { createClient } from "@supabase/supabase-js";',
        "const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);",
        "const { data } = await supabase.from('tasks').select('id, title').order('created_at', { ascending: false });",
      ].join("\n"),
      source: "ai",
      locked: false,
    },
  ];
  let orgContext!: OrgContext;
  orgContext = createOrgContext(project, {
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
      const row = {
        ...input,
        project_id: project.id,
        template_id: project.template,
      };
      await orgContext.db.updateGeneration(String(input.id), row);
      return row;
    },
  });
  const app = createApp(orgContext, {
    runBuildInBackground: async (input: Record<string, unknown>) => {
      buildRuns.push(input);
      await orgContext.db.updateGeneration(String(input.buildId), {
        completed_at: new Date().toISOString(),
        files: generatedFiles,
        metadata: {},
        status: "completed",
        summary: "Rewired to Supabase.",
      });
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
    setupSql: expectedSupabaseSetupSql,
  });
  assert.equal(createdGenerations.length, 1);
  assert.equal(buildRuns.length, 1);
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
  assert.equal(createdGenerations[0]?.operation_id, "projectIteration");
  assert.equal(createdGenerations[0]?.status, "queued");
  assert.equal(buildRuns[0]?.isIteration, true);
  assert.equal(buildRuns[0]?.model, "claude-sonnet-4-6");
  assert.equal(buildRuns[0]?.projectId, project.id);
  assert.deepEqual(buildRuns[0]?.existingFiles, existingFiles);
  assert.match(String(buildRuns[0]?.prompt ?? ""), /Rewire the entire app to use Supabase instead of hardcoded data\./);
  assert.match(String(buildRuns[0]?.prompt ?? ""), /import \{ createClient \} from "@supabase\/supabase-js"/);
  assert.match(String(buildRuns[0]?.prompt ?? ""), /do NOT use "\.\/supabase-js", "supabase-js", or any relative path\./);
  assert.match(String(buildRuns[0]?.prompt ?? ""), /NEVER use fetch\(\) to call Supabase under ANY circumstances\./);
  assert.match(String(buildRuns[0]?.prompt ?? ""), /NEVER use raw fetch\(\) to call Supabase REST endpoints directly\./);
  assert.match(String(buildRuns[0]?.prompt ?? ""), /NEVER construct URLs like supabaseUrl \+ '\/rest\/v1\/\.\.\.'\./);
  assert.match(String(buildRuns[0]?.prompt ?? ""), /NEVER construct URLs like `\$\{supabaseUrl\}\/rest\/v1\/\.\.\.`\./);
  assert.match(String(buildRuns[0]?.prompt ?? ""), /ALWAYS use ONLY the supabase client:/);
  assert.match(String(buildRuns[0]?.prompt ?? ""), /supabase\.from\('todos'\)\.select\('\*'\)\.order\('created_at', \{ ascending: false \}\)/);
  assert.match(String(buildRuns[0]?.prompt ?? ""), /supabase\.from\('todos'\)\.insert\(\{ title, completed: false \}\)/);
  assert.match(String(buildRuns[0]?.prompt ?? ""), /supabase\.from\('todos'\)\.update\(\{ completed \}\)\.eq\('id', id\)/);
  assert.match(String(buildRuns[0]?.prompt ?? ""), /supabase\.from\('todos'\)\.delete\(\)\.eq\('id', id\)/);
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
      byo_db_service_key: null,
      supabase_oauth_access_token: null,
      supabase_oauth_refresh_token: null,
    },
  ]);
});

test("byo-db returns setupSql instead of auto-creating tables when only a stored service role key exists", async () => {
  const project = createProject({
    byo_db_service_key: encryptProjectSecret("service-role-key"),
  });
  const generatedFiles: StudioFile[] = [
    {
      path: "App.tsx",
      kind: "route",
      language: "tsx",
      content: [
        'import { createClient } from "@supabase/supabase-js";',
        "const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);",
        "const { data } = await supabase.from('tasks').select('id, title, created_at').order('created_at', { ascending: false });",
      ].join("\n"),
      source: "ai",
      locked: false,
    },
  ];
  const updates: Record<string, unknown>[] = [];
  let orgContext!: OrgContext;
  orgContext = createOrgContext(project, {
    updateProject: async (_projectId: string, patch: Record<string, unknown>) => {
      updates.push(patch);
      return { ...project, ...patch };
    },
    createGeneration: async (input: Record<string, unknown>) => {
      const row = {
        ...input,
        project_id: project.id,
        template_id: project.template,
      };
      await orgContext.db.updateGeneration(String(input.id), row);
      return row;
    },
  });

  const originalFetch = globalThis.fetch;
  const fetchCalls: Array<{ url: string; body: string | null }> = [];
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    fetchCalls.push({
      url: String(input),
      body: typeof init?.body === "string" ? init.body : null,
    });
    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const app = createApp(orgContext, {
      ensureByoDbAnonKeyColumn: async () => undefined,
      runBuildInBackground: async (input: Record<string, unknown>) => {
        await orgContext.db.updateGeneration(String(input.buildId), {
          completed_at: new Date().toISOString(),
          files: generatedFiles,
          metadata: {},
          status: "completed",
          summary: "Rewired to Supabase.",
        });
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
      setupSql: expectedSupabaseSetupSql,
    });
    assert.equal(fetchCalls.length, 0);
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
  } finally {
    globalThis.fetch = originalFetch;
  }
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
  assert.match(String(buildRuns[0]?.prompt ?? ""), /NEVER use fetch\(\) to call Supabase under ANY circumstances\./);
  assert.match(String(buildRuns[0]?.prompt ?? ""), /NEVER use raw fetch\(\) to call Supabase REST endpoints directly\./);
  assert.match(String(buildRuns[0]?.prompt ?? ""), /NEVER construct URLs like supabaseUrl \+ '\/rest\/v1\/\.\.\.'\./);
  assert.match(String(buildRuns[0]?.prompt ?? ""), /NEVER construct URLs like `\$\{supabaseUrl\}\/rest\/v1\/\.\.\.`\./);
  assert.match(String(buildRuns[0]?.prompt ?? ""), /ALWAYS use ONLY the supabase client:/);
  assert.match(String(buildRuns[0]?.prompt ?? ""), /supabase\.from\('todos'\)\.select\('\*'\)\.order\('created_at', \{ ascending: false \}\)/);
  assert.match(String(buildRuns[0]?.prompt ?? ""), /supabase\.from\('todos'\)\.insert\(\{ title, completed: false \}\)/);
  assert.match(String(buildRuns[0]?.prompt ?? ""), /supabase\.from\('todos'\)\.update\(\{ completed \}\)\.eq\('id', id\)/);
  assert.match(String(buildRuns[0]?.prompt ?? ""), /supabase\.from\('todos'\)\.delete\(\)\.eq\('id', id\)/);
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
