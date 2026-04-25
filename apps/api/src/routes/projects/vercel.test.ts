import assert from "node:assert/strict";
import test from "node:test";

import { Hono } from "hono";
import type { ProjectRow } from "@beomz-studio/studio-db";
import type { OrgContext } from "../../types.js";

process.env.ANTHROPIC_API_KEY ??= "test-anthropic-key";
process.env.STUDIO_SUPABASE_URL ??= "https://example.supabase.co";
process.env.STUDIO_SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const {
  createVercelDeployRoute,
  injectNeonEnvVars,
  resolveDeploySupabaseCredentials,
  replaceDeployEnvFile,
} = await import("./vercel.js");

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
    published: true,
    published_slug: "taskly",
    published_at: now,
    beomz_app_url: "https://taskly.beomz.app",
    beomz_app_deployed_at: now,
    custom_domains: [],
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
      updateProject: async (_projectId: string, patch: Record<string, unknown>) => ({ ...project, ...patch }),
      findLatestGenerationByProjectId: async () => null,
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
      plan: "pro_starter",
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

function createDeployApp(
  orgContext: OrgContext,
  deps: Parameters<typeof createVercelDeployRoute>[0] = {},
): Hono {
  const route = createVercelDeployRoute({
    authMiddleware: async (_c, next) => { await next(); },
    loadOrgContextMiddleware: async (c, next) => {
      c.set("orgContext", orgContext);
      await next();
    },
    ...deps,
  });

  const app = new Hono();
  app.route("/projects/:id/deploy/vercel", route);
  return app;
}

test("injectNeonEnvVars inlines VITE_DATABASE_URL for published Neon apps", () => {
  const input = [
    "import { neon } from '@neondatabase/serverless';",
    "const sql = neon(import.meta.env.VITE_DATABASE_URL);",
  ].join("\n");

  const output = injectNeonEnvVars(input, "postgresql://user:pass@host/db");

  assert.equal(output.includes("import.meta.env.VITE_DATABASE_URL"), false);
  assert.match(output, /neon\("postgresql:\/\/user:pass@host\/db"\)/);
});

test("injectNeonEnvVars replaces repeated VITE_DATABASE_URL references", () => {
  const input = [
    "const primary = import.meta.env.VITE_DATABASE_URL;",
    "const backup = import.meta.env.VITE_DATABASE_URL;",
  ].join("\n");

  const output = injectNeonEnvVars(input, "postgresql://user:pass@host/db");

  assert.equal(output.includes("import.meta.env.VITE_DATABASE_URL"), false);
  assert.match(output, /const primary = "postgresql:\/\/user:pass@host\/db";/);
  assert.match(output, /const backup = "postgresql:\/\/user:pass@host\/db";/);
});

test("resolveDeploySupabaseCredentials prefers BYO Supabase credentials before placeholder injection", () => {
  const config = resolveDeploySupabaseCredentials(
    {
      db_wired: false,
      byo_db_url: "https://demo-project.supabase.co",
      byo_db_anon_key: "anon-key",
    },
    {
      managedUrl: "https://managed.supabase.co",
      managedAnonKey: "managed-anon-key",
    },
  );

  assert.deepEqual(config, {
    supabaseUrl: "https://demo-project.supabase.co",
    supabaseAnonKey: "anon-key",
    dbSchema: "public",
    source: "byo",
  });
});

test("resolveDeploySupabaseCredentials falls back to placeholders when no BYO or managed config exists", () => {
  const config = resolveDeploySupabaseCredentials(
    {
      db_wired: false,
      byo_db_url: null,
      byo_db_anon_key: null,
    },
    {
      managedUrl: null,
      managedAnonKey: null,
    },
  );

  assert.deepEqual(config, {
    supabaseUrl: "https://placeholder.supabase.co",
    supabaseAnonKey: "placeholder",
    dbSchema: "public",
    source: "placeholder",
  });
});

test("replaceDeployEnvFile overwrites src/.env.local with BYO Supabase credentials", () => {
  const next = replaceDeployEnvFile(
    [
      {
        filename: "src/App.tsx",
        content: "export default function App() { return null; }\n",
      },
      {
        filename: "src/.env.local",
        content: [
          "VITE_SUPABASE_URL=https://placeholder.supabase.co",
          "VITE_SUPABASE_ANON_KEY=placeholder",
          "VITE_DATABASE_URL=postgresql://user:pass@host/db",
        ].join("\n"),
      },
    ],
    {
      byo_db_url: "https://demo-project.supabase.co",
      byo_db_anon_key: "anon-key",
    },
    {
      provider: "neon",
      neonDbUrl: "postgresql://user:pass@managed.neon.tech/neondb",
    },
  );

  const envFiles = next.filter((file) => file.filename === "src/.env.local");
  assert.equal(envFiles.length, 1);
  assert.equal(
    envFiles[0]?.content,
    [
      "VITE_SUPABASE_URL=https://demo-project.supabase.co",
      "VITE_SUPABASE_ANON_KEY=anon-key",
      "VITE_BYO_DB=true",
      "",
    ].join("\n"),
  );
});

test("replaceDeployEnvFile adds src/.env.local for managed Neon deploys", () => {
  const next = replaceDeployEnvFile(
    [
      {
        filename: "src/App.tsx",
        content: "export default function App() { return null; }\n",
      },
    ],
    {},
    {
      provider: "neon",
      neonDbUrl: "postgresql://user:pass@managed.neon.tech/neondb",
    },
  );

  const envFiles = next.filter((file) => file.filename === "src/.env.local");
  assert.equal(envFiles.length, 1);
  assert.equal(
    envFiles[0]?.content,
    "VITE_DATABASE_URL=postgresql://user:pass@managed.neon.tech/neondb\n",
  );
});

test("DELETE /projects/:id/deploy/vercel removes Vercel domains and deployment before clearing publish fields", async () => {
  const project = createProject({
    custom_domains: ["myapp.com"],
    vercel_deployment_id: "dpl_123",
  });
  const removedDomains: string[][] = [];
  const deletedDeployments: string[] = [];
  const updates: Array<Record<string, unknown>> = [];
  const orgContext = createOrgContext(project, {
    updateProject: async (_projectId: string, patch: Record<string, unknown>) => {
      updates.push(patch);
      return { ...project, ...patch };
    },
  });
  const app = createDeployApp(orgContext, {
    removeAllProjectDomains: async (domains: readonly string[]) => {
      removedDomains.push([...domains]);
    },
    deleteVercelDeployment: async (deploymentId: string) => {
      deletedDeployments.push(deploymentId);
    },
  });

  const response = await app.request("http://localhost/projects/project-1/deploy/vercel", {
    method: "DELETE",
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.deepEqual(removedDomains, [["taskly.beomz.app", "myapp.com"]]);
  assert.deepEqual(deletedDeployments, ["dpl_123"]);
  assert.deepEqual(updates, [
    {
      beomz_app_url: null,
      beomz_app_deployed_at: null,
    },
  ]);
});

test("DELETE /projects/:id/deploy/vercel still clears publish fields when cleanup fails", async () => {
  const project = createProject({
    custom_domains: ["myapp.com"],
    vercel_deployment_id: "dpl_123",
  });
  const updates: Array<Record<string, unknown>> = [];
  const orgContext = createOrgContext(project, {
    updateProject: async (_projectId: string, patch: Record<string, unknown>) => {
      updates.push(patch);
      return { ...project, ...patch };
    },
  });
  const app = createDeployApp(orgContext, {
    removeAllProjectDomains: async () => {
      throw new Error("domain cleanup failed");
    },
    deleteVercelDeployment: async () => {
      throw new Error("deployment cleanup failed");
    },
  });

  const response = await app.request("http://localhost/projects/project-1/deploy/vercel", {
    method: "DELETE",
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.deepEqual(updates, [
    {
      beomz_app_url: null,
      beomz_app_deployed_at: null,
    },
  ]);
});
