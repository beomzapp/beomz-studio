import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import type { OrgContext } from "../../types.js";

process.env.ANTHROPIC_API_KEY ??= "test-key";
process.env.STUDIO_SUPABASE_URL ??= "https://example.supabase.co";
process.env.STUDIO_SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

test("/builds/start defaults generation to claude-sonnet-4-6", async () => {
  const source = await readFile(new URL("./start.ts", import.meta.url), "utf8");

  assert.match(source, /export const DEFAULT_BUILD_MODEL = "claude-sonnet-4-6";/);
  assert.match(source, /const effectiveModel = parsedBody\.data\.model \?\? DEFAULT_BUILD_MODEL;/);
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
