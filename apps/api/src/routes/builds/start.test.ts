import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import type { OrgContext } from "../../types.js";

process.env.ANTHROPIC_API_KEY ??= "test-key";
process.env.STUDIO_SUPABASE_URL ??= "https://example.supabase.co";
process.env.STUDIO_SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
process.env.TAVILY_API_KEY ??= "test-tavily-key";

test("/builds/start defaults generation to claude-sonnet-4-6", async () => {
  const source = await readFile(new URL("./start.ts", import.meta.url), "utf8");

  assert.match(source, /export const DEFAULT_BUILD_MODEL = "claude-sonnet-4-6";/);
  assert.match(source, /const effectiveModel = parsedBody\.data\.model \?\? DEFAULT_BUILD_MODEL;/);
  assert.match(source, /const NEW_BUILD_PLAN_SUMMARY_CONFIDENCE = 0\.8;/);
  assert.match(source, /const ITERATION_BUILD_CONFIDENCE = 0\.7;/);
  assert.match(source, /clarifyingQuestionCount >= MAX_CLARIFYING_QUESTIONS/);
  assert.match(source, /const shouldOfferPlanSummary = isBuildIshIntent[\s\S]*&& !isIteration;/);
});

test("/builds/start returns a conversational generation for greeting intent and does not queue a build", async () => {
  const { createBuildsStartRoute } = await import("./start.js");

  let runBuildCalls = 0;
  const project = {
    id: "11111111-1111-1111-1111-111111111111",
    name: "PettyCash",
    org_id: "org-1",
    status: "ready",
    template: "workspace-task",
    icon: "CheckSquare",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    chat_history: [],
    chat_summary: "Expense dashboard",
  };

  const org = {
    id: "org-1",
    owner_id: "user-1",
    name: "Test Org",
    plan: "pro",
    credits: 10,
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
    created_at: new Date().toISOString(),
  } satisfies OrgContext["org"];

  const route = createBuildsStartRoute({
    authMiddleware: async (_c, next) => {
      await next();
    },
    loadOrgContextMiddleware: async (c, next) => {
      c.set("orgContext", {
        db: {
          applyOrgUsageDeduction: async () => ({
            deducted: 1,
            credits: 9,
            topup_credits: 0,
          }),
          createGeneration: async (input: Record<string, unknown>) => ({
            completed_at: input.completed_at as string | null,
            error: input.error as string | null,
            id: input.id as string,
            metadata: input.metadata as Record<string, unknown>,
            operation_id: input.operation_id as string,
            output_paths: input.output_paths as string[],
            preview_entry_path: input.preview_entry_path as string | null,
            project_id: input.project_id as string,
            prompt: input.prompt as string,
            session_events: (input.session_events as Record<string, unknown>[] | undefined) ?? [],
            started_at: input.started_at as string,
            status: input.status as string,
            summary: input.summary as string | null,
            template_id: input.template_id as string,
            warnings: (input.warnings as string[] | undefined) ?? [],
          }),
          findLatestGenerationByProjectId: async () => ({
            files: [
              {
                path: "apps/web/src/app/generated/pettycash/App.tsx",
                kind: "route",
                language: "tsx",
                content: "export default function App() { return <div>PettyCash</div>; }",
                source: "ai",
                locked: false,
              },
            ],
          }),
          findProjectById: async () => project,
          getOrgWithBalance: async () => org,
          updateProject: async (_projectId: string, patch: Record<string, unknown>) => ({
            ...project,
            ...patch,
          }),
        } as OrgContext["db"],
        jwt: { sub: "platform-user" },
        membership: { org_id: "org-1", role: "owner", user_id: "user-1", created_at: new Date().toISOString() },
        org,
        user: {
          id: "user-1",
          email: "omar@example.com",
          platform_user_id: "platform-user",
          created_at: new Date().toISOString(),
        },
      });
      await next();
    },
    classifyIntent: async () => ({
      intent: "greeting",
      confidence: 0.99,
      reason: "test",
    }),
    generateConversationalAnswer: async () => ({
      message: "**Hey!**\n\nPettyCash is ready for the next change.",
      readyToImplement: false,
      implementPlan: null,
    }),
    runBuildInBackground: async () => {
      runBuildCalls += 1;
    },
  });

  const response = await route.request("http://localhost/", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      prompt: "hi",
      projectId: project.id,
    }),
  });

  assert.equal(response.status, 202);
  const payload = await response.json() as {
    build: { status: string };
    trace: { events: Array<{ type: string; message?: string }>; lastEventId: string | null };
  };

  assert.equal(payload.build.status, "completed");
  assert.equal(payload.trace.lastEventId, null);
  assert.equal(payload.trace.events.some((event) => event.type === "conversational_response"), true);
  assert.equal(payload.trace.events.some((event) => event.type === "done"), true);
  assert.equal(
    payload.trace.events.some((event) => event.message?.includes("PettyCash is ready for the next change.")),
    true,
  );
  assert.equal(runBuildCalls, 0);
});

test("/builds/start returns a plan summary with implementPlan when confidence reaches 0.8", async () => {
  const { createBuildsStartRoute } = await import("./start.js");

  let runBuildCalls = 0;
  let createdGenerationMetadata: Record<string, unknown> | null = null;
  const project = {
    id: "22222222-2222-2222-2222-222222222222",
    name: "Pet Store",
    org_id: "org-1",
    status: "ready",
    template: "marketing-website",
    icon: "Globe",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    chat_history: [
      { role: "user", content: "thinking of building a website", timestamp: new Date().toISOString() },
      { role: "assistant", content: "What kind of website?", timestamp: new Date().toISOString() },
      { role: "user", content: "pet store", timestamp: new Date().toISOString() },
    ],
    chat_summary: "Pet website discovery.",
  };

  const org = {
    id: "org-1",
    owner_id: "user-1",
    name: "Test Org",
    plan: "pro",
    credits: 10,
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
    created_at: new Date().toISOString(),
  } satisfies OrgContext["org"];

  const route = createBuildsStartRoute({
    authMiddleware: async (_c, next) => {
      await next();
    },
    loadOrgContextMiddleware: async (c, next) => {
      c.set("orgContext", {
        db: {
          applyOrgUsageDeduction: async () => ({
            deducted: 1,
            credits: 9,
            topup_credits: 0,
          }),
          createGeneration: async (input: Record<string, unknown>) => {
            createdGenerationMetadata = input.metadata as Record<string, unknown>;
            return {
              completed_at: input.completed_at as string | null,
              error: input.error as string | null,
              id: input.id as string,
              metadata: input.metadata as Record<string, unknown>,
              operation_id: input.operation_id as string,
              output_paths: input.output_paths as string[],
              preview_entry_path: input.preview_entry_path as string | null,
              project_id: input.project_id as string,
              prompt: input.prompt as string,
              session_events: (input.session_events as Record<string, unknown>[] | undefined) ?? [],
              started_at: input.started_at as string,
              status: input.status as string,
              summary: input.summary as string | null,
              template_id: input.template_id as string,
              warnings: (input.warnings as string[] | undefined) ?? [],
            };
          },
          findLatestGenerationByProjectId: async () => ({
            files: [],
            metadata: {},
          }),
          findProjectById: async () => project,
          getOrgWithBalance: async () => org,
          updateProject: async (_projectId: string, patch: Record<string, unknown>) => ({
            ...project,
            ...patch,
          }),
        } as OrgContext["db"],
        jwt: { sub: "platform-user" },
        membership: { org_id: "org-1", role: "owner", user_id: "user-1", created_at: new Date().toISOString() },
        org,
        user: {
          id: "user-1",
          email: "omar@example.com",
          platform_user_id: "platform-user",
          created_at: new Date().toISOString(),
        },
      });
      await next();
    },
    classifyIntent: async () => ({
      intent: "build_new",
      confidence: 0.82,
      reason: "Complete enough to build.",
      accumulatedContext: "Build a playful colorful pet store website with product listings, grooming services, and a kid-centric design.",
    }),
    generatePlanSummary: async () => [
      "Here's what I'll do:",
      "**PetPals**",
      "- Product listings",
      "- Grooming services",
      "- Playful colorful kid-centric design",
      "",
      "Ready when you are — or type any changes first.",
    ].join("\n"),
    runBuildInBackground: async () => {
      runBuildCalls += 1;
    },
  });

  const response = await route.request("http://localhost/", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      prompt: "playful colorful kid centric",
      projectId: project.id,
    }),
  });

  assert.equal(response.status, 202);
  const payload = await response.json() as {
    build: { status: string; summary: string | null };
    trace: {
      events: Array<{
        type: string;
        message?: string;
        readyToImplement?: boolean;
        implementPlan?: string;
      }>;
      lastEventId: string | null;
    };
  };

  assert.equal(payload.build.status, "completed");
  assert.equal(payload.build.summary, "Plan summary ready - awaiting build confirmation.");
  assert.equal(payload.trace.lastEventId, null);
  const summaryEvent = payload.trace.events.find((event) => event.type === "conversational_response");
  assert.ok(summaryEvent);
  assert.equal(summaryEvent?.readyToImplement, true);
  assert.equal(
    summaryEvent?.implementPlan,
    "Build a playful colorful pet store website with product listings, grooming services, and a kid-centric design.",
  );
  assert.match(summaryEvent?.message ?? "", /Here's what I'll do:/);
  assert.equal(createdGenerationMetadata?.readyToImplement, true);
  assert.equal(runBuildCalls, 0);
});

test("/builds/start skips plan summaries for iteration intents and queues the build immediately", async () => {
  const { createBuildsStartRoute } = await import("./start.js");

  let runBuildCalls = 0;
  let capturedBuildPrompt: string | null = null;
  const project = {
    id: "99999999-9999-9999-9999-999999999999",
    name: "PettyCash",
    org_id: "org-1",
    status: "ready",
    template: "workspace-task",
    icon: "CheckSquare",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    chat_history: [],
    chat_summary: "Expense dashboard",
  };
  const existingFiles = [
    {
      path: "apps/web/src/app/generated/pettycash/App.tsx",
      kind: "route",
      language: "tsx",
      content: "export default function App() { return <div>PettyCash</div>; }",
      source: "ai",
      locked: false,
    },
  ];

  const org = {
    id: "org-1",
    owner_id: "user-1",
    name: "Test Org",
    plan: "pro",
    credits: 10,
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
    created_at: new Date().toISOString(),
  } satisfies OrgContext["org"];

  const route = createBuildsStartRoute({
    authMiddleware: async (_c, next) => {
      await next();
    },
    loadOrgContextMiddleware: async (c, next) => {
      c.set("orgContext", {
        db: {
          createGeneration: async (input: Record<string, unknown>) => ({
            completed_at: input.completed_at as string | null,
            error: input.error as string | null,
            id: input.id as string,
            metadata: input.metadata as Record<string, unknown>,
            operation_id: input.operation_id as string,
            output_paths: input.output_paths as string[],
            preview_entry_path: input.preview_entry_path as string | null,
            project_id: input.project_id as string,
            prompt: input.prompt as string,
            session_events: [],
            started_at: input.started_at as string,
            status: input.status as string,
            summary: input.summary as string | null,
            template_id: input.template_id as string,
            warnings: [],
          }),
          findLatestGenerationByProjectId: async () => ({
            files: existingFiles,
            metadata: {},
          }),
          findProjectById: async () => project,
          getOrgWithBalance: async () => org,
          updateProject: async (_projectId: string, patch: Record<string, unknown>) => ({
            ...project,
            ...patch,
          }),
        } as OrgContext["db"],
        jwt: { sub: "platform-user" },
        membership: { org_id: "org-1", role: "owner", user_id: "user-1", created_at: new Date().toISOString() },
        org,
        user: {
          id: "user-1",
          email: "omar@example.com",
          platform_user_id: "platform-user",
          created_at: new Date().toISOString(),
        },
      });
      await next();
    },
    classifyIntent: async () => ({
      intent: "iteration",
      confidence: 0.75,
      reason: "Clear iteration request.",
      accumulatedContext: "Update the app to use a red and blue theme throughout.",
    }),
    generatePlanSummary: async () => {
      throw new Error("iteration should not render a plan summary");
    },
    generateConversationalAnswer: async () => {
      throw new Error("iteration should not stay in conversational mode");
    },
    runBuildInBackground: async (input) => {
      runBuildCalls += 1;
      capturedBuildPrompt = input.prompt;
    },
  });

  const response = await route.request("http://localhost/", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      prompt: "make it red and blue theme",
      projectId: project.id,
    }),
  });

  assert.equal(response.status, 202);
  const payload = await response.json() as {
    build: { status: string; summary: string | null };
    trace: { events: Array<{ type: string }>; lastEventId: string | null };
  };

  assert.equal(payload.build.status, "queued");
  assert.equal(payload.build.summary, "Queued requested changes for PettyCash.");
  assert.equal(payload.trace.lastEventId, "1");
  assert.equal(payload.trace.events.some((event) => event.type === "conversational_response"), false);
  assert.equal(runBuildCalls, 1);
  assert.equal(capturedBuildPrompt, "Update the app to use a red and blue theme throughout.");
});

test("/builds/start proceeds to build when the implementPlan is sent back unchanged", async () => {
  const { createBuildsStartRoute } = await import("./start.js");

  let runBuildCalls = 0;
  let capturedBuildPrompt: string | null = null;
  const implementPlan = "Build a playful colorful pet store website with product listings, grooming services, and a kid-centric design.";
  const project = {
    id: "33333333-3333-3333-3333-333333333333",
    name: "Pet Store",
    org_id: "org-1",
    status: "ready",
    template: "marketing-website",
    icon: "Globe",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    chat_history: [],
    chat_summary: "Plan summary already shared.",
  };

  const org = {
    id: "org-1",
    owner_id: "user-1",
    name: "Test Org",
    plan: "pro",
    credits: 10,
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
    created_at: new Date().toISOString(),
  } satisfies OrgContext["org"];

  const route = createBuildsStartRoute({
    authMiddleware: async (_c, next) => {
      await next();
    },
    loadOrgContextMiddleware: async (c, next) => {
      c.set("orgContext", {
        db: {
          createGeneration: async (input: Record<string, unknown>) => ({
            completed_at: input.completed_at as string | null,
            error: input.error as string | null,
            id: input.id as string,
            metadata: input.metadata as Record<string, unknown>,
            operation_id: input.operation_id as string,
            output_paths: input.output_paths as string[],
            preview_entry_path: input.preview_entry_path as string | null,
            project_id: input.project_id as string,
            prompt: input.prompt as string,
            session_events: [],
            started_at: input.started_at as string,
            status: input.status as string,
            summary: input.summary as string | null,
            template_id: input.template_id as string,
            warnings: [],
          }),
          findLatestGenerationByProjectId: async () => ({
            files: [],
            metadata: { implementPlan, readyToImplement: true },
          }),
          findProjectById: async () => project,
          getOrgWithBalance: async () => org,
          updateProject: async (_projectId: string, patch: Record<string, unknown>) => ({
            ...project,
            ...patch,
          }),
        } as OrgContext["db"],
        jwt: { sub: "platform-user" },
        membership: { org_id: "org-1", role: "owner", user_id: "user-1", created_at: new Date().toISOString() },
        org,
        user: {
          id: "user-1",
          email: "omar@example.com",
          platform_user_id: "platform-user",
          created_at: new Date().toISOString(),
        },
      });
      await next();
    },
    classifyIntent: async () => {
      throw new Error("implement confirmation should bypass intent detection");
    },
    runBuildInBackground: async (input) => {
      runBuildCalls += 1;
      capturedBuildPrompt = input.prompt;
    },
  });

  const response = await route.request("http://localhost/", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      prompt: implementPlan,
      projectId: project.id,
    }),
  });

  assert.equal(response.status, 202);
  const payload = await response.json() as {
    build: { status: string };
    trace: { events: Array<{ type: string }>; lastEventId: string | null };
  };

  assert.equal(payload.build.status, "queued");
  assert.equal(payload.trace.lastEventId, "1");
  assert.equal(payload.trace.events.some((event) => event.type === "conversational_response"), false);
  assert.equal(runBuildCalls, 1);
  assert.equal(capturedBuildPrompt, implementPlan);
});

test("/builds/start accepts implementPlan as the build prompt alias", async () => {
  const { createBuildsStartRoute } = await import("./start.js");

  let runBuildCalls = 0;
  let capturedBuildPrompt: string | null = null;
  const implementPlan = "Build a premium PawLux pet care app with boutique grooming, daycare booking, and a polished luxury brand.";

  const org = {
    id: "org-1",
    owner_id: "user-1",
    name: "Test Org",
    plan: "pro",
    credits: 10,
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
    created_at: new Date().toISOString(),
  } satisfies OrgContext["org"];

  const route = createBuildsStartRoute({
    authMiddleware: async (_c, next) => {
      await next();
    },
    loadOrgContextMiddleware: async (c, next) => {
      c.set("orgContext", {
        db: {
          createGeneration: async (input: Record<string, unknown>) => ({
            completed_at: input.completed_at as string | null,
            error: input.error as string | null,
            id: input.id as string,
            metadata: input.metadata as Record<string, unknown>,
            operation_id: input.operation_id as string,
            output_paths: input.output_paths as string[],
            preview_entry_path: input.preview_entry_path as string | null,
            project_id: input.project_id as string,
            prompt: input.prompt as string,
            session_events: [],
            started_at: input.started_at as string,
            status: input.status as string,
            summary: input.summary as string | null,
            template_id: input.template_id as string,
            warnings: [],
          }),
          getOrgWithBalance: async () => org,
          updateProject: async (_projectId: string, patch: Record<string, unknown>) => ({
            id: patch.id ?? "55555555-5555-5555-5555-555555555555",
            name: patch.name ?? "PawLux",
            org_id: org.id,
            status: patch.status ?? "queued",
            template: patch.template ?? "interactive-tool",
            icon: "Wrench",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            chat_history: [],
            chat_summary: null,
          }),
          createProject: async (input: Record<string, unknown>) => ({
            id: input.id as string,
            name: input.name as string,
            org_id: input.org_id as string,
            status: input.status as string,
            template: input.template as string,
            icon: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            chat_history: [],
            chat_summary: null,
          }),
        } as OrgContext["db"],
        jwt: { sub: "platform-user" },
        membership: { org_id: "org-1", role: "owner", user_id: "user-1", created_at: new Date().toISOString() },
        org,
        user: {
          id: "user-1",
          email: "omar@example.com",
          platform_user_id: "platform-user",
          created_at: new Date().toISOString(),
        },
      });
      await next();
    },
    classifyIntent: async () => {
      throw new Error("explicit implement signal should bypass intent detection");
    },
    runBuildInBackground: async (input) => {
      runBuildCalls += 1;
      capturedBuildPrompt = input.prompt;
    },
  });

  const response = await route.request("http://localhost/", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      implementPlan,
    }),
  });

  assert.equal(response.status, 202);
  assert.equal(runBuildCalls, 1);
  assert.equal(capturedBuildPrompt, implementPlan);
});

test("/builds/start bypasses intent detection when build_confirmed is posted", async () => {
  const { createBuildsStartRoute } = await import("./start.js");

  let runBuildCalls = 0;
  let capturedBuildPrompt: string | null = null;
  const implementPlan = "Build a polished PawLux site with premium pet services, bookings, and a red and blue visual refresh.";

  const org = {
    id: "org-1",
    owner_id: "user-1",
    name: "Test Org",
    plan: "pro",
    credits: 10,
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
    created_at: new Date().toISOString(),
  } satisfies OrgContext["org"];

  const route = createBuildsStartRoute({
    authMiddleware: async (_c, next) => {
      await next();
    },
    loadOrgContextMiddleware: async (c, next) => {
      c.set("orgContext", {
        db: {
          createGeneration: async (input: Record<string, unknown>) => ({
            completed_at: input.completed_at as string | null,
            error: input.error as string | null,
            id: input.id as string,
            metadata: input.metadata as Record<string, unknown>,
            operation_id: input.operation_id as string,
            output_paths: input.output_paths as string[],
            preview_entry_path: input.preview_entry_path as string | null,
            project_id: input.project_id as string,
            prompt: input.prompt as string,
            session_events: [],
            started_at: input.started_at as string,
            status: input.status as string,
            summary: input.summary as string | null,
            template_id: input.template_id as string,
            warnings: [],
          }),
          createProject: async (input: Record<string, unknown>) => ({
            id: input.id as string,
            name: input.name as string,
            org_id: input.org_id as string,
            status: input.status as string,
            template: input.template as string,
            icon: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            chat_history: [],
            chat_summary: null,
          }),
          getOrgWithBalance: async () => org,
          updateProject: async (_projectId: string, patch: Record<string, unknown>) => ({
            id: patch.id ?? "77777777-7777-7777-7777-777777777777",
            name: patch.name ?? "PawLux",
            org_id: org.id,
            status: patch.status ?? "queued",
            template: patch.template ?? "interactive-tool",
            icon: "Wrench",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            chat_history: [],
            chat_summary: null,
          }),
        } as OrgContext["db"],
        jwt: { sub: "platform-user" },
        membership: { org_id: "org-1", role: "owner", user_id: "user-1", created_at: new Date().toISOString() },
        org,
        user: {
          id: "user-1",
          email: "omar@example.com",
          platform_user_id: "platform-user",
          created_at: new Date().toISOString(),
        },
      });
      await next();
    },
    classifyIntent: async () => {
      throw new Error("build_confirmed should bypass intent detection");
    },
    runBuildInBackground: async (input) => {
      runBuildCalls += 1;
      capturedBuildPrompt = input.prompt;
    },
  });

  const response = await route.request("http://localhost/", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      build_confirmed: true,
      prompt: implementPlan,
    }),
  });

  assert.equal(response.status, 202);
  assert.equal(runBuildCalls, 1);
  assert.equal(capturedBuildPrompt, implementPlan);
});

test("/builds/start accepts short non-empty build prompts", async () => {
  const { createBuildsStartRoute } = await import("./start.js");

  let runBuildCalls = 0;
  const org = {
    id: "org-1",
    owner_id: "user-1",
    name: "Test Org",
    plan: "pro",
    credits: 10,
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
    created_at: new Date().toISOString(),
  } satisfies OrgContext["org"];

  const route = createBuildsStartRoute({
    authMiddleware: async (_c, next) => {
      await next();
    },
    loadOrgContextMiddleware: async (c, next) => {
      c.set("orgContext", {
        db: {
          applyOrgUsageDeduction: async () => ({
            deducted: 1,
            credits: 9,
            topup_credits: 0,
          }),
          createGeneration: async (input: Record<string, unknown>) => ({
            completed_at: input.completed_at as string | null,
            error: input.error as string | null,
            id: input.id as string,
            metadata: input.metadata as Record<string, unknown>,
            operation_id: input.operation_id as string,
            output_paths: input.output_paths as string[],
            preview_entry_path: input.preview_entry_path as string | null,
            project_id: input.project_id as string,
            prompt: input.prompt as string,
            session_events: [],
            started_at: input.started_at as string,
            status: input.status as string,
            summary: input.summary as string | null,
            template_id: input.template_id as string,
            warnings: [],
          }),
          createProject: async (input: Record<string, unknown>) => ({
            id: input.id as string,
            name: input.name as string,
            org_id: input.org_id as string,
            status: input.status as string,
            template: input.template as string,
            icon: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            chat_history: [],
            chat_summary: null,
          }),
          findProjectById: async () => null,
          getOrgWithBalance: async () => org,
          updateProject: async (_projectId: string, patch: Record<string, unknown>) => ({
            id: patch.id ?? "88888888-8888-8888-8888-888888888888",
            name: patch.name ?? "New Project",
            org_id: org.id,
            status: patch.status ?? "queued",
            template: patch.template ?? "interactive-tool",
            icon: "Wrench",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            chat_history: [],
            chat_summary: null,
          }),
        } as OrgContext["db"],
        jwt: { sub: "platform-user" },
        membership: { org_id: "org-1", role: "owner", user_id: "user-1", created_at: new Date().toISOString() },
        org,
        user: {
          id: "user-1",
          email: "omar@example.com",
          platform_user_id: "platform-user",
          created_at: new Date().toISOString(),
        },
      });
      await next();
    },
    classifyIntent: async () => ({
      intent: "build_new",
      confidence: 0.97,
      reason: "Clear build request.",
      accumulatedContext: "todo app",
    }),
    generatePlanSummary: async () => "Here's what I'll do:\n- Build the core todo flow\n- Keep it simple",
    runBuildInBackground: async (input) => {
      runBuildCalls += 1;
    },
  });

  const response = await route.request("http://localhost/", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      prompt: "a",
    }),
  });

  assert.equal(response.status, 202);
  const payload = await response.json() as {
    trace: {
      events: Array<{ type: string; readyToImplement?: boolean }>;
      lastEventId: string | null;
    };
  };

  assert.equal(payload.trace.lastEventId, null);
  assert.equal(payload.trace.events.some((event) => event.type === "conversational_response"), true);
  assert.equal(payload.trace.events.some((event) => event.readyToImplement === true), true);
  assert.equal(runBuildCalls, 0);
});

test("/builds/start forces a plan summary after four clarifying questions even below 0.8 confidence", async () => {
  const { createBuildsStartRoute } = await import("./start.js");

  let runBuildCalls = 0;
  const project = {
    id: "44444444-4444-4444-4444-444444444444",
    name: "Pet Store",
    org_id: "org-1",
    status: "ready",
    template: "marketing-website",
    icon: "Globe",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    chat_history: [
      { role: "assistant", content: "What kind of website are you thinking of?", timestamp: new Date().toISOString() },
      { role: "user", content: "pet store", timestamp: new Date().toISOString() },
      { role: "assistant", content: "Which pages should it include?", timestamp: new Date().toISOString() },
      { role: "user", content: "landing page and shop", timestamp: new Date().toISOString() },
      { role: "assistant", content: "What style do you want?", timestamp: new Date().toISOString() },
      { role: "user", content: "not sure yet", timestamp: new Date().toISOString() },
      { role: "assistant", content: "Should it feel playful or premium?", timestamp: new Date().toISOString() },
      { role: "user", content: "playful", timestamp: new Date().toISOString() },
    ],
    chat_summary: "Pet store discovery.",
  };

  const org = {
    id: "org-1",
    owner_id: "user-1",
    name: "Test Org",
    plan: "pro",
    credits: 10,
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
    created_at: new Date().toISOString(),
  } satisfies OrgContext["org"];

  const route = createBuildsStartRoute({
    authMiddleware: async (_c, next) => {
      await next();
    },
    loadOrgContextMiddleware: async (c, next) => {
      c.set("orgContext", {
        db: {
          applyOrgUsageDeduction: async () => ({
            deducted: 1,
            credits: 9,
            topup_credits: 0,
          }),
          createGeneration: async (input: Record<string, unknown>) => ({
            completed_at: input.completed_at as string | null,
            error: input.error as string | null,
            id: input.id as string,
            metadata: input.metadata as Record<string, unknown>,
            operation_id: input.operation_id as string,
            output_paths: input.output_paths as string[],
            preview_entry_path: input.preview_entry_path as string | null,
            project_id: input.project_id as string,
            prompt: input.prompt as string,
            session_events: (input.session_events as Record<string, unknown>[] | undefined) ?? [],
            started_at: input.started_at as string,
            status: input.status as string,
            summary: input.summary as string | null,
            template_id: input.template_id as string,
            warnings: (input.warnings as string[] | undefined) ?? [],
          }),
          findLatestGenerationByProjectId: async () => ({
            files: [],
            metadata: {},
          }),
          findProjectById: async () => project,
          getOrgWithBalance: async () => org,
          updateProject: async (_projectId: string, patch: Record<string, unknown>) => ({
            ...project,
            ...patch,
          }),
        } as OrgContext["db"],
        jwt: { sub: "platform-user" },
        membership: { org_id: "org-1", role: "owner", user_id: "user-1", created_at: new Date().toISOString() },
        org,
        user: {
          id: "user-1",
          email: "omar@example.com",
          platform_user_id: "platform-user",
          created_at: new Date().toISOString(),
        },
      });
      await next();
    },
    classifyIntent: async () => ({
      intent: "build_new",
      confidence: 0.55,
      reason: "Still incomplete.",
      accumulatedContext: "Build a pet store website with a landing page and a shop to buy products.",
    }),
    generatePlanSummary: async () => "Here's what I'll build:\n**Pet Store**\n- Landing page\n- Shop\n- Friendly visual direction\n\nReady to build this — or type any changes first.",
    runBuildInBackground: async () => {
      runBuildCalls += 1;
    },
  });

  const response = await route.request("http://localhost/", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      prompt: "maybe playful",
      projectId: project.id,
    }),
  });

  assert.equal(response.status, 202);
  const payload = await response.json() as {
    build: { status: string; summary: string | null };
    trace: {
      events: Array<{
        type: string;
        message?: string;
        readyToImplement?: boolean;
      }>;
    };
  };

  assert.equal(payload.build.status, "completed");
  assert.equal(payload.build.summary, "Plan summary ready - awaiting build confirmation.");
  assert.equal(payload.trace.events.some((event) => event.type === "conversational_response"), true);
  assert.equal(payload.trace.events.some((event) => event.readyToImplement === true), true);
  assert.equal(runBuildCalls, 0);
});

test("/builds/start injects Tavily research context for research intent without a URL", async () => {
  const { createBuildsStartRoute } = await import("./start.js");
  const {
    resetTavilyClientFactoryForTests,
    setTavilyClientFactoryForTests,
  } = await import("../../lib/webFetch.js");

  let capturedWebsiteContext: Record<string, unknown> | null = null;
  let deductedCredits: number | null = null;
  const org = {
    id: "org-1",
    owner_id: "user-1",
    name: "Test Org",
    plan: "pro",
    credits: 10,
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
    created_at: new Date().toISOString(),
  } satisfies OrgContext["org"];

  const route = createBuildsStartRoute({
    authMiddleware: async (_c, next) => {
      await next();
    },
    loadOrgContextMiddleware: async (c, next) => {
      c.set("orgContext", {
        db: {
          applyOrgUsageDeduction: async (_orgId: string, credits: number) => {
            deductedCredits = credits;
            return {
              deducted: credits,
              credits: 10 - credits,
              topup_credits: 0,
            };
          },
          createGeneration: async (input: Record<string, unknown>) => ({
            completed_at: input.completed_at as string | null,
            error: input.error as string | null,
            id: input.id as string,
            metadata: input.metadata as Record<string, unknown>,
            operation_id: input.operation_id as string,
            output_paths: input.output_paths as string[],
            preview_entry_path: input.preview_entry_path as string | null,
            project_id: input.project_id as string,
            prompt: input.prompt as string,
            session_events: (input.session_events as Record<string, unknown>[] | undefined) ?? [],
            started_at: input.started_at as string,
            status: input.status as string,
            summary: input.summary as string | null,
            template_id: input.template_id as string,
            warnings: (input.warnings as string[] | undefined) ?? [],
          }),
          getOrgWithBalance: async () => org,
          createProject: async (input: Record<string, unknown>) => ({
            id: input.id as string,
            name: input.name as string,
            org_id: input.org_id as string,
            status: input.status as string,
            template: input.template as string,
            icon: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            chat_history: [],
            chat_summary: null,
          }),
          updateProject: async (_projectId: string, patch: Record<string, unknown>) => ({
            id: "66666666-6666-6666-6666-666666666666",
            name: patch.name ?? "New Project",
            org_id: org.id,
            status: patch.status ?? "ready",
            template: patch.template ?? "interactive-tool",
            icon: "Wrench",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            chat_history: [],
            chat_summary: null,
          }),
        } as OrgContext["db"],
        jwt: { sub: "platform-user" },
        membership: { org_id: "org-1", role: "owner", user_id: "user-1", created_at: new Date().toISOString() },
        org,
        user: {
          id: "user-1",
          email: "omar@example.com",
          platform_user_id: "platform-user",
          created_at: new Date().toISOString(),
        },
      });
      await next();
    },
    classifyIntent: async () => ({
      intent: "research",
      confidence: 0.98,
      reason: "Clear research request.",
    }),
    generateConversationalAnswer: async (input) => {
      capturedWebsiteContext = (input.websiteContext as Record<string, unknown> | null) ?? null;
      return {
        message: "Here are the findings.",
        readyToImplement: false,
        implementPlan: null,
      };
    },
    runBuildInBackground: async () => {
      throw new Error("should not start build");
    },
  });

  setTavilyClientFactoryForTests(() => ({
    search: async () => ({
      query: "lovable pricing",
      responseTime: 0.2,
      images: [],
      results: [
        {
          title: "Lovable pricing",
          url: "https://lovable.dev/pricing",
          content: "Plans start free and scale with usage.",
          score: 0.9,
          publishedDate: "2026-04-01",
        },
      ],
      requestId: "req-1",
    }),
    searchContext: async () => "",
    searchQNA: async () => "",
    extract: async () => ({
      failedResults: [],
      requestId: "extract-1",
      responseTime: 0.1,
      results: [],
    }),
    crawl: async () => ({
      baseUrl: "https://example.com",
      requestId: "crawl-1",
      responseTime: 0.1,
      results: [],
    }),
    map: async () => ({
      baseUrl: "https://example.com",
      requestId: "map-1",
      responseTime: 0.1,
      results: [],
    }),
    research: async () => ({
      createdAt: new Date().toISOString(),
      input: "lovable pricing",
      model: "auto",
      requestId: "research-1",
      responseTime: 0.1,
      status: "completed",
    }),
    getResearch: async () => ({
      content: "",
      createdAt: new Date().toISOString(),
      requestId: "research-1",
      responseTime: 0.1,
      sources: [],
      status: "completed",
    }),
  }));

  try {
    const response = await route.request("http://localhost/", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        prompt: "research lovable pricing",
      }),
    });

    assert.equal(response.status, 202);
    assert.equal(capturedWebsiteContext?.sourceType, "search");
    assert.match(String(capturedWebsiteContext?.content ?? ""), /Lovable pricing/);
    assert.equal(deductedCredits, 2);
  } finally {
    resetTavilyClientFactoryForTests();
  }
});

test("/builds/start includes a reference_screenshot event when URL-backed plan summary capture succeeds", async () => {
  const { createBuildsStartRoute } = await import("./start.js");

  let runBuildCalls = 0;
  const org = {
    id: "org-1",
    owner_id: "user-1",
    name: "Test Org",
    plan: "pro",
    credits: 10,
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
    created_at: new Date().toISOString(),
  } satisfies OrgContext["org"];

  const route = createBuildsStartRoute({
    authMiddleware: async (_c, next) => {
      await next();
    },
    loadOrgContextMiddleware: async (c, next) => {
      c.set("orgContext", {
        db: {
          applyOrgUsageDeduction: async () => ({
            deducted: 1,
            credits: 9,
            topup_credits: 0,
          }),
          createGeneration: async (input: Record<string, unknown>) => ({
            completed_at: input.completed_at as string | null,
            error: input.error as string | null,
            id: input.id as string,
            metadata: input.metadata as Record<string, unknown>,
            operation_id: input.operation_id as string,
            output_paths: (input.output_paths as string[] | undefined) ?? [],
            preview_entry_path: input.preview_entry_path as string | null,
            project_id: input.project_id as string,
            prompt: input.prompt as string,
            session_events: (input.session_events as Record<string, unknown>[] | undefined) ?? [],
            started_at: input.started_at as string,
            status: input.status as string,
            summary: input.summary as string | null,
            template_id: input.template_id as string,
            warnings: (input.warnings as string[] | undefined) ?? [],
          }),
          createProject: async (input: Record<string, unknown>) => ({
            id: input.id as string,
            name: input.name as string,
            org_id: input.org_id as string,
            status: input.status as string,
            template: input.template as string,
            icon: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            chat_history: [],
            chat_summary: null,
          }),
          findLatestGenerationByProjectId: async () => null,
          findPlanSessionById: async () => null,
          findProjectById: async () => null,
          findProjectsByOrgId: async () => [],
          getOrgWithBalance: async () => org,
          updateProject: async (_projectId: string, patch: Record<string, unknown>) => ({
            id: "77777777-7777-7777-7777-777777777777",
            name: patch.name ?? "New Project",
            org_id: org.id,
            status: patch.status ?? "ready",
            template: patch.template ?? "interactive-tool",
            icon: "Wrench",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            chat_history: [],
            chat_summary: null,
          }),
        } as OrgContext["db"],
        jwt: { sub: "platform-user" },
        membership: { org_id: "org-1", role: "owner", user_id: "user-1", created_at: new Date().toISOString() },
        org,
        user: {
          id: "user-1",
          email: "omar@example.com",
          platform_user_id: "platform-user",
          created_at: new Date().toISOString(),
        },
      });
      await next();
    },
    classifyIntent: async () => ({
      intent: "build_new",
      confidence: 0.92,
      reason: "Clear new build request.",
    }),
    generatePlanSummary: async () => "Here's what I'll do:\n- Mirror the core flows\n- Keep it clean",
    loadUrlContext: async () => ({
      label: "Source URL: https://mybos.com",
      sourceType: "url",
      url: "https://mybos.com",
      content: "myBOS is a building operations platform for maintenance and property workflows.",
      fetchFailed: false,
    }),
    runBuildInBackground: async () => {
      runBuildCalls += 1;
    },
    screenshotUrl: async () => "ZmFrZS1zY3JlZW5zaG90",
  });

  const response = await route.request("http://localhost/", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      prompt: "build a website like mybos.com with maintenance workflows and vendor management dashboard",
    }),
  });

  assert.equal(response.status, 202);
  const payload = await response.json() as {
    trace: {
      events: Array<{ type: string; domain?: string; imageBase64?: string }>;
      lastEventId: string | null;
    };
  };

  const screenshotEvent = payload.trace.events.find((event) => event.type === "reference_screenshot");
  assert.equal(payload.trace.lastEventId, null);
  assert.ok(screenshotEvent);
  assert.equal(screenshotEvent?.domain, "mybos.com");
  assert.equal(screenshotEvent?.imageBase64, "ZmFrZS1zY3JlZW5zaG90");
  assert.equal(runBuildCalls, 0);
});

test("/builds/start passes fetched URL content into clarifying question generation", async () => {
  const { createBuildsStartRoute } = await import("./start.js");

  let capturedWebsiteContext: Record<string, unknown> | null = null;
  let runBuildCalls = 0;
  const org = {
    id: "org-1",
    owner_id: "user-1",
    name: "Test Org",
    plan: "pro",
    credits: 10,
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
    created_at: new Date().toISOString(),
  } satisfies OrgContext["org"];

  const route = createBuildsStartRoute({
    authMiddleware: async (_c, next) => {
      await next();
    },
    loadOrgContextMiddleware: async (c, next) => {
      c.set("orgContext", {
        db: {
          applyOrgUsageDeduction: async () => ({
            deducted: 1,
            credits: 9,
            topup_credits: 0,
          }),
          createGeneration: async (input: Record<string, unknown>) => ({
            completed_at: input.completed_at as string | null,
            error: input.error as string | null,
            id: input.id as string,
            metadata: input.metadata as Record<string, unknown>,
            operation_id: input.operation_id as string,
            output_paths: (input.output_paths as string[] | undefined) ?? [],
            preview_entry_path: input.preview_entry_path as string | null,
            project_id: input.project_id as string,
            prompt: input.prompt as string,
            session_events: (input.session_events as Record<string, unknown>[] | undefined) ?? [],
            started_at: input.started_at as string,
            status: input.status as string,
            summary: input.summary as string | null,
            template_id: input.template_id as string,
            warnings: (input.warnings as string[] | undefined) ?? [],
          }),
          createProject: async (input: Record<string, unknown>) => ({
            id: input.id as string,
            name: input.name as string,
            org_id: input.org_id as string,
            status: input.status as string,
            template: input.template as string,
            icon: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            chat_history: [],
            chat_summary: null,
          }),
          findLatestGenerationByProjectId: async () => null,
          findPlanSessionById: async () => null,
          findProjectById: async () => null,
          findProjectsByOrgId: async () => [],
          getOrgWithBalance: async () => org,
          updateProject: async (_projectId: string, patch: Record<string, unknown>) => ({
            id: "88888888-8888-8888-8888-888888888888",
            name: patch.name ?? "New Project",
            org_id: org.id,
            status: patch.status ?? "ready",
            template: patch.template ?? "interactive-tool",
            icon: "Wrench",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            chat_history: [],
            chat_summary: null,
          }),
        } as OrgContext["db"],
        jwt: { sub: "platform-user" },
        membership: { org_id: "org-1", role: "owner", user_id: "user-1", created_at: new Date().toISOString() },
        org,
        user: {
          id: "user-1",
          email: "omar@example.com",
          platform_user_id: "platform-user",
          created_at: new Date().toISOString(),
        },
      });
      await next();
    },
    classifyIntent: async () => ({
      intent: "build_new",
      confidence: 0.72,
      reason: "Needs one more scope decision.",
    }),
    generateClarifyingQuestion: async (input) => {
      capturedWebsiteContext = (input.websiteContext as Record<string, unknown> | null) ?? null;
      return "Keep the same visual style, or should I change it?";
    },
    loadUrlContext: async () => ({
      label: "Source URL: https://mybos.com",
      sourceType: "url",
      url: "https://mybos.com",
      content: "myBOS is a building operations platform for maintenance, property, and tenant workflows.",
      fetchFailed: false,
    }),
    runBuildInBackground: async () => {
      runBuildCalls += 1;
    },
  });

  const response = await route.request("http://localhost/", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      prompt: "build a website like mybos.com",
    }),
  });

  assert.equal(response.status, 202);
  const payload = await response.json() as {
    trace: { events: Array<{ type: string; message?: string }>; lastEventId: string | null };
  };

  assert.equal(payload.trace.lastEventId, null);
  assert.equal(payload.trace.events.some((event) => event.type === "clarifying_question"), true);
  assert.equal(capturedWebsiteContext?.sourceType, "url");
  assert.match(String(capturedWebsiteContext?.content ?? ""), /building operations platform/i);
  assert.equal(runBuildCalls, 0);
});

test("/builds/start caps confidence at 0.7 for URL-only prompts without feature preferences", async () => {
  const { createBuildsStartRoute } = await import("./start.js");

  let runBuildCalls = 0;
  let planSummaryCalls = 0;
  const org = {
    id: "org-1",
    owner_id: "user-1",
    name: "Test Org",
    plan: "pro",
    credits: 10,
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
    created_at: new Date().toISOString(),
  } satisfies OrgContext["org"];

  const route = createBuildsStartRoute({
    authMiddleware: async (_c, next) => {
      await next();
    },
    loadOrgContextMiddleware: async (c, next) => {
      c.set("orgContext", {
        db: {
          applyOrgUsageDeduction: async () => ({
            deducted: 1,
            credits: 9,
            topup_credits: 0,
          }),
          createGeneration: async (input: Record<string, unknown>) => ({
            completed_at: input.completed_at as string | null,
            error: input.error as string | null,
            id: input.id as string,
            metadata: input.metadata as Record<string, unknown>,
            operation_id: input.operation_id as string,
            output_paths: (input.output_paths as string[] | undefined) ?? [],
            preview_entry_path: input.preview_entry_path as string | null,
            project_id: input.project_id as string,
            prompt: input.prompt as string,
            session_events: (input.session_events as Record<string, unknown>[] | undefined) ?? [],
            started_at: input.started_at as string,
            status: input.status as string,
            summary: input.summary as string | null,
            template_id: input.template_id as string,
            warnings: (input.warnings as string[] | undefined) ?? [],
          }),
          createProject: async (input: Record<string, unknown>) => ({
            id: input.id as string,
            name: input.name as string,
            org_id: input.org_id as string,
            status: input.status as string,
            template: input.template as string,
            icon: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            chat_history: [],
            chat_summary: null,
          }),
          findLatestGenerationByProjectId: async () => null,
          findPlanSessionById: async () => null,
          findProjectById: async () => null,
          findProjectsByOrgId: async () => [],
          getOrgWithBalance: async () => org,
          updateProject: async (_projectId: string, patch: Record<string, unknown>) => ({
            id: "99999999-9999-9999-9999-999999999999",
            name: patch.name ?? "New Project",
            org_id: org.id,
            status: patch.status ?? "ready",
            template: patch.template ?? "interactive-tool",
            icon: "Wrench",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            chat_history: [],
            chat_summary: null,
          }),
        } as OrgContext["db"],
        jwt: { sub: "platform-user" },
        membership: { org_id: "org-1", role: "owner", user_id: "user-1", created_at: new Date().toISOString() },
        org,
        user: {
          id: "user-1",
          email: "omar@example.com",
          platform_user_id: "platform-user",
          created_at: new Date().toISOString(),
        },
      });
      await next();
    },
    classifyIntent: async () => ({
      intent: "build_new",
      confidence: 0.94,
      reason: "High confidence from URL context.",
    }),
    generateClarifyingQuestion: async () => "Which features should I prioritize first?",
    generatePlanSummary: async () => {
      planSummaryCalls += 1;
      return "Here's what I'll do:\n- Placeholder summary";
    },
    loadUrlContext: async () => ({
      label: "Source URL: https://mybos.com",
      sourceType: "url",
      url: "https://mybos.com",
      content: "myBOS is a building operations platform.",
      fetchFailed: false,
    }),
    runBuildInBackground: async () => {
      runBuildCalls += 1;
    },
  });

  const response = await route.request("http://localhost/", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      prompt: "build a website like mybos.com",
    }),
  });

  assert.equal(response.status, 202);
  const payload = await response.json() as {
    trace: { events: Array<{ type: string }>; lastEventId: string | null };
  };

  assert.equal(payload.trace.lastEventId, null);
  assert.equal(payload.trace.events.some((event) => event.type === "clarifying_question"), true);
  assert.equal(payload.trace.events.some((event) => event.type === "conversational_response"), false);
  assert.equal(planSummaryCalls, 0);
  assert.equal(runBuildCalls, 0);
});

test("/builds/start does not cap confidence when URL prompt includes explicit feature preferences", async () => {
  const { createBuildsStartRoute } = await import("./start.js");

  let runBuildCalls = 0;
  let planSummaryCalls = 0;
  const org = {
    id: "org-1",
    owner_id: "user-1",
    name: "Test Org",
    plan: "pro",
    credits: 10,
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
    created_at: new Date().toISOString(),
  } satisfies OrgContext["org"];

  const route = createBuildsStartRoute({
    authMiddleware: async (_c, next) => {
      await next();
    },
    loadOrgContextMiddleware: async (c, next) => {
      c.set("orgContext", {
        db: {
          applyOrgUsageDeduction: async () => ({
            deducted: 1,
            credits: 9,
            topup_credits: 0,
          }),
          createGeneration: async (input: Record<string, unknown>) => ({
            completed_at: input.completed_at as string | null,
            error: input.error as string | null,
            id: input.id as string,
            metadata: input.metadata as Record<string, unknown>,
            operation_id: input.operation_id as string,
            output_paths: (input.output_paths as string[] | undefined) ?? [],
            preview_entry_path: input.preview_entry_path as string | null,
            project_id: input.project_id as string,
            prompt: input.prompt as string,
            session_events: (input.session_events as Record<string, unknown>[] | undefined) ?? [],
            started_at: input.started_at as string,
            status: input.status as string,
            summary: input.summary as string | null,
            template_id: input.template_id as string,
            warnings: (input.warnings as string[] | undefined) ?? [],
          }),
          createProject: async (input: Record<string, unknown>) => ({
            id: input.id as string,
            name: input.name as string,
            org_id: input.org_id as string,
            status: input.status as string,
            template: input.template as string,
            icon: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            chat_history: [],
            chat_summary: null,
          }),
          findLatestGenerationByProjectId: async () => null,
          findPlanSessionById: async () => null,
          findProjectById: async () => null,
          findProjectsByOrgId: async () => [],
          getOrgWithBalance: async () => org,
          updateProject: async (_projectId: string, patch: Record<string, unknown>) => ({
            id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            name: patch.name ?? "New Project",
            org_id: org.id,
            status: patch.status ?? "ready",
            template: patch.template ?? "interactive-tool",
            icon: "Wrench",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            chat_history: [],
            chat_summary: null,
          }),
        } as OrgContext["db"],
        jwt: { sub: "platform-user" },
        membership: { org_id: "org-1", role: "owner", user_id: "user-1", created_at: new Date().toISOString() },
        org,
        user: {
          id: "user-1",
          email: "omar@example.com",
          platform_user_id: "platform-user",
          created_at: new Date().toISOString(),
        },
      });
      await next();
    },
    classifyIntent: async () => ({
      intent: "build_new",
      confidence: 0.94,
      reason: "High confidence from complete request.",
    }),
    generatePlanSummary: async () => {
      planSummaryCalls += 1;
      return "Here's what I'll do:\n- Build core operations flows";
    },
    screenshotUrl: async () => "ZmFrZS1zY3JlZW5zaG90",
    runBuildInBackground: async () => {
      runBuildCalls += 1;
    },
  });

  const response = await route.request("http://localhost/", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      prompt: "build a website like mybos.com with maintenance workflows and vendor management dashboard",
    }),
  });

  assert.equal(response.status, 202);
  const payload = await response.json() as {
    trace: { events: Array<{ type: string }>; lastEventId: string | null };
  };

  assert.equal(payload.trace.lastEventId, null);
  assert.equal(payload.trace.events.some((event) => event.type === "clarifying_question"), false);
  assert.equal(payload.trace.events.some((event) => event.type === "conversational_response"), true);
  assert.equal(planSummaryCalls, 1);
  assert.equal(runBuildCalls, 0);
});
