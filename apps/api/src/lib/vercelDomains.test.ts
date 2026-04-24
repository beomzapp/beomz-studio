import assert from "node:assert/strict";
import test from "node:test";

process.env.ANTHROPIC_API_KEY ??= "test-anthropic-key";
process.env.STUDIO_SUPABASE_URL ??= "https://example.supabase.co";
process.env.STUDIO_SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
process.env.VERCEL_TOKEN ??= "vercel-token";
process.env.VERCEL_PROJECT_ID ??= "prj_123";
process.env.VERCEL_TEAM_ID ??= "team_123";

const {
  addProjectDomain,
  addDomainToProjectRecord,
  getFriendlyVercelErrorMessage,
  normalizeCustomDomain,
  readProjectCustomDomains,
  removeDomainFromProjectRecord,
  resolveDeploymentIdForAlias,
  VercelApiError,
} = await import("./vercelDomains.js");

test("normalizeCustomDomain accepts plain hostnames and rejects malformed input", () => {
  assert.equal(normalizeCustomDomain(" MyApp.COM "), "myapp.com");
  assert.equal(normalizeCustomDomain("app.myapp.com."), "app.myapp.com");
  assert.equal(normalizeCustomDomain("https://myapp.com"), null);
  assert.equal(normalizeCustomDomain("myapp"), null);
  assert.equal(normalizeCustomDomain("my_app.com"), null);
});

test("custom domain project record helpers dedupe and remove normalized domains", () => {
  const current = {
    custom_domains: ["MyApp.com", "app.myapp.com", "app.myapp.com", "invalid domain"],
  };

  assert.deepEqual(readProjectCustomDomains(current), ["myapp.com", "app.myapp.com"]);
  assert.deepEqual(addDomainToProjectRecord(current, "newapp.com"), ["myapp.com", "app.myapp.com", "newapp.com"]);
  assert.deepEqual(removeDomainFromProjectRecord(current, "app.myapp.com"), ["myapp.com"]);
});

test("resolveDeploymentIdForAlias picks the newest matching alias deployment", async () => {
  const calls: string[] = [];
  const deploymentId = await resolveDeploymentIdForAlias(
    "taskly.beomz.app",
    async (input) => {
      calls.push(String(input));
      return new Response(JSON.stringify({
        aliases: [
          {
            alias: "taskly.beomz.app",
            deploymentId: "dpl_old",
            createdAt: 100,
            updatedAt: 100,
          },
          {
            alias: "taskly.beomz.app",
            deploymentId: "dpl_new",
            createdAt: 200,
            updatedAt: 250,
          },
        ],
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  );

  assert.equal(deploymentId, "dpl_new");
  assert.equal(
    calls[0],
    "https://api.vercel.com/v4/aliases?teamId=team_123&projectId=prj_123&domain=taskly.beomz.app&limit=20",
  );
});

test("getFriendlyVercelErrorMessage maps Vercel status codes to UI-safe copy", () => {
  assert.equal(getFriendlyVercelErrorMessage(409), "This domain is already in use on another project.");
  assert.equal(getFriendlyVercelErrorMessage(400), "Invalid domain name. Please check and try again.");
  assert.equal(getFriendlyVercelErrorMessage(403), "Domain not allowed. Please try a different domain.");
  assert.equal(getFriendlyVercelErrorMessage(402), "Payment required. Please check your Vercel account.");
  assert.equal(getFriendlyVercelErrorMessage(500), "Failed to add domain. Please try again.");
});

test("addProjectDomain retries after conflict by removing the existing domain from the configured project", async () => {
  const calls: Array<{ url: string; method?: string }> = [];
  const result = await addProjectDomain(
    "myapp.com",
    async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      calls.push({ url, method });

      if (method === "POST" && url === "https://api.vercel.com/v10/projects/prj_123/domains?teamId=team_123") {
        const addCallCount = calls.filter((call) => call.method === "POST" && call.url === url).length;
        if (addCallCount === 1) {
          return new Response(JSON.stringify({
            error: {
              code: "domain_in_use",
              message: "Domain already exists",
            },
          }), {
            status: 409,
            headers: { "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify({
          name: "myapp.com",
          apexName: "myapp.com",
          projectId: "prj_123",
          verified: false,
          verification: [],
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (method === "DELETE" && url === "https://api.vercel.com/v9/projects/prj_123/domains/myapp.com?teamId=team_123") {
        return new Response(null, { status: 404 });
      }

      throw new Error(`Unexpected fetch: ${method} ${url}`);
    },
  );

  assert.equal(result.name, "myapp.com");
  assert.deepEqual(calls, [
    {
      url: "https://api.vercel.com/v10/projects/prj_123/domains?teamId=team_123",
      method: "POST",
    },
    {
      url: "https://api.vercel.com/v9/projects/prj_123/domains/myapp.com?teamId=team_123",
      method: "DELETE",
    },
    {
      url: "https://api.vercel.com/v10/projects/prj_123/domains?teamId=team_123",
      method: "POST",
    },
  ]);
});

test("addProjectDomain throws a friendly conflict error when Vercel still returns 409 after retry", async () => {
  await assert.rejects(
    () => addProjectDomain(
      "myapp.com",
      async (input, init) => {
        const url = String(input);
        const method = init?.method ?? "GET";

        if (method === "POST" && url === "https://api.vercel.com/v10/projects/prj_123/domains?teamId=team_123") {
          return new Response(JSON.stringify({
            error: {
              code: "domain_in_use",
              message: "Domain already exists",
            },
          }), {
            status: 409,
            headers: { "Content-Type": "application/json" },
          });
        }

        if (method === "DELETE" && url === "https://api.vercel.com/v9/projects/prj_123/domains/myapp.com?teamId=team_123") {
          return new Response(null, { status: 404 });
        }

        throw new Error(`Unexpected fetch: ${method} ${url}`);
      },
    ),
    (error: unknown) => {
      assert.ok(error instanceof VercelApiError);
      assert.equal(error.status, 409);
      assert.equal(error.friendlyMessage, "This domain is already in use on another project.");
      assert.equal(error.code, "domain_in_use");
      return true;
    },
  );
});
