import { basename } from "node:path";

import type { StudioFile } from "@beomz-studio/contracts";

export interface ProjectChatHistoryEntry {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

interface BuildProjectMemoryPromptOptions {
  appName?: string | null;
  chatSummary?: string | null;
  files: readonly StudioFile[];
  history?: readonly ProjectChatHistoryEntry[];
}

const MAX_STORED_CHAT_MESSAGES = 50;
const MAX_CONTEXT_CHAT_MESSAGES = 5;
const CHAT_SUMMARY_REFRESH_INTERVAL = 10;
const MAX_FILE_COUNT_IN_PROMPT = 30;
const MAX_THEME_CONTENT_LENGTH = 3_000;

const GENERIC_FILE_NAMES = new Set([
  "app",
  "index",
  "main",
  "theme",
  "styles",
  "utils",
  "types",
  "constants",
]);

const FEATURE_SUFFIXES = /\b(page|pages|screen|view|views|section|sections|card|cards|modal|modals|dialog|dialogs|panel|panels|layout|layouts|form|forms|widget|widgets|tab|tabs|table|tables|list|lists|item|items)\b/gi;

function normaliseContent(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isChatRole(value: unknown): value is ProjectChatHistoryEntry["role"] {
  return value === "user" || value === "assistant";
}

function toHistoryEntry(value: unknown): ProjectChatHistoryEntry | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const raw = value as Record<string, unknown>;
  const role = raw.role;
  const content = normaliseContent(raw.content);
  const timestamp = normaliseContent(raw.timestamp) ?? new Date(0).toISOString();

  if (!isChatRole(role) || !content) {
    return null;
  }

  return { role, content, timestamp };
}

function uniqueFileNames(files: readonly StudioFile[]): string[] {
  return [...new Set(files.map((file) => basename(file.path)).filter(Boolean))];
}

function prettifyFeatureLabel(raw: string): string {
  return raw
    .replace(/\.[^.]+$/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .replace(FEATURE_SUFFIXES, "")
    .replace(/\s+/g, " ")
    .trim();
}

function deriveFeatureHints(fileNames: readonly string[]): string[] {
  const hints: string[] = [];

  for (const fileName of fileNames) {
    const cleaned = prettifyFeatureLabel(fileName);
    if (!cleaned) {
      continue;
    }

    const lower = cleaned.toLowerCase();
    if (GENERIC_FILE_NAMES.has(lower)) {
      continue;
    }

    const label = cleaned
      .split(" ")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");

    if (!hints.includes(label)) {
      hints.push(label);
    }
  }

  return hints.slice(0, 8);
}

function findFileContent(files: readonly StudioFile[], targetBaseName: string): string | null {
  const match = files.find((file) => basename(file.path) === targetBaseName);
  return match?.content?.trim() ? match.content : null;
}

function buildLeadingLinesSnippet(content: string, lineCount: number): string {
  return content
    .split(/\r?\n/)
    .slice(0, lineCount)
    .join("\n")
    .trim();
}

function buildThemeContentSnippet(content: string): string {
  const trimmed = content.trim();
  if (trimmed.length <= MAX_THEME_CONTENT_LENGTH) {
    return trimmed;
  }

  return `${trimmed.slice(0, MAX_THEME_CONTENT_LENGTH).trimEnd()}\n// ...truncated`;
}

function deriveRouteHints(files: readonly StudioFile[]): string[] {
  const routeHints: string[] = [];

  for (const file of files) {
    const fileName = basename(file.path);
    const isRouteLikePath = /\/(routes|pages|screens|views)\//.test(file.path);
    const isRouteLikeFile = /(?:Page|Screen|View|Route)\.(?:t|j)sx?$/.test(fileName);

    if (!isRouteLikePath && !isRouteLikeFile) {
      continue;
    }

    const label = prettifyFeatureLabel(fileName);
    if (!label) {
      continue;
    }

    const formatted = label
      .split(" ")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");

    if (!routeHints.includes(formatted)) {
      routeHints.push(formatted);
    }
  }

  return routeHints.slice(0, 10);
}

function formatRecentConversation(history: readonly ProjectChatHistoryEntry[]): string {
  const recent = history.slice(-MAX_CONTEXT_CHAT_MESSAGES);
  if (recent.length === 0) {
    return "No recent conversation yet.";
  }

  return recent
    .map((entry) => `${entry.role}: ${entry.content}`)
    .join("\n");
}

export function readProjectChatHistory(value: unknown): ProjectChatHistoryEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => toHistoryEntry(entry))
    .filter((entry): entry is ProjectChatHistoryEntry => Boolean(entry))
    .slice(-MAX_STORED_CHAT_MESSAGES);
}

export function appendProjectChatHistory(
  existing: unknown,
  userContent: string,
  assistantContent: string,
): ProjectChatHistoryEntry[] {
  const trimmedUser = userContent.trim();
  const trimmedAssistant = assistantContent.trim();

  if (!trimmedUser || !trimmedAssistant) {
    return readProjectChatHistory(existing);
  }

  const timestamp = new Date().toISOString();
  const current = readProjectChatHistory(existing);

  return [
    ...current.slice(-(MAX_STORED_CHAT_MESSAGES - 2)),
    { role: "user", content: trimmedUser, timestamp },
    { role: "assistant", content: trimmedAssistant, timestamp },
  ];
}

export function buildConversationMessages(
  _history: readonly ProjectChatHistoryEntry[],
  currentMessage: string,
): Array<{ role: "user" | "assistant"; content: string }> {
  const trimmedMessage = currentMessage.trim();
  return trimmedMessage
    ? [{ role: "user", content: trimmedMessage }]
    : [];
}

export function shouldRefreshProjectChatSummary(messageCount: number): boolean {
  return messageCount > 0 && messageCount % CHAT_SUMMARY_REFRESH_INTERVAL === 0;
}

export function buildProjectMemoryPrompt({
  appName,
  chatSummary,
  files,
  history = [],
}: BuildProjectMemoryPromptOptions): string {
  const hasBuiltApp = files.length > 0;
  const trimmedName = appName?.trim() ?? "";
  const namedAppLabel = trimmedName.length > 0 ? trimmedName : "this app";
  const fileNames = uniqueFileNames(files);
  const fileList = fileNames.length > 0
    ? fileNames.slice(0, MAX_FILE_COUNT_IN_PROMPT).join(", ")
    : "No existing files found.";

  const featureHints = deriveFeatureHints(fileNames);
  const routeHints = deriveRouteHints(files);
  const appSnippet = findFileContent(files, "App.tsx");
  const themeSnippet = findFileContent(files, "theme.ts");

  const greetingRule = hasBuiltApp
    ? "Greeting -> warm, energetic Beomz voice. Reference the app by its real name naturally in 1-2 sentences (e.g. \"Hey! {name} is looking good — what are we working on?\"). Never sound robotic."
        .replace("{name}", namedAppLabel)
    : "Greeting -> reply with exactly \"Hey! 👋 Ready to build something awesome? What's the idea?\" Never name the project or use template placeholder names.";

  const lines = [
    hasBuiltApp
      ? `You are working on an existing app called "${namedAppLabel}".`
      : "There is no saved project context yet.",
    `Current files: ${fileList}`,
    hasBuiltApp
      ? "The app already exists — NEVER ask setup questions like \"who will use this\", \"what industry\", \"what is the purpose\". The app is built."
      : "If the app does not exist yet, gather only the minimum context needed to help.",
    "Behaviour rules:",
    greetingRule,
    "Clear request -> just do it, no questions",
    "Ambiguous request -> ask exactly ONE targeted question, nothing more",
    "Never ask setup/onboarding questions when files already exist",
    "",
    "## Project Memory",
    chatSummary?.trim() || "New project, no history yet.",
    "",
    "## Recent conversation",
    formatRecentConversation(history),
  ];

  if (featureHints.length > 0) {
    lines.push(`Likely existing features: ${featureHints.join(", ")}`);
  }

  if (appSnippet) {
    lines.push("## App.tsx first 10 lines");
    lines.push("```tsx");
    lines.push(buildLeadingLinesSnippet(appSnippet, 10));
    lines.push("```");
  }

  if (themeSnippet) {
    lines.push("## theme.ts contents");
    lines.push("```ts");
    lines.push(buildThemeContentSnippet(themeSnippet));
    lines.push("```");
  }

  if (routeHints.length > 0) {
    lines.push(`Detected routes/pages: ${routeHints.join(", ")}`);
  }

  return lines.join("\n");
}
