import { basename } from "node:path";

import Anthropic from "@anthropic-ai/sdk";
import type { StudioFile } from "@beomz-studio/contracts";

import { apiConfig } from "../config.js";
import type { ProjectChatHistoryEntry } from "./projectChat.js";

const SUMMARY_MODEL = "claude-haiku-4-5-20251001";
const SUMMARY_MAX_MESSAGES = 10;
const SUMMARY_MAX_FILES = 30;
const SUMMARY_TIMEOUT_MS = 6_000;

function formatFileList(files: readonly StudioFile[]): string {
  const fileNames = [...new Set(files.map((file) => basename(file.path)).filter(Boolean))];
  if (fileNames.length === 0) {
    return "No files built yet";
  }

  return fileNames.slice(0, SUMMARY_MAX_FILES).join(", ");
}

function formatRecentConversation(history: readonly ProjectChatHistoryEntry[]): string {
  const recent = history.slice(-SUMMARY_MAX_MESSAGES);
  if (recent.length === 0) {
    return "No conversation yet";
  }

  return recent
    .map((message) => `${message.role}: ${message.content}`)
    .join("\n");
}

function toTextResponse(response: Anthropic.Messages.Message): string {
  return response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

export async function generateProjectChatSummary(input: {
  appName?: string | null;
  existingSummary?: string | null;
  files: readonly StudioFile[];
  history: readonly ProjectChatHistoryEntry[];
}): Promise<string | null> {
  if (!apiConfig.ANTHROPIC_API_KEY) {
    return input.existingSummary?.trim() || null;
  }

  const prompt = [
    "Summarise this app project concisely in under 150 words:",
    `App name: ${input.appName?.trim() || "Untitled app"}`,
    `Files built: ${formatFileList(input.files)}`,
    `Recent conversation: ${formatRecentConversation(input.history)}`,
    "",
    "Include: what's been built, key design decisions, user preferences,",
    "last request made. Be factual and compact.",
  ].join("\n");

  const client = new Anthropic({ apiKey: apiConfig.ANTHROPIC_API_KEY });
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SUMMARY_TIMEOUT_MS);

  try {
    const response = await client.messages.create(
      {
        model: SUMMARY_MODEL,
        max_tokens: 220,
        temperature: 0,
        messages: [{ role: "user", content: prompt }],
      },
      { signal: controller.signal },
    );

    return toTextResponse(response) || input.existingSummary?.trim() || null;
  } catch (error) {
    console.warn(
      "[projectChatSummary] failed — keeping existing summary:",
      error instanceof Error ? error.message : String(error),
    );
    return input.existingSummary?.trim() || null;
  } finally {
    clearTimeout(timeoutId);
  }
}
