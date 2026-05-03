import assert from "node:assert/strict";
import test from "node:test";

import Anthropic from "@anthropic-ai/sdk";

process.env.ANTHROPIC_API_KEY ??= "test-anthropic-key";
process.env.STUDIO_SUPABASE_URL ??= "https://example.supabase.co";
process.env.STUDIO_SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const messagesPrototype = Object.getPrototypeOf(new Anthropic({ apiKey: "test-anthropic-key" }).messages) as {
  create: (...args: unknown[]) => Promise<unknown>;
};
const originalCreate = messagesPrototype.create;

const { classifyIterationIntent } = await import("./classifyIterationIntent.js");

function mockCreate(
  impl: (...args: unknown[]) => Promise<unknown>,
): void {
  messagesPrototype.create = impl;
}

function restoreCreate(): void {
  messagesPrototype.create = originalCreate;
}

test("classifyIterationIntent returns question when Anthropic emits question JSON", async (t) => {
  mockCreate(async () => ({
    content: [
      {
        type: "text",
        text: JSON.stringify({
          kind: "question",
          confidence: 0.92,
          reason: "Asked for an explanation",
        }),
      },
    ],
    usage: { input_tokens: 31, output_tokens: 14 },
  }));
  t.after(restoreCreate);

  const result = await classifyIterationIntent({
    prompt: "explain how routing works",
    projectName: "Docs site",
  });

  assert.deepEqual(result, {
    kind: "question",
    confidence: 0.92,
    reason: "Asked for an explanation",
  });
});

test("classifyIterationIntent returns build when Anthropic emits build JSON", async (t) => {
  mockCreate(async () => ({
    content: [
      {
        type: "text",
        text: JSON.stringify({
          kind: "build",
          confidence: 0.88,
          reason: "Requested a concrete UI change",
        }),
      },
    ],
    usage: { input_tokens: 29, output_tokens: 12 },
  }));
  t.after(restoreCreate);

  const result = await classifyIterationIntent({
    prompt: "make the header sticky",
    projectName: "Marketing site",
  });

  assert.deepEqual(result, {
    kind: "build",
    confidence: 0.88,
    reason: "Requested a concrete UI change",
  });
});

test("classifyIterationIntent falls back to build/0 on parse failure", async (t) => {
  mockCreate(async () => ({
    content: [{ type: "text", text: "not-json" }],
    usage: { input_tokens: 25, output_tokens: 8 },
  }));
  t.after(restoreCreate);

  const result = await classifyIterationIntent({
    prompt: "what else can we add?",
    projectName: "Startup site",
  });

  assert.deepEqual(result, {
    kind: "build",
    confidence: 0,
    reason: "parse_failure",
  });
});

test("classifyIterationIntent falls back to build/0 on network error", async (t) => {
  mockCreate(async () => {
    throw new Error("socket hang up");
  });
  t.after(restoreCreate);

  const result = await classifyIterationIntent({
    prompt: "is there a way to simplify this flow?",
    projectName: "Ops dashboard",
  });

  assert.deepEqual(result, {
    kind: "build",
    confidence: 0,
    reason: "network_error",
  });
});

test("classifyIterationIntent falls back to build/0 on timeout", async (t) => {
  mockCreate(async (...args: unknown[]) => {
    const options = args[1] as { signal?: AbortSignal } | undefined;

    return await new Promise((_resolve, reject) => {
      const onAbort = () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      };

      if (options?.signal?.aborted) {
        onAbort();
        return;
      }

      options?.signal?.addEventListener("abort", onAbort, { once: true });
    });
  });
  t.after(restoreCreate);

  const result = await classifyIterationIntent({
    prompt: "how do I change the layout?",
    projectName: "Agency site",
  });

  assert.deepEqual(result, {
    kind: "build",
    confidence: 0,
    reason: "timeout",
  });
});
