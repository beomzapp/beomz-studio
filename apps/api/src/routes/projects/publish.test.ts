import assert from "node:assert/strict";
import test from "node:test";

import { Hono } from "hono";
import type { StudioFile } from "@beomz-studio/contracts";
import type { ProjectRow } from "@beomz-studio/studio-db";
import type { OrgContext } from "../../types.js";

process.env.ANTHROPIC_API_KEY ??= "test-anthropic-key";
process.env.STUDIO_SUPABASE_URL ??= "https://example.supabase.co";
process.env.STUDIO_SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const {
  buildPublishedDbCredentials,
  createExportRoute,
  injectPublishedByoEnvFiles,
} = await import("./publish.js");

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
    custom_domains: [],
    build_phases: null,
    current_phase: 0,
    phases_total: 0,
    phase_mode: false,
    ...overrides,
  };
}

function createOrgContext(
  project: ProjectRow,
  plan = "pro_starter",
  latestGen: { files: readonly StudioFile[] } | null = null,
): OrgContext {
  const now = new Date().toISOString();

  return {
    db: {
      findProjectById: async (id: string) => (id === project.id ? project : null),
      findLatestGenerationByProjectId: async (id: string) => (id === project.id ? latestGen : null),
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

function createExportApp(orgContext: OrgContext): Hono {
  const route = createExportRoute({
    authMiddleware: async (_c, next) => { await next(); },
    loadOrgContextMiddleware: async (c, next) => {
      c.set("orgContext", orgContext);
      await next();
    },
  });

  const app = new Hono();
  app.route("/projects/:id/export", route);
  return app;
}

test("buildPublishedDbCredentials returns BYO Supabase creds for published BYO projects", () => {
  const dbCredentials = buildPublishedDbCredentials({
    byo_db_url: "https://demo-project.supabase.co",
    byo_db_anon_key: "anon-key",
    db_wired: true,
    db_schema: "app_test_schema",
  });

  assert.deepEqual(dbCredentials, {
    supabaseUrl: "https://demo-project.supabase.co",
    supabaseAnonKey: "anon-key",
    schemaName: "public",
    VITE_SUPABASE_URL: "https://demo-project.supabase.co",
    VITE_SUPABASE_ANON_KEY: "anon-key",
    VITE_BYO_DB: "true",
  });
  assert.equal("byo_db_service_key" in (dbCredentials ?? {}), false);
});

test("buildPublishedDbCredentials keeps managed publish credentials unchanged", () => {
  process.env.USER_DATA_SUPABASE_URL = "https://managed.supabase.co";
  process.env.USER_DATA_SUPABASE_ANON_KEY = "managed-anon-key";

  const dbCredentials = buildPublishedDbCredentials({
    db_wired: true,
    db_schema: "app_test_schema",
  });

  assert.deepEqual(dbCredentials, {
    supabaseUrl: "https://managed.supabase.co",
    supabaseAnonKey: "managed-anon-key",
    schemaName: "app_test_schema",
  });
});

test("injectPublishedByoEnvFiles writes BYO Supabase env vars into exported .env.local", () => {
  const files: readonly StudioFile[] = [
    {
      path: "src/App.tsx",
      kind: "route",
      language: "tsx",
      content: "export default function App() { return <div>Hello</div>; }\n",
      source: "ai",
      locked: false,
    },
    {
      path: ".env.local",
      kind: "config",
      language: "dotenv",
      content: [
        "KEEP_ME=yes",
        "VITE_DATABASE_URL=postgresql://user:pass@host/db",
        "NEON_AUTH_SECRET=secret-key",
      ].join("\n"),
      source: "ai",
      locked: false,
    },
  ];

  const next = injectPublishedByoEnvFiles(files, {
    byo_db_url: "https://demo-project.supabase.co",
    byo_db_anon_key: "anon-key",
  });

  const envFile = next.find((file) => file.path === ".env.local");
  assert.ok(envFile);
  assert.match(envFile.content, /KEEP_ME=yes/);
  assert.match(envFile.content, /VITE_SUPABASE_URL=https:\/\/demo-project\.supabase\.co/);
  assert.match(envFile.content, /VITE_SUPABASE_ANON_KEY=anon-key/);
  assert.match(envFile.content, /VITE_BYO_DB=true/);
  assert.doesNotMatch(envFile.content, /VITE_DATABASE_URL=/);
  assert.doesNotMatch(envFile.content, /NEON_AUTH_SECRET=/);
});

test("injectPublishedByoEnvFiles leaves non-BYO export files unchanged", () => {
  const files: readonly StudioFile[] = [
    {
      path: "src/App.tsx",
      kind: "route",
      language: "tsx",
      content: "export default function App() { return <div>Hello</div>; }\n",
      source: "ai",
      locked: false,
    },
  ];

  const next = injectPublishedByoEnvFiles(files, {
    db_wired: true,
    db_schema: "app_test_schema",
  });

  assert.deepEqual(next, files);
});

test("GET /api/projects/:id/export blocks free and starter plans", async () => {
  const project = createProject();

  for (const plan of ["free", "pro_starter"]) {
    const app = createExportApp(createOrgContext(project, plan));
    const response = await app.request("http://localhost/projects/project-1/export");

    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), {
      error: "upgrade_required",
      requiredPlan: "pro_builder",
    });
  }
});

test("GET /api/projects/:id/export allows pro_builder and business plans through the gate", async () => {
  const project = createProject();

  for (const plan of ["pro_builder", "business"]) {
    const app = createExportApp(createOrgContext(project, plan));
    const response = await app.request("http://localhost/projects/project-1/export");

    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), {
      error: "No generated files found",
    });
  }
});
