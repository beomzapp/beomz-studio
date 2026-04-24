import assert from "node:assert/strict";
import test from "node:test";

process.env.ANTHROPIC_API_KEY ??= "test-anthropic-key";
process.env.STUDIO_SUPABASE_URL ??= "https://example.supabase.co";
process.env.STUDIO_SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
process.env.VERCEL_TOKEN ??= "vercel-token";
process.env.VERCEL_PROJECT_ID ??= "prj_123";
process.env.VERCEL_TEAM_ID ??= "team_123";

const {
  assignDeploymentAlias,
  vercelDeployStart,
} = await import("./vercelDeploy.js");

test("assignDeploymentAlias posts the alias to the new deployment", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input, init) => {
    calls.push({
      url: String(input),
      init,
    });

    return new Response(JSON.stringify({ uid: "alias_123" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    await assignDeploymentAlias("vercel-token", "team_123", "dpl_123", "taskly.beomz.app");
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, "https://api.vercel.com/v2/deployments/dpl_123/aliases?teamId=team_123");
  assert.equal(calls[0]?.init?.method, "POST");
  assert.equal(calls[0]?.init?.headers && "Authorization" in calls[0].init.headers ? (calls[0].init.headers as Record<string, string>).Authorization : undefined, "Bearer vercel-token");
  assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), {
    alias: "taskly.beomz.app",
    redirect: null,
  });
});

test("vercelDeployStart assigns the project alias after creating the deployment", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input, init) => {
    calls.push({
      url: String(input),
      init,
    });

    const url = String(input);
    if (url === "https://api.vercel.com/v2/now/files") {
      return new Response(null, { status: 200 });
    }

    if (url === "https://api.vercel.com/v13/deployments?teamId=team_123") {
      return new Response(JSON.stringify({ id: "dpl_new" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (url === "https://api.vercel.com/v2/deployments/dpl_new/aliases?teamId=team_123") {
      return new Response(JSON.stringify({ uid: "alias_123" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    throw new Error(`Unexpected fetch: ${url}`);
  };

  try {
    const handle = await vercelDeployStart({
      slug: "taskly",
      files: [
        {
          filename: "index.html",
          content: "<html></html>",
        },
      ],
    });

    assert.equal(handle.deploymentId, "dpl_new");
    assert.equal(handle.url, "https://taskly.beomz.app");
  } finally {
    globalThis.fetch = originalFetch;
  }

  const createIndex = calls.findIndex((call) => call.url === "https://api.vercel.com/v13/deployments?teamId=team_123");
  const aliasIndex = calls.findIndex((call) => call.url === "https://api.vercel.com/v2/deployments/dpl_new/aliases?teamId=team_123");

  assert.notEqual(createIndex, -1);
  assert.notEqual(aliasIndex, -1);
  assert.ok(aliasIndex > createIndex);

  const createBody = JSON.parse(String(calls[createIndex]?.init?.body));
  assert.equal(createBody.target, "production");
  assert.equal("alias" in createBody, false);
});
