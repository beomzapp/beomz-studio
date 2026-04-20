import { basename } from "node:path";

import type { StudioFile } from "@beomz-studio/contracts";

export interface ProjectChatHistoryEntry {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

interface BuildProjectMemoryPromptOptions {
  appName?: string | null;
  files: readonly StudioFile[];
}

const MAX_STORED_CHAT_MESSAGES = 50;
const MAX_CONTEXT_CHAT_MESSAGES = 25;
const MAX_FILE_COUNT_IN_PROMPT = 30;
const MAX_SNIPPET_LENGTH = 500;

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

function buildSnippet(content: string): string {
  const compact = content
    .replace(/\s+/g, " ")
    .replace(/`/g, "'")
    .trim();

  if (compact.length <= MAX_SNIPPET_LENGTH) {
    return compact;
  }

  return `${compact.slice(0, MAX_SNIPPET_LENGTH - 3).trimEnd()}...`;
}

function findFileContent(files: readonly StudioFile[], targetBaseName: string): string | null {
  const match = files.find((file) => basename(file.path) === targetBaseName);
  return match?.content?.trim() ? match.content : null;
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
  history: readonly ProjectChatHistoryEntry[],
  currentMessage: string,
): Array<{ role: "user" | "assistant"; content: string }> {
  const trimmedMessage = currentMessage.trim();
  if (!trimmedMessage) {
    return history.slice(-MAX_CONTEXT_CHAT_MESSAGES).map((entry) => ({
      role: entry.role,
      content: entry.content,
    }));
  }

  return [
    ...history.slice(-MAX_CONTEXT_CHAT_MESSAGES).map((entry) => ({
      role: entry.role,
      content: entry.content,
    })),
    { role: "user", content: trimmedMessage },
  ];
}

export function buildProjectMemoryPrompt({
  appName,
  files,
}: BuildProjectMemoryPromptOptions): string {
  const fileNames = uniqueFileNames(files);
  const fileList = fileNames.length > 0
    ? fileNames.slice(0, MAX_FILE_COUNT_IN_PROMPT).join(", ")
    : "No existing files found.";

  const featureHints = deriveFeatureHints(fileNames);
  const appSnippet = findFileContent(files, "App.tsx");
  const themeSnippet = findFileContent(files, "theme.ts");

  const lines = [
    `You are working on an existing app called "${appName?.trim() || "this app"}".`,
    `Current files: ${fileList}`,
    "The app already exists — NEVER ask setup questions like \"who will use this\", \"what industry\", \"what is the purpose\". The app is built.",
    "Behaviour rules:",
    "Greeting -> respond warmly, briefly describe what the app does",
    "Clear request -> just do it, no questions",
    "Ambiguous request -> ask exactly ONE targeted question, nothing more",
    "Never ask setup/onboarding questions when files already exist",
  ];

  if (featureHints.length > 0) {
    lines.push(`Likely existing features: ${featureHints.join(", ")}`);
  }

  if (appSnippet) {
    lines.push(`App.tsx excerpt: ${buildSnippet(appSnippet)}`);
  }

  if (themeSnippet) {
    lines.push(`theme.ts excerpt: ${buildSnippet(themeSnippet)}`);
  }

  return lines.join("\n");
}
