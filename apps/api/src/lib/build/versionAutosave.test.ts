import assert from "node:assert/strict";
import test from "node:test";

import { autoSaveProjectVersion } from "./versionAutosave.js";

test("autoSaveProjectVersion skips insert and records metadata when the project was deleted", async () => {
  const updates: Array<Record<string, unknown>> = [];
  let createVersionCalls = 0;

  await autoSaveProjectVersion({
    findGenerationById: async () => ({
      id: "build-1",
      metadata: { existing: true },
    }),
    findProjectById: async () => null,
    updateGeneration: async (_buildId: string, patch: Record<string, unknown>) => {
      updates.push(patch);
      return patch;
    },
  } as never, {
    buildId: "build-1",
    projectId: "project-1",
    label: "Initial build",
    files: { "App.tsx": "export function App() { return null; }" },
    createVersion: async () => {
      createVersionCalls += 1;
      throw new Error("should not be called");
    },
  });

  assert.equal(createVersionCalls, 0);
  assert.equal(updates.length, 1);
  assert.deepEqual((updates[0]?.metadata as Record<string, unknown>).versionAutoSave, {
    message: "Project was deleted before version autosave.",
    reason: "project_deleted",
    status: "failed",
    updatedAt: (updates[0]?.metadata as Record<string, unknown>).versionAutoSave?.updatedAt,
  });
});

test("autoSaveProjectVersion records metadata when version insert fails", async () => {
  const updates: Array<Record<string, unknown>> = [];

  await autoSaveProjectVersion({
    findGenerationById: async () => ({
      id: "build-2",
      metadata: {},
    }),
    findProjectById: async () => ({
      id: "project-2",
    }),
    updateGeneration: async (_buildId: string, patch: Record<string, unknown>) => {
      updates.push(patch);
      return patch;
    },
  } as never, {
    buildId: "build-2",
    projectId: "project-2",
    label: "Iteration",
    files: { "App.tsx": "export function App() { return null; }" },
    createVersion: async () => {
      throw new Error("insert failed");
    },
  });

  assert.equal(updates.length, 1);
  assert.deepEqual((updates[0]?.metadata as Record<string, unknown>).versionAutoSave, {
    message: "insert failed",
    reason: "insert_failed",
    status: "failed",
    updatedAt: (updates[0]?.metadata as Record<string, unknown>).versionAutoSave?.updatedAt,
  });
});
