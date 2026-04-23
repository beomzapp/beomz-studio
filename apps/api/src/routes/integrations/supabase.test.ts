import assert from "node:assert/strict";
import test from "node:test";

import { Hono } from "hono";

import type { OrgContext } from "../../types.js";
import type { ProjectRow } from "@beomz-studio/studio-db";

process.env.STUDIO_SUPABASE_URL ??= "https://example.supabase.co";
process.env.STUDIO_SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
process.env.ANTHROPIC_API_KEY ??= "test-anthropic-key";
process.env.PROJECT_JWT_SECRET ??= "test-project-secret";
process.env.SUPABASE_OAUTH_CLIENT_ID ??= "supabase-oauth-client-id";
process.env.SUPABASE_OAUTH_CLIENT_SECRET ??= "supabase-oauth-client-secret";

const { createSupabaseIntegrationsRoute } = await import("./supabase.js");
const {
  clearAllTemporarySupabaseOAuthTokens,
  readTemporarySupabaseOAuthTokens,
  storeTemporarySupabaseOAuthTokens,
} = await import("../../lib/supabaseOAuth.js");
const {
  decryptProjectSecret,
  encryptProjectSecret,
} = await import("../../lib/projectSecrets.js");

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

function createOrgContext(
  project: ProjectRow,
  dbOverrides: Partial<OrgContext["db"]> = {},
): OrgContext {
  const now = new Date().toISOString();

  return {
    db: {
      findProjectById: async (id: string) => (id === project.id ? project : null),
      updateProject: async (_projectId: string, patch: Record<string, unknown>) => ({
        ...project,
        ...patch,
      }),
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
  deps: Parameters<typeof createSupabaseIntegrationsRoute>[0] = {},
): Hono {
  const route = createSupabaseIntegrationsRoute({
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
  app.route("/integrations/supabase", route);
  return app;
}

test("authorize sets a signed PKCE cookie and redirects to Supabase", async () => {
  clearAllTemporarySupabaseOAuthTokens();
  const app = createApp(createOrgContext(createProject()));

  const response = await app.request(
    "http://localhost/integrations/supabase/authorize?projectId=project-1",
    { redirect: "manual" },
  );

  assert.equal(response.status, 302);
  assert.match(response.headers.get("location") ?? "", /^https:\/\/api\.supabase\.com\/v1\/oauth\/authorize\?/);
  assert.match(response.headers.get("location") ?? "", /state=project-1/);
  assert.match(response.headers.get("location") ?? "", /code_challenge_method=S256/);
  assert.match(response.headers.get("set-cookie") ?? "", /beomz_supabase_oauth_pkce=/);
});

test("callback exchanges the code, stores temporary tokens, and redirects back to studio", async () => {
  clearAllTemporarySupabaseOAuthTokens();
  const app = createApp(createOrgContext(createProject()), {
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      assert.equal(String(input), "https://api.supabase.com/v1/oauth/token");
      assert.match(String(init?.body ?? ""), /grant_type=authorization_code/);
      return new Response(JSON.stringify({
        access_token: "access-token-1",
        refresh_token: "refresh-token-1",
        expires_in: 3600,
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  });

  const authorizeResponse = await app.request(
    "http://localhost/integrations/supabase/authorize?projectId=project-1",
    { redirect: "manual" },
  );
  const setCookieHeader = authorizeResponse.headers.get("set-cookie") ?? "";

  const response = await app.request(
    "http://localhost/integrations/supabase/callback?code=test-code&state=project-1",
    {
      headers: {
        cookie: setCookieHeader,
      },
      redirect: "manual",
    },
  );

  assert.equal(response.status, 302);
  assert.equal(
    response.headers.get("location"),
    "https://beomz.ai/studio/project/project-1?supabase_connected=1",
  );
  assert.deepEqual(readTemporarySupabaseOAuthTokens("project-1"), {
    accessToken: "access-token-1",
    refreshToken: "refresh-token-1",
  });
});

test("projects retries once on 401 using the refresh token", async () => {
  clearAllTemporarySupabaseOAuthTokens();
  const project = createProject();
  const updates: Record<string, unknown>[] = [];
  const orgContext = createOrgContext(project, {
    updateProject: async (_projectId: string, patch: Record<string, unknown>) => {
      updates.push(patch);
      return { ...project, ...patch };
    },
  });
  let managementCalls = 0;
  storeTemporarySupabaseOAuthTokens(project.id, {
    accessToken: "stale-access-token",
    refreshToken: "refresh-token-1",
  });

  const app = createApp(orgContext, {
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "https://api.supabase.com/v1/projects" && managementCalls++ === 0) {
        assert.equal(init?.headers && (init.headers as Record<string, string>).Authorization, "Bearer stale-access-token");
        return new Response("unauthorized", { status: 401 });
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
      if (url === "https://api.supabase.com/v1/projects") {
        assert.equal(init?.headers && (init.headers as Record<string, string>).Authorization, "Bearer fresh-access-token");
        return new Response(JSON.stringify([
          { id: "supabase-project-1", ref: "projref1", name: "Primary", region: "us-east-1" },
        ]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      throw new Error(`Unexpected fetch call: ${url}`);
    },
  });

  const response = await app.request(
    `http://localhost/integrations/supabase/projects?projectId=${project.id}`,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    projects: [
      { id: "supabase-project-1", ref: "projref1", name: "Primary", region: "us-east-1" },
    ],
  });
  assert.equal(updates.length, 0);
  assert.deepEqual(readTemporarySupabaseOAuthTokens(project.id), {
    accessToken: "fresh-access-token",
    refreshToken: "fresh-refresh-token",
  });
});

test("connect fetches api keys, stores encrypted secrets, and triggers silent wiring", async () => {
  clearAllTemporarySupabaseOAuthTokens();
  const project = createProject();
  const ensuredCalls: number[] = [];
  const connectCalls: Array<Record<string, unknown>> = [];
  storeTemporarySupabaseOAuthTokens(project.id, {
    accessToken: "access-token-1",
    refreshToken: "refresh-token-1",
  });

  const app = createApp(createOrgContext(project), {
    ensureSupabaseProjectColumns: async () => {
      ensuredCalls.push(1);
    },
    fetch: async (input: RequestInfo | URL) => {
      assert.equal(String(input), "https://api.supabase.com/v1/projects/abcd1234/api-keys");
      return new Response(JSON.stringify([
        { name: "anon", api_key: "anon-key-1" },
        { name: "service_role", api_key: "service-role-key-1" },
      ]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
    connectProjectToSupabase: async (input: Record<string, unknown>) => {
      connectCalls.push(input);
      return {
        host: "abcd1234.supabase.co",
        wiring: true,
      };
    },
  });

  const response = await app.request("http://localhost/integrations/supabase/connect", {
    method: "POST",
    body: JSON.stringify({
      projectId: project.id,
      supabaseProjectRef: "abcd1234",
    }),
    headers: { "content-type": "application/json" },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { wiring: true });
  assert.deepEqual(ensuredCalls, [1]);
  assert.equal(connectCalls.length, 1);
  assert.equal(connectCalls[0]?.supabaseUrl, "https://abcd1234.supabase.co");
  assert.equal(connectCalls[0]?.supabaseAnonKey, "anon-key-1");
  assert.equal(connectCalls[0]?.serviceRoleKey, "service-role-key-1");
  assert.equal(
    decryptProjectSecret((connectCalls[0]?.extraProjectPatch as Record<string, unknown>)?.byo_db_service_key),
    "service-role-key-1",
  );
  assert.equal(
    decryptProjectSecret((connectCalls[0]?.extraProjectPatch as Record<string, unknown>)?.supabase_oauth_access_token),
    "access-token-1",
  );
  assert.equal(
    decryptProjectSecret((connectCalls[0]?.extraProjectPatch as Record<string, unknown>)?.supabase_oauth_refresh_token),
    "refresh-token-1",
  );
  assert.equal(readTemporarySupabaseOAuthTokens(project.id), null);
});

test("projects uses persisted encrypted tokens when temporary tokens are gone", async () => {
  clearAllTemporarySupabaseOAuthTokens();
  const project = createProject({
    supabase_oauth_access_token: encryptProjectSecret("persisted-access-token"),
    supabase_oauth_refresh_token: encryptProjectSecret("persisted-refresh-token"),
  });

  const app = createApp(createOrgContext(project), {
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      assert.equal(String(input), "https://api.supabase.com/v1/projects");
      assert.equal(init?.headers && (init.headers as Record<string, string>).Authorization, "Bearer persisted-access-token");
      return new Response(JSON.stringify([
        { id: "supabase-project-1", ref: "projref1", name: "Primary", region: { name: "eu-west-1" } },
      ]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  });

  const response = await app.request(
    `http://localhost/integrations/supabase/projects?projectId=${project.id}`,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    projects: [
      { id: "supabase-project-1", ref: "projref1", name: "Primary", region: "eu-west-1" },
    ],
  });
});
