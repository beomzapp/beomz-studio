import assert from "node:assert/strict";
import test from "node:test";

import type { StudioFile } from "@beomz-studio/contracts";

import {
  appendProjectChatHistory,
  buildConversationMessages,
  buildProjectMemoryPrompt,
  readProjectChatHistory,
  shouldRefreshProjectChatSummary,
} from "./projectChat.js";

const files: StudioFile[] = [
  {
    path: "apps/web/src/app/generated/pettycash/App.tsx",
    kind: "route",
    language: "tsx",
    content: [
      "import ExpensesPage from './ExpensesPage';",
      "import TopUpsPage from './TopUpsPage';",
      "import { theme } from './theme';",
      "",
      "export default function App() {",
      "  return (",
      "    <div style={{ color: theme.accent }}>",
      "      <ExpensesPage />",
      "      <TopUpsPage />",
      "    </div>",
      "  );",
      "}",
    ].join("\n"),
    source: "ai",
    locked: false,
  },
  {
    path: "apps/web/src/app/generated/pettycash/ExpensesPage.tsx",
    kind: "route",
    language: "tsx",
    content: "export function ExpensesPage() { return <div>Expenses</div>; }",
    source: "ai",
    locked: false,
  },
  {
    path: "apps/web/src/app/generated/pettycash/TopUpsPage.tsx",
    kind: "route",
    language: "tsx",
    content: "export function TopUpsPage() { return <div>Top-ups</div>; }",
    source: "ai",
    locked: false,
  },
  {
    path: "apps/web/src/app/generated/pettycash/theme.ts",
    kind: "style",
    language: "ts",
    content: "export const theme = { accent: '#F97316' } as const;",
    source: "ai",
    locked: false,
  },
];

test("appendProjectChatHistory keeps only the last 50 messages", () => {
  const existing = Array.from({ length: 50 }, (_, index) => ({
    role: index % 2 === 0 ? "user" : "assistant",
    content: `message-${index + 1}`,
    timestamp: new Date(index * 1_000).toISOString(),
  }));

  const updated = appendProjectChatHistory(existing, "latest user", "latest assistant");

  assert.equal(updated.length, 50);
  assert.equal(updated[0]?.content, "message-3");
  assert.equal(updated.at(-2)?.content, "latest user");
  assert.equal(updated.at(-1)?.content, "latest assistant");
});

test("buildConversationMessages sends only the current turn because memory lives in the system prompt", () => {
  const history = readProjectChatHistory(
    Array.from({ length: 30 }, (_, index) => ({
      role: index % 2 === 0 ? "user" : "assistant",
      content: `message-${index + 1}`,
      timestamp: new Date(index * 1_000).toISOString(),
    })),
  );

  const messages = buildConversationMessages(history, "current prompt");

  assert.equal(messages.length, 1);
  assert.equal(messages[0]?.content, "current prompt");
  assert.equal(messages.at(-1)?.content, "current prompt");
});

test("buildProjectMemoryPrompt treats no files as greenfield even if DB has a placeholder name", () => {
  const prompt = buildProjectMemoryPrompt({
    appName: "Interactive Tool",
    chatSummary: null,
    files: [],
    history: [],
  });
  assert.match(prompt, /There is no saved project context yet/i);
  assert.doesNotMatch(prompt, /existing app called "Interactive Tool"/i);
  assert.match(prompt, /Hey! 👋 Ready to build something awesome\? What's the idea\?/);
});

test("buildProjectMemoryPrompt injects app name, files, summary, recent conversation, and behavior rules", () => {
  const prompt = buildProjectMemoryPrompt({
    appName: "PettyCash",
    chatSummary: "PettyCash is a dark dashboard for tracking expenses and top-ups.",
    files,
    history: readProjectChatHistory([
      { role: "user", content: "hi", timestamp: new Date(0).toISOString() },
      { role: "assistant", content: "Everything is set up.", timestamp: new Date(1_000).toISOString() },
    ]),
  });

  assert.match(prompt, /existing app called "PettyCash"/i);
  assert.match(prompt, /Current files: .*App\.tsx.*ExpensesPage\.tsx.*TopUpsPage\.tsx/i);
  assert.match(prompt, /## Project Memory[\s\S]*PettyCash is a dark dashboard/i);
  assert.match(prompt, /## Recent conversation[\s\S]*user: hi[\s\S]*assistant: Everything is set up\./i);
  assert.match(prompt, /Greeting -> warm, energetic Beomz voice\. Reference the app by its real name naturally/i);
  assert.match(prompt, /Likely existing features: Expenses, Top Ups/i);
  assert.match(prompt, /## App\.tsx first 10 lines[\s\S]*import ExpensesPage/);
  assert.match(prompt, /## theme\.ts contents[\s\S]*accent: '#F97316'/);
  assert.match(prompt, /Detected routes\/pages: Expenses, Top Ups/i);
});

test("shouldRefreshProjectChatSummary triggers every 10 messages", () => {
  assert.equal(shouldRefreshProjectChatSummary(9), false);
  assert.equal(shouldRefreshProjectChatSummary(10), true);
  assert.equal(shouldRefreshProjectChatSummary(20), true);
});
