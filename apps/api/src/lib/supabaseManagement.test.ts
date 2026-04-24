import assert from "node:assert/strict";
import test from "node:test";

process.env.ANTHROPIC_API_KEY ??= "test-anthropic-key";
process.env.PROJECT_JWT_SECRET ??= "test-project-secret";
process.env.STUDIO_SUPABASE_URL ??= "https://example.supabase.co";
process.env.STUDIO_SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
process.env.SUPABASE_OAUTH_CLIENT_ID ??= "supabase-oauth-client-id";
process.env.SUPABASE_OAUTH_CLIENT_SECRET ??= "supabase-oauth-client-secret";

const {
  getSupabaseProjectRef,
  readStoredSupabaseToken,
  runSupabaseManagementQueryWithOAuth,
} = await import("./supabaseManagement.js");
const { encryptProjectSecret } = await import("./projectSecrets.js");

test("getSupabaseProjectRef extracts the project ref from the Supabase URL", () => {
  assert.equal(getSupabaseProjectRef("https://demo-project.supabase.co"), "demo-project");
});

test("readStoredSupabaseToken decrypts encrypted persisted tokens", () => {
  assert.equal(
    readStoredSupabaseToken(encryptProjectSecret("oauth-access-token")),
    "oauth-access-token",
  );
});

test("runSupabaseManagementQueryWithOAuth refreshes on 401, persists tokens, and retries once", async () => {
  const authHeaders: string[] = [];
  const persistedTokens: Array<{ accessToken: string; refreshToken: string }> = [];

  const result = await runSupabaseManagementQueryWithOAuth({
    projectId: "project-1",
    supabaseUrl: "https://demo-project.supabase.co",
    accessToken: "expired-access-token",
    refreshToken: "refresh-token-1",
    query: "CREATE TABLE IF NOT EXISTS public.tasks (id uuid primary key)",
    fetchFn: async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === "https://api.supabase.com/v1/projects/demo-project/database/query") {
        authHeaders.push(String((init?.headers as Record<string, string> | undefined)?.Authorization ?? ""));
        if (authHeaders.length === 1) {
          return new Response("expired", { status: 401 });
        }

        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url === "https://api.supabase.com/v1/oauth/token") {
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
    persistTokens: async (tokens) => {
      persistedTokens.push(tokens);
    },
  });

  assert.deepEqual(authHeaders, [
    "Bearer expired-access-token",
    "Bearer fresh-access-token",
  ]);
  assert.deepEqual(persistedTokens, [
    {
      accessToken: "fresh-access-token",
      refreshToken: "fresh-refresh-token",
    },
  ]);
  assert.deepEqual(result, {
    ok: true,
    accessToken: "fresh-access-token",
    refreshToken: "fresh-refresh-token",
    error: null,
  });
});
