import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import type { StudioFile } from "@beomz-studio/contracts";
import type { GenerationRow, StudioDbClient } from "@beomz-studio/studio-db";

process.env.ANTHROPIC_API_KEY ??= "test-anthropic-key";
process.env.STUDIO_SUPABASE_URL ??= "https://example.supabase.co";
process.env.STUDIO_SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const { runBuildInBackground } = await import("./generate.js");

function createGenerationRow(buildId: string, projectId: string): GenerationRow {
  return {
    id: buildId,
    project_id: projectId,
    template_id: "interactive-tool",
    operation_id: "projectIteration",
    status: "queued",
    prompt: "Fix this",
    started_at: new Date().toISOString(),
    completed_at: null,
    output_paths: [],
    summary: null,
    error: null,
    preview_entry_path: "/",
    warnings: [],
    files: [],
    metadata: {
      builderTrace: {
        events: [
          {
            id: "1",
            type: "status",
            code: "build_queued",
            phase: "queued",
            message: "Build queued.",
            operation: "iteration",
            timestamp: new Date().toISOString(),
          },
        ],
        lastEventId: "1",
        previewReady: false,
        fallbackUsed: false,
        fallbackReason: null,
      },
    },
    session_events: [],
  };
}

test("image_intent SSE fires when imageUrl is present in the start payload", async () => {
  const buildId = randomUUID();
  const projectId = randomUUID();
  let row = createGenerationRow(buildId, projectId);

  const db = {
    findGenerationById: async (id: string) => (id === buildId ? row : null),
    updateGeneration: async (_id: string, patch: Partial<GenerationRow>) => {
      row = {
        ...row,
        ...patch,
        metadata: patch.metadata ? patch.metadata as GenerationRow["metadata"] : row.metadata,
        session_events: patch.session_events ? patch.session_events as GenerationRow["session_events"] : row.session_events,
      };
      return row;
    },
    findLatestCompletedGenerationForProject: async () => null,
  } as unknown as StudioDbClient;

  await runBuildInBackground(
    {
      buildId,
      projectId,
      orgId: "org-1",
      userId: "user-1",
      userEmail: "omar@example.com",
      prompt: "Fix this",
      sourcePrompt: "Fix this",
      imageUrl: "https://storage.example.com/signed/error.png",
      templateId: "interactive-tool",
      model: "claude-sonnet-4-6",
      requestedAt: new Date().toISOString(),
      operationId: "projectIteration",
      isIteration: true,
      existingFiles: [
        {
          path: "apps/web/src/app/generated/interactive-tool/App.tsx",
          kind: "route",
          language: "tsx",
          content: "export default function App(){ return null; }",
          source: "user",
          locked: false,
        } satisfies StudioFile,
      ],
      projectName: "Demo App",
    },
    db,
    {
      classifyImageIntent: async () => ({
        intent: "error",
        confidence: 0.98,
        description: "A browser error overlay is shown over the preview.",
      }),
    },
  );

  const events = ((row.metadata.builderTrace as { events?: Array<Record<string, unknown>> }).events ?? []);
  const imageIntentEvent = events.find((event) => event.type === "image_intent");
  const doneEvent = events.find((event) => event.type === "done");

  assert.ok(imageIntentEvent);
  assert.equal(imageIntentEvent?.intent, "error");
  assert.equal(imageIntentEvent?.description, "A browser error overlay is shown over the preview.");
  assert.equal(imageIntentEvent?.imageUrl, "https://storage.example.com/signed/error.png");
  assert.ok(doneEvent);
  assert.equal(row.status, "completed");
});
