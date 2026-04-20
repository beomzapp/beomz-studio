import assert from "node:assert/strict";
import test from "node:test";

import type { StudioFile } from "@beomz-studio/contracts";

import {
  buildClarifyingQuestionSystemPrompt,
  buildStructuredChatSystemPrompt,
  parseStructuredChatResponse,
} from "./chatPrompts.js";

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
      url: "https://mybos.com",
      content: "myBOS is a building operations platform with maintenance workflows.",
      fetchFailed: false,
    },
  });

  assert.match(prompt, /Never say "I can't" or "I don't have the ability to"/);
  assert.match(prompt, /Return valid JSON only/);
  assert.match(prompt, /readyToImplement=true/);
  assert.match(prompt, /## Website context[\s\S]*myBOS is a building operations platform/i);
  assert.match(prompt, /existing app called "PettyCash"/i);
});

test("buildClarifyingQuestionSystemPrompt includes failed website guidance", () => {
  const prompt = buildClarifyingQuestionSystemPrompt({
    projectName: "PettyCash",
    existingFiles: files,
    chatSummary: null,
    chatHistory: [],
    websiteContext: {
      url: "https://mybos.com",
      content: null,
      fetchFailed: true,
    },
  });

  assert.match(prompt, /Ask exactly one targeted clarifying question/i);
  assert.match(prompt, /Jina fetch was unavailable or returned no usable content/i);
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
