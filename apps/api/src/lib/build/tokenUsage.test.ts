import assert from "node:assert/strict";
import test from "node:test";

const {
  buildPersistedAiUsage,
  persistGenerationAiUsage,
} = await import("./tokenUsage.js");

test("buildPersistedAiUsage normalizes counts and includes a total", () => {
  assert.deepEqual(buildPersistedAiUsage(123.8, -5), {
    input_tokens: 124,
    output_tokens: 0,
    total_tokens: 124,
  });
});

test("persistGenerationAiUsage merges ai_usage into generation metadata", async () => {
  const updates: Array<{ buildId: string; patch: Record<string, unknown> }> = [];
  const db = {
    findGenerationById: async () => ({
      id: "build-1",
      metadata: {
        builderTrace: { events: [] },
        migrations: ["create table foo"],
      },
    }),
    updateGeneration: async (buildId: string, patch: Record<string, unknown>) => {
      updates.push({ buildId, patch });
      return null;
    },
  };

  await persistGenerationAiUsage(
    db as never,
    "build-1",
    { input_tokens: 1200, output_tokens: 3400, total_tokens: 4600 },
  );

  assert.deepEqual(updates, [
    {
      buildId: "build-1",
      patch: {
        metadata: {
          ai_usage: {
            input_tokens: 1200,
            output_tokens: 3400,
            total_tokens: 4600,
          },
          builderTrace: { events: [] },
          migrations: ["create table foo"],
        },
      },
    },
  ]);
});
