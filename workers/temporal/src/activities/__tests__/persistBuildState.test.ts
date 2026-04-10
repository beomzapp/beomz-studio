import assert from "node:assert/strict";
import test from "node:test";

import type {
  GenerationRow,
  GenerationUpdate,
  ProjectRow,
  ProjectUpdate,
} from "@beomz-studio/studio-db";

process.env.STUDIO_SUPABASE_URL ??= "https://example.supabase.co";
process.env.STUDIO_SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const { persistBuildStateWithClient } = await import("../persistBuildState.js");

function createGenerationRow(overrides: Partial<GenerationRow> = {}): GenerationRow {
  return {
    completed_at: null,
    error: null,
    files: [],
    id: "build-123",
    metadata: {},
    operation_id: "initial_build",
    output_paths: [],
    preview_entry_path: "src/main.tsx",
    project_id: "project-123",
    prompt: "Build a landing page",
    started_at: "2026-04-10T10:00:00.000Z",
    status: "queued",
    summary: "Queued build.",
    template_id: "marketing-website",
    warnings: [],
    ...overrides,
  };
}

function createProjectRow(id: string, overrides: Partial<ProjectRow> = {}): ProjectRow {
  return {
    created_at: "2026-04-10T10:00:00.000Z",
    id,
    name: "My Studio Project",
    org_id: "org-123",
    status: "queued",
    template: "marketing-website",
    updated_at: "2026-04-10T10:00:00.000Z",
    ...overrides,
  };
}

function mergeGenerationUpdate(
  base: GenerationRow,
  patch: GenerationUpdate,
): GenerationRow {
  return {
    ...base,
    ...patch,
    files: patch.files ?? base.files,
    metadata: patch.metadata ?? base.metadata,
    output_paths: patch.output_paths ?? base.output_paths,
    warnings: patch.warnings ?? base.warnings,
  };
}

test("uses the persisted generation project id when workflow input projectId is stale", async () => {
  const generationRow = createGenerationRow({ project_id: "project-from-generation" });
  const updatedProjectIds: string[] = [];
  const warnings: string[] = [];

  await persistBuildStateWithClient(
    {
      buildId: generationRow.id,
      generationPatch: {
        status: "running",
        summary: "Planning the build.",
      },
      projectId: "project-from-workflow",
      projectPatch: {
        name: "Renamed Project",
        status: "building",
      },
    },
    {
      db: {
        findGenerationById: async () => generationRow,
        updateGeneration: async (_id, patch) => mergeGenerationUpdate(generationRow, patch),
        updateProject: async (id) => {
          updatedProjectIds.push(id);
          return createProjectRow(id);
        },
      },
      logger: {
        warn: (message) => {
          warnings.push(message);
        },
      },
      wait: async () => undefined,
    },
  );

  assert.deepEqual(updatedProjectIds, ["project-from-generation"]);
  assert.ok(
    warnings.some((message) => message.includes("Using the generation row as the source of truth")),
  );
});

test("continues persisting generation state when the project row is missing", async () => {
  const generationRow = createGenerationRow();
  const warnings: string[] = [];
  let updatedGeneration: GenerationRow | null = null;

  await persistBuildStateWithClient(
    {
      buildId: generationRow.id,
      generationPatch: {
        status: "running",
        summary: "Planning the build.",
      },
      projectId: generationRow.project_id,
      projectPatch: {
        status: "building",
      },
    },
    {
      db: {
        findGenerationById: async () => generationRow,
        updateGeneration: async (_id, patch) => {
          updatedGeneration = mergeGenerationUpdate(generationRow, patch);
          return updatedGeneration;
        },
        updateProject: async () => null,
      },
      logger: {
        warn: (message) => {
          warnings.push(message);
        },
      },
      wait: async () => undefined,
    },
  );

  if (!updatedGeneration) {
    throw new Error("Expected generation state to be updated.");
  }

  const persistedGeneration = updatedGeneration as GenerationRow;
  assert.equal(persistedGeneration.status, "running");
  assert.ok(warnings.some((message) => message.includes("skipped project update")));
});

test("retries project updates without template when the PostgREST schema cache is stale", async () => {
  const generationRow = createGenerationRow();
  const attemptedPatches: ProjectUpdate[] = [];
  const waitCalls: number[] = [];
  let attemptCount = 0;

  await persistBuildStateWithClient(
    {
      buildId: generationRow.id,
      generationPatch: {
        status: "running",
        summary: "Selecting the template.",
      },
      projectId: generationRow.project_id,
      projectPatch: {
        status: "building",
        template: "saas-dashboard",
      },
    },
    {
      db: {
        findGenerationById: async () => generationRow,
        updateGeneration: async (_id, patch) => mergeGenerationUpdate(generationRow, patch),
        updateProject: async (id, patch) => {
          attemptedPatches.push(patch);
          attemptCount += 1;

          if (attemptCount <= 2) {
            throw new Error("Could not find the 'template' column of 'projects' in the schema cache");
          }

          return createProjectRow(id);
        },
      },
      logger: {
        warn: () => undefined,
      },
      wait: async (ms) => {
        waitCalls.push(ms);
      },
    },
  );

  assert.equal(waitCalls.length, 1);
  assert.equal(attemptedPatches.length, 3);
  assert.equal(attemptedPatches[0]?.template, "saas-dashboard");
  assert.equal(attemptedPatches[1]?.template, "saas-dashboard");
  assert.ok(!("template" in attemptedPatches[2]!));
  assert.equal(attemptedPatches[2]?.status, "building");
});
