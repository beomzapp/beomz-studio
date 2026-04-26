import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after } from "node:test";
import test from "node:test";

import type { StudioFile } from "@beomz-studio/contracts";

process.env.ANTHROPIC_API_KEY ??= "test-key";
process.env.STUDIO_SUPABASE_URL ??= "https://example.supabase.co";
process.env.STUDIO_SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const originalFetch = globalThis.fetch;
globalThis.fetch = (async () => {
  throw new Error("Skip outbound Anthropic calls in unit tests.");
}) as typeof fetch;

after(() => {
  globalThis.fetch = originalFetch;
});

const {
  buildClarifyingQuestionSystemPrompt,
  buildStructuredChatSystemPrompt,
  generatePlanSummary,
  parseStructuredChatResponse,
} = await import("./chatPrompts.js");

const files: StudioFile[] = [
  {
    path: "apps/web/src/app/generated/pettycash/App.tsx",
    kind: "route",
    language: "tsx",
    content: "export default function App() { return <div>PettyCash dashboard</div>; }",
    source: "ai",
    locked: false,
  },
];

test("buildStructuredChatSystemPrompt includes the senior-colleague rules and JSON contract", () => {
  const prompt = buildStructuredChatSystemPrompt({
    projectName: "PettyCash",
    existingFiles: files,
    chatSummary: "Expense dashboard with approvals.",
    chatHistory: [],
    websiteContext: {
      label: "Source URL: https://mybos.com",
      sourceType: "url",
      url: "https://mybos.com",
      content: "myBOS is a building operations platform with maintenance workflows.",
      fetchFailed: false,
    },
  });

  assert.match(prompt, /Never say "I can't" or "I don't have the ability to"/);
  assert.match(prompt, /NEVER say phrases like "Building now"/);
  assert.match(prompt, /Return valid JSON only/);
  assert.match(prompt, /readyToImplement=true/);
  assert.match(prompt, /## Website context[\s\S]*myBOS is a building operations platform/i);
  assert.match(prompt, /existing app called "PettyCash"/i);
});

test("buildStructuredChatSystemPrompt includes the exact new-project greeting", () => {
  const prompt = buildStructuredChatSystemPrompt({
    projectName: null,
    existingFiles: [],
    chatSummary: null,
    chatHistory: [],
  });

  assert.match(prompt, /Hey! 👋 Ready to build something awesome\? What's the idea\?/);
});

test("buildClarifyingQuestionSystemPrompt includes failed website guidance", () => {
  const prompt = buildClarifyingQuestionSystemPrompt({
    projectName: "PettyCash",
    existingFiles: files,
    chatSummary: null,
    chatHistory: [],
    websiteContext: {
      label: "Source URL: https://mybos.com",
      sourceType: "url",
      url: "https://mybos.com",
      content: null,
      fetchFailed: true,
    },
  });

  assert.match(prompt, /Ask exactly ONE short, natural question/i);
  assert.match(prompt, /Jina fetch was unavailable or returned no usable content/i);
});

test("buildClarifyingQuestionSystemPrompt includes one-sentence directness rules", () => {
  const prompt = buildClarifyingQuestionSystemPrompt({
    projectName: "PettyCash",
    existingFiles: files,
    chatSummary: null,
    chatHistory: [],
  });

  assert.match(prompt, /Ask ONE question at a time\. Maximum one sentence\./);
  assert.match(prompt, /No preamble\. Never start with 'I can see\.\.\.', 'Based on\.\.\.', or any context explanation\. Ask the question directly\./);
  assert.match(prompt, /Never wrap your question in parentheses\./);
  assert.match(prompt, /Never explain what you already know before asking\./);
});

test("buildClarifyingQuestionSystemPrompt includes the strict URL-grounding rule when website content exists", () => {
  const prompt = buildClarifyingQuestionSystemPrompt({
    projectName: "PettyCash",
    existingFiles: files,
    chatSummary: null,
    chatHistory: [],
    websiteContext: {
      label: "Source URL: https://mybos.com",
      sourceType: "url",
      url: "https://mybos.com",
      content: "myBOS is a building operations platform for maintenance workflows and tenant communication.",
      fetchFailed: false,
    },
  });

  assert.match(prompt, /The website content has been fetched and provided to you as context\./);
  assert.match(prompt, /You MUST NOT ask about anything that can be clearly determined from this content/i);
  assert.match(prompt, /which specific features to include\/exclude, whether users need to sign up\/log in, and whether to keep or change the visual style\./i);
});

test("clarifying question generation uses Sonnet with a larger max token budget", async () => {
  const generateSource = await readFile(new URL("../routes/builds/generate.ts", import.meta.url), "utf8");

  assert.match(generateSource, /model: "claude-sonnet-4-6"/);
  assert.match(generateSource, /max_tokens: 500/);
});

test("parseStructuredChatResponse returns parsed JSON payload", () => {
  const result = parseStructuredChatResponse(JSON.stringify({
    message: "**Plan**\n\nI'll add dark mode.",
    readyToImplement: true,
    implementPlan: "Update `theme.ts` with dark tokens. Add a header toggle in `App.tsx`.",
  }));

  assert.deepEqual(result, {
    message: "**Plan**\n\nI'll add dark mode.",
    readyToImplement: true,
    implementPlan: "Update `theme.ts` with dark tokens. Add a header toggle in `App.tsx`.",
  });
});

test("parseStructuredChatResponse falls back to plain text when JSON is invalid", () => {
  const result = parseStructuredChatResponse("**Hello**\n\nPettyCash tracks expenses.");

  assert.equal(result.message, "**Hello**\n\nPettyCash tracks expenses.");
  assert.equal(result.readyToImplement, false);
  assert.equal(result.implementPlan, null);
});

test("generatePlanSummary falls back to the required plan format when Haiku is unavailable", async () => {
  const result = await generatePlanSummary(
    "Build a playful colorful pet store website with product listings, grooming services, and a kid-centric design.",
    "PetPals",
  );

  assert.match(result, /^Here's what I'll do:/);
  assert.match(result, /\*\*PetPals\*\*/);
  assert.match(result, /Just say the word and I'll start building — or type any changes first\./);
});

test("chat prompt source forbids 'building now' phrasing in conversational and plan responses", async () => {
  const chatPromptSource = await readFile(new URL("./chatPrompts.ts", import.meta.url), "utf8");

  assert.match(chatPromptSource, /NEVER say phrases like \\"Building now\\", \\"I'm building this\\", \\"Creating now\\", or \\"On it, building\\"/);
  assert.match(chatPromptSource, /Here's what I'll do:/);
  assert.doesNotMatch(chatPromptSource, /Here's what I'll build:/);
});

test("plan summary and build acknowledgement prompts forbid HTML/CSS/JavaScript copy", async () => {
  const chatPromptSource = await readFile(new URL("./chatPrompts.ts", import.meta.url), "utf8");
  const generateSource = await readFile(new URL("../routes/builds/generate.ts", import.meta.url), "utf8");

  assert.match(chatPromptSource, /Do not mention HTML, CSS, or JavaScript\./);
  assert.match(chatPromptSource, /Use at most 4 bullet points\./);
  assert.match(chatPromptSource, /Bullets must be user-facing features only/);
  assert.match(chatPromptSource, /No filenames, no component names/);
  assert.match(chatPromptSource, /No technical implementation details\./);
  assert.match(generateSource, /Do not mention HTML, CSS, or JavaScript\./);
  assert.match(generateSource, /React and TypeScript/);
});
