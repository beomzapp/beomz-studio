import assert from "node:assert/strict";
import test from "node:test";

import { Hono } from "hono";

import type { ProjectRow } from "@beomz-studio/studio-db";
import type { OrgContext } from "../../types.js";

process.env.ANTHROPIC_API_KEY ??= "test-anthropic-key";
process.env.STUDIO_SUPABASE_URL ??= "https://example.supabase.co";
process.env.STUDIO_SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const { createVercelDomainsRoute } = await import("./vercel.js");
const { VercelApiError } = await import("../../lib/vercelDomains.js");

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

function createOrgContext(
  project: ProjectRow,
  plan = "pro_starter",
  dbOverrides: Partial<OrgContext["db"]> = {},
): OrgContext {
  const now = new Date().toISOString();

  return {
    db: {
      findProjectById: async (id: string) => (id === project.id ? project : null),
      updateProject: async (_projectId: string, patch: Record<string, unknown>) => ({ ...project, ...patch }),
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

function createApp(
  orgContext: OrgContext,
  deps: Parameters<typeof createVercelDomainsRoute>[0] = {},
): Hono {
  const route = createVercelDomainsRoute({
    authMiddleware: async (_c, next) => { await next(); },
    loadOrgContextMiddleware: async (c, next) => {
      c.set("orgContext", orgContext);
      await next();
    },
    ...deps,
  });

  const app = new Hono();
  app.route("/projects/:id/domains", route);
  return app;
}

test("POST /projects/:id/domains blocks free plan orgs", async () => {
  const orgContext = createOrgContext(createProject(), "free");
  const app = createApp(orgContext);

  const response = await app.request("http://localhost/projects/project-1/domains", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ domain: "myapp.com" }),
  });

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), {
    error: "upgrade_required",
    requiredPlan: "starter",
  });
});

test("POST /projects/:id/domains saves the domain and assigns it when verification succeeds immediately", async () => {
  const project = createProject();
  const updates: Array<Record<string, unknown>> = [];
  const assigned: string[] = [];
  const orgContext = createOrgContext(project, "pro_starter", {
    updateProject: async (_projectId: string, patch: Record<string, unknown>) => {
      updates.push(patch);
      return { ...project, ...patch };
    },
  });
  const app = createApp(orgContext, {
    addProjectDomain: async (domain: string) => ({
      name: domain,
      apexName: domain,
      projectId: "prj_123",
      verified: true,
      verification: [],
    }),
    assignDomainToCurrentDeployment: async (_projectArg, domain: string) => {
      assigned.push(domain);
      return "dpl_123";
    },
  });

  const response = await app.request("http://localhost/projects/project-1/domains", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ domain: "MyApp.com" }),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    domain: "myapp.com",
    verified: true,
    verification: [],
  });
  assert.deepEqual(assigned, ["myapp.com"]);
  assert.deepEqual(updates, [
    {
      custom_domains: ["myapp.com"],
    },
  ]);
});

test("POST /projects/:id/domains/:domain/verify reassigns the verified domain to the current deployment", async () => {
  const project = createProject({ custom_domains: ["myapp.com"] });
  const assigned: string[] = [];
  const app = createApp(createOrgContext(project), {
    verifyProjectDomain: async (domain: string) => ({
      name: domain,
      apexName: domain,
      projectId: "prj_123",
      verified: true,
      verification: [],
    }),
    assignDomainToCurrentDeployment: async (_projectArg, domain: string) => {
      assigned.push(domain);
      return "dpl_123";
    },
  });

  const response = await app.request("http://localhost/projects/project-1/domains/myapp.com/verify", {
    method: "POST",
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { verified: true });
  assert.deepEqual(assigned, ["myapp.com"]);
});

test("GET /projects/:id/domains returns verification state for stored custom domains", async () => {
  const project = createProject({ custom_domains: ["myapp.com", "docs.myapp.com"] });
  const app = createApp(createOrgContext(project), {
    getProjectDomain: async (domain: string) => ({
      name: domain,
      apexName: "myapp.com",
      projectId: "prj_123",
      verified: domain === "docs.myapp.com",
      verification: domain === "myapp.com"
        ? [{ type: "TXT", domain: "_vercel.myapp.com", value: "challenge", reason: "ownership" }]
        : [],
    }),
  });

  const response = await app.request("http://localhost/projects/project-1/domains");

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), [
    {
      domain: "myapp.com",
      verified: false,
      verification: [{ type: "TXT", domain: "_vercel.myapp.com", value: "challenge", reason: "ownership" }],
    },
    {
      domain: "docs.myapp.com",
      verified: true,
      verification: [],
    },
  ]);
});

test("DELETE /projects/:id/domains/:domain removes the domain from Vercel and the project record", async () => {
  const project = createProject({ custom_domains: ["myapp.com", "docs.myapp.com"] });
  const removed: string[] = [];
  const updates: Array<Record<string, unknown>> = [];
  const orgContext = createOrgContext(project, "pro_starter", {
    updateProject: async (_projectId: string, patch: Record<string, unknown>) => {
      updates.push(patch);
      return { ...project, ...patch };
    },
  });
  const app = createApp(orgContext, {
    deleteProjectDomain: async (domain: string) => {
      removed.push(domain);
    },
  });

  const response = await app.request("http://localhost/projects/project-1/domains/docs.myapp.com", {
    method: "DELETE",
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { deleted: true });
  assert.deepEqual(removed, ["docs.myapp.com"]);
  assert.deepEqual(updates, [
    {
      custom_domains: ["myapp.com"],
    },
  ]);
});

test("POST /projects/:id/domains returns a friendly message when Vercel reports a conflict", async () => {
  const project = createProject();
  const app = createApp(createOrgContext(project), {
    addProjectDomain: async () => {
      throw new VercelApiError(409, {
        error: {
          code: "domain_in_use",
          message: "Domain already exists",
        },
      }, {
        rawBody: JSON.stringify({
          error: {
            code: "domain_in_use",
            message: "Domain already exists",
          },
        }),
        friendlyMessage: "This domain is already in use on another project.",
        code: "domain_in_use",
      });
    },
  });

  const response = await app.request("http://localhost/projects/project-1/domains", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ domain: "myapp.com" }),
  });

  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), {
    error: "vercel_error",
    message: "This domain is already in use on another project.",
    detail: JSON.stringify({
      error: {
        code: "domain_in_use",
        message: "Domain already exists",
      },
    }),
    code: "domain_in_use",
  });
});
