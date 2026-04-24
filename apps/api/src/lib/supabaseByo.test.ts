import assert from "node:assert/strict";
import test from "node:test";

import type { ProjectRow } from "@beomz-studio/studio-db";

process.env.ANTHROPIC_API_KEY ??= "test-anthropic-key";
process.env.PROJECT_JWT_SECRET ??= "test-project-secret";
process.env.STUDIO_SUPABASE_URL ??= "https://example.supabase.co";
process.env.STUDIO_SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
process.env.SUPABASE_OAUTH_CLIENT_ID ??= "supabase-oauth-client-id";
process.env.SUPABASE_OAUTH_CLIENT_SECRET ??= "supabase-oauth-client-secret";

const { connectProjectToSupabase } = await import("./supabaseByo.js");
const { decryptProjectSecret } = await import("./projectSecrets.js");

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

function createTestOrgContext(project: ProjectRow) {
  const updates: Record<string, unknown>[] = [];
  const generations = new Map<string, Record<string, unknown>>();
  const now = new Date().toISOString();

  const orgContext = {
    db: {
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
        generations.set(String(input.id), row);
        return row;
      },
      updateGeneration: async (generationId: string, patch: Record<string, unknown>) => {
        const current = generations.get(generationId) ?? {};
        const row = { ...current, ...patch };
        generations.set(generationId, row);
        return row;
      },
      findGenerationById: async (generationId: string) => generations.get(generationId) ?? null,
      findLatestGenerationByProjectId: async () => null,
    },
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

  return {
    orgContext,
    updates,
    generations,
  };
}

test("connectProjectToSupabase auto-creates tables via the Supabase Management API after rewire", async () => {
  const project = createProject();
  const { orgContext } = createTestOrgContext(project);
  const managementCalls: Array<{ url: string; auth: string; body: string }> = [];
  const migrations = [
    'CREATE TABLE IF NOT EXISTS public."tasks" ("id" UUID DEFAULT gen_random_uuid() PRIMARY KEY);',
    'ALTER TABLE public."tasks" ADD COLUMN IF NOT EXISTS "title" TEXT;',
  ];

  const result = await connectProjectToSupabase({
    orgContext: orgContext as any,
    project,
    projectId: project.id,
    supabaseUrl: "https://demo-project.supabase.co",
    supabaseAnonKey: "anon-key",
    oauthAccessToken: "oauth-access-token",
    oauthRefreshToken: "oauth-refresh-token",
    prompt: "rewire prompt",
    ensureSupabaseProjectColumnsFn: async () => undefined,
    fetchFn: async (input: RequestInfo | URL, init?: RequestInit) => {
      managementCalls.push({
        url: String(input),
        auth: String((init?.headers as Record<string, string> | undefined)?.Authorization ?? ""),
        body: String(init?.body ?? ""),
      });
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
    runBuildInBackgroundFn: async (input: Record<string, unknown>) => {
      await (orgContext.db as any).updateGeneration(String(input.buildId), {
        completed_at: new Date().toISOString(),
        files: [
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
        ],
        metadata: { migrations },
        status: "completed",
        summary: "Rewired to Supabase.",
      });
    },
  });

  assert.deepEqual(result, {
    host: "demo-project.supabase.co",
    wiring: true,
    setupSql: migrations.join("\n\n"),
  });
  assert.equal(managementCalls.length, 2);
  assert.equal(managementCalls[0]?.url, "https://api.supabase.com/v1/projects/demo-project/database/query");
  assert.equal(managementCalls[0]?.auth, "Bearer oauth-access-token");
  const firstPayload = JSON.parse(managementCalls[0]?.body ?? "{}") as { query?: string };
  const secondPayload = JSON.parse(managementCalls[1]?.body ?? "{}") as { query?: string };
  assert.equal(firstPayload.query, migrations[0]);
  assert.equal(secondPayload.query, migrations[1]);
});

test("connectProjectToSupabase refreshes the OAuth token and retries table auto-creation on 401", async () => {
  const project = createProject();
  const { orgContext, updates } = createTestOrgContext(project);
  const managementAuthHeaders: string[] = [];
  const migrations = ['CREATE TABLE IF NOT EXISTS public."tasks" ("id" UUID DEFAULT gen_random_uuid() PRIMARY KEY);'];

  const result = await connectProjectToSupabase({
    orgContext: orgContext as any,
    project,
    projectId: project.id,
    supabaseUrl: "https://demo-project.supabase.co",
    supabaseAnonKey: "anon-key",
    oauthAccessToken: "expired-access-token",
    oauthRefreshToken: "refresh-token-1",
    prompt: "rewire prompt",
    ensureSupabaseProjectColumnsFn: async () => undefined,
    fetchFn: async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "https://api.supabase.com/v1/projects/demo-project/database/query") {
        managementAuthHeaders.push(String((init?.headers as Record<string, string> | undefined)?.Authorization ?? ""));
        if (managementAuthHeaders.length === 1) {
          return new Response("expired", { status: 401 });
        }
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url === "https://api.supabase.com/v1/oauth/token") {
        assert.match(String(init?.body ?? ""), /grant_type=refresh_token/);
        return new Response(JSON.stringify({
          access_token: "fresh-access-token",
          refresh_token: "fresh-refresh-token",
          expires_in: 3600,
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      throw new Error(`Unexpected fetch call: ${url}`);
    },
    runBuildInBackgroundFn: async (input: Record<string, unknown>) => {
      await (orgContext.db as any).updateGeneration(String(input.buildId), {
        completed_at: new Date().toISOString(),
        files: [
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
        ],
        metadata: { migrations },
        status: "completed",
        summary: "Rewired to Supabase.",
      });
    },
  });

  assert.deepEqual(result, {
    host: "demo-project.supabase.co",
    wiring: true,
    setupSql: migrations[0],
  });
  assert.deepEqual(managementAuthHeaders, [
    "Bearer expired-access-token",
    "Bearer fresh-access-token",
  ]);
  assert.equal(
    decryptProjectSecret(updates.at(-1)?.supabase_oauth_access_token),
    "fresh-access-token",
  );
  assert.equal(
    decryptProjectSecret(updates.at(-1)?.supabase_oauth_refresh_token),
    "fresh-refresh-token",
  );
});

test("connectProjectToSupabase logs migration failures and still succeeds", async () => {
  const project = createProject();
  const { orgContext } = createTestOrgContext(project);
  const migrations = [
    'CREATE TABLE IF NOT EXISTS public."tasks" ("id" UUID DEFAULT gen_random_uuid() PRIMARY KEY);',
    'ALTER TABLE public."tasks" ADD COLUMN IF NOT EXISTS "title" TEXT;',
  ];
  const managementCalls: string[] = [];
  const originalConsoleError = console.error;
  const loggedErrors: unknown[][] = [];
  console.error = (...args: unknown[]) => {
    loggedErrors.push(args);
  };

  try {
    const result = await connectProjectToSupabase({
      orgContext: orgContext as any,
      project,
      projectId: project.id,
      supabaseUrl: "https://demo-project.supabase.co",
      supabaseAnonKey: "anon-key",
      oauthAccessToken: "oauth-access-token",
      oauthRefreshToken: "oauth-refresh-token",
      prompt: "rewire prompt",
      ensureSupabaseProjectColumnsFn: async () => undefined,
      fetchFn: async (input: RequestInfo | URL) => {
        managementCalls.push(String(input));
        if (managementCalls.length === 1) {
          return new Response("boom", { status: 500 });
        }
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
      runBuildInBackgroundFn: async (input: Record<string, unknown>) => {
        await (orgContext.db as any).updateGeneration(String(input.buildId), {
          completed_at: new Date().toISOString(),
          files: [],
          metadata: { migrations },
          status: "completed",
          summary: "Rewired to Supabase.",
        });
      },
    });

    assert.deepEqual(result, {
      host: "demo-project.supabase.co",
      wiring: true,
      setupSql: migrations.join("\n\n"),
    });
    assert.equal(managementCalls.length, 2);
    assert.equal(loggedErrors.some((entry) => String(entry[0]).includes("[supabaseByo] management query failed")), true);
  } finally {
    console.error = originalConsoleError;
  }
});
