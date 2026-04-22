import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  NEXT_STEPS_FALLBACK,
  PREAMBLE_FALLBACK,
  generateNextSteps,
  generateStagePreamble,
} from "./buildNarration.js";

test("generateStagePreamble falls back when the Haiku call times out", async () => {
  const preamble = await generateStagePreamble({
    prompt: "Build a tip calculator",
    timeoutMs: 10,
    invokeModel: async () => await new Promise<string>(() => {}),
    isIteration: false,
  });

  assert.deepEqual(preamble, PREAMBLE_FALLBACK);
});

test("generateNextSteps falls back when the Haiku response is invalid JSON", async () => {
  const nextSteps = await generateNextSteps({
    appDescriptor: "A tip calculator with split-between support.",
    fileList: ["App.tsx", "theme.ts"],
    invokeModel: async () => "definitely not json",
    isIteration: false,
    prompt: "Build a tip calculator",
    timeoutMs: 50,
  });

  assert.deepEqual(nextSteps, NEXT_STEPS_FALLBACK);
});

test("iteration path returns a short preamble and skips next_steps", async () => {
  const preamble = await generateStagePreamble({
    prompt: "make the buttons red",
    timeoutMs: 50,
    invokeModel: async () => JSON.stringify({
      restatement: "Got it — updating the buttons now.",
      bullets: ["should be ignored"],
    }),
    isIteration: true,
  });

  const nextSteps = await generateNextSteps({
    appDescriptor: "A task manager app.",
    fileList: ["App.tsx"],
    invokeModel: async () => JSON.stringify({
      suggestions: [{ label: "Unused", prompt: "Unused" }],
    }),
    isIteration: true,
    prompt: "make the buttons red",
    timeoutMs: 50,
  });

  assert.equal(preamble.restatement, "On it...");
  assert.deepEqual(preamble.bullets, []);
  assert.equal(nextSteps, null);
});

test("image-confirmed preambles use the image-specific short copy", async () => {
  const preamble = await generateStagePreamble({
    imageConfirmed: true,
    prompt: "Yes, use it in the header and favicon",
    timeoutMs: 50,
    invokeModel: async () => JSON.stringify({
      restatement: "Should be ignored",
      bullets: ["should be ignored"],
    }),
    isIteration: false,
  });

  assert.deepEqual(preamble, {
    restatement: "Got it — applying your image...",
    bullets: [],
  });
});

test("stage preamble prompt enforces user-facing bullets and forbids technical detail", async () => {
  const source = await readFile(new URL("./buildNarration.ts", import.meta.url), "utf8");

  assert.match(source, /bullets: max 4 items naming user-facing features only/);
  assert.match(source, /No filenames, no component names, and no route\/file\/folder names\./);
  assert.match(source, /No technical implementation detail or file architecture breakdowns\./);
});
