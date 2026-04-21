import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import { apiConfig } from "../config.js";
import type { ProjectChatHistoryEntry } from "./projectChat.js";

export type Intent =
  | "greeting"
  | "question"
  | "build_new"
  | "iteration"
  | "research"
  | "image_ref"
  | "ambiguous";

// BEO-465: return type now carries confidence + accumulatedContext so the
// build pipeline can gate on completeness rather than intent label alone.
export interface IntentResult {
  intent: Intent;
  confidence: number;
  reason: string;
  accumulatedContext?: string;
}

// Backward-compat alias for callers that still import IntentClassification.
export type IntentClassification = IntentResult;

const CLASSIFIER_TIMEOUT_MS = 3_000;
const RECENT_HISTORY_TURNS = 5;

const exactGreetingPattern = /^(hi|hey|hello|thanks|ok|okay|sure|yes|no|yep|nope|cheers)$/i;
const ambiguousPattern = /^(help|help me|make it better|improve it|fix it|update it|change it|not sure|unsure|idk|i don't know)$/i;

const classifierResponseSchema = z.object({
  confidence: z.number().min(0).max(1),
  intent: z.enum([
    "greeting",
    "question",
    "build_new",
    "iteration",
    "research",
    "image_ref",
    "ambiguous",
  ]),
  reason: z.string().trim().min(1),
  accumulatedContext: z.string().trim().optional(),
});

function buildFallbackIntent(message: string, hasExistingFiles: boolean, hasImage: boolean): IntentResult {
  const trimmed = message.trim();
  const lower = trimmed.toLowerCase();

  if (trimmed.length <= 6) {
    return { intent: "greeting", confidence: 0.99, reason: "Short message fallback." };
  }

  if (exactGreetingPattern.test(trimmed)) {
    return { intent: "greeting", confidence: 0.99, reason: "Greeting or acknowledgement fallback." };
  }

  if (hasImage && trimmed.length === 0) {
    return { intent: "image_ref", confidence: 0.99, reason: "Image-only message fallback." };
  }

  if (/\bhttps?:\/\/|\b(?:[a-z0-9-]+\.)+[a-z]{2,}\b/i.test(trimmed)) {
    return { intent: "research", confidence: 0.9, reason: "URL-like content fallback." };
  }

  if (/[?]$/.test(trimmed) || /^(what|how|why|does|do|can|could|would|is|are|should|where|when)\b/i.test(lower)) {
    return { intent: "question", confidence: 0.9, reason: "Question wording fallback." };
  }

  if (ambiguousPattern.test(lower)) {
    return { intent: "ambiguous", confidence: 0.4, reason: "Vague request fallback." };
  }

  if (hasExistingFiles) {
    // BEO-465: iterations with specific directions proceed. Haiku normally
    // scores these — only fall back here when the API is unreachable.
    return { intent: "iteration", confidence: 0.9, reason: "Existing app fallback." };
  }

  if (hasImage) {
    return { intent: "image_ref", confidence: 0.9, reason: "Image-attached fallback." };
  }

  // BEO-465: when the fallback fires for a new build we don't know enough to
  // claim high confidence — force a clarifying question.
  return { intent: "build_new", confidence: 0.55, reason: "New project fallback." };
}

function extractJsonCandidate(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  return trimmed;
}

function formatRecentHistory(history: readonly ProjectChatHistoryEntry[] | undefined): string {
  if (!history || history.length === 0) {
    return "(no prior turns)";
  }

  return history
    .slice(-RECENT_HISTORY_TURNS)
    .map((entry) => `${entry.role}: ${entry.content}`)
    .join("\n");
}

export async function classifyIntent(
  message: string,
  hasExistingFiles: boolean,
  hasImage: boolean,
  recentHistory?: readonly ProjectChatHistoryEntry[],
): Promise<IntentResult> {
  const trimmed = message.trim();

  if (hasImage && trimmed.length === 0) {
    return {
      intent: "image_ref",
      confidence: 0.99,
      reason: "Hard-coded image-only rule.",
    };
  }

  if (trimmed.length <= 6) {
    return {
      intent: "greeting",
      confidence: 0.99,
      reason: "Hard-coded short-message greeting rule.",
    };
  }

  if (exactGreetingPattern.test(trimmed)) {
    return {
      intent: "greeting",
      confidence: 0.99,
      reason: "Hard-coded greeting acknowledgement rule.",
    };
  }

  const apiKey = apiConfig.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return buildFallbackIntent(message, hasExistingFiles, hasImage);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CLASSIFIER_TIMEOUT_MS);

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create(
      {
        model: "claude-haiku-4-5-20251001",
        max_tokens: 400,
        system: [
          "Classify the user's latest message into one intent and score confidence.",
          "Use the recent conversation to accumulate context — if the user has answered previous questions,",
          "combine those answers with the latest message before scoring.",
          "Reply with JSON only.",
        ].join(" "),
        messages: [
          {
            role: "user",
            content: [
              "Classify the LAST user message into exactly one intent.",
              "",
              "## Recent conversation (last 5 turns)",
              formatRecentHistory(recentHistory),
              "",
              `## Latest user message`,
              `"${message}"`,
              "",
              `Has existing app: ${hasExistingFiles}`,
              `Has image: ${hasImage}`,
              "",
              "## Intents",
              "greeting: casual greeting or acknowledgement",
              "question: asking about the app or how to do something",
              "build_new: requesting to build a new app",
              "iteration: requesting changes to existing app",
              "research: asking to look up a website or research something",
              "image_ref: user is primarily sending an image as reference",
              "ambiguous: unclear intent",
              "",
              "## Confidence scoring (0.0–1.0)",
              "Score how COMPLETE the build request is based on the accumulated",
              "conversation (recent turns + latest message), not just the latest line.",
              "- Greeting / single word → confidence irrelevant (hard-coded upstream).",
              "- Vague build intent (\"I want to build something\") → 0.3–0.4",
              "- Category known but no details (\"a portfolio website\") → 0.5–0.65",
              "- Category + features known (\"portfolio with blog and contact\") → 0.7–0.8",
              "- Full details known (\"dark minimal portfolio with projects, about, contact, blog\") → 0.9+",
              "Rubric components: app type clear (+0.3) · key features described (+0.3)",
              "· style/design direction clear (+0.2) · enough detail to build without guessing (+0.2).",
              "Questions, greetings, and research intents can safely return 0.9+ once the ask is clear.",
              "Iterations on an existing app: a specific direction (e.g. \"add a contact form\",",
              "\"make the header dark\") is 0.9+. Vague iterations (\"make it better\") stay below 0.7.",
              "",
              "## accumulatedContext",
              "When intent is build_new / iteration / image_ref, write a single-paragraph",
              "build brief that SUMMARISES everything learned across the conversation so far",
              "(app type + features + style + any other specifics). Be concrete. Example:",
              "\"Build a dark minimal portfolio website with: home page, projects gallery,",
              "about section, contact form with email, and a blog. Clean typography,",
              "monochrome color scheme with subtle accent color.\"",
              "Omit the field entirely for greetings / questions / research.",
              "",
              "## Reply format",
              'Reply with JSON only: {"intent":"...","confidence":0.7,"reason":"...","accumulatedContext":"..."}',
            ].join("\n"),
          },
        ],
      },
      { signal: controller.signal },
    );

    const rawText = response.content
      .filter((block): block is Anthropic.Messages.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();
    const candidate = extractJsonCandidate(rawText);
    if (!candidate) {
      return buildFallbackIntent(message, hasExistingFiles, hasImage);
    }

    const parsed = classifierResponseSchema.parse(JSON.parse(candidate));
    return {
      intent: parsed.intent,
      confidence: parsed.confidence,
      reason: parsed.reason,
      accumulatedContext: parsed.accumulatedContext && parsed.accumulatedContext.length > 0
        ? parsed.accumulatedContext
        : undefined,
    };
  } catch (error) {
    console.warn(
      "[intentClassifier] falling back:",
      error instanceof Error ? error.message : String(error),
    );
    return buildFallbackIntent(message, hasExistingFiles, hasImage);
  } finally {
    clearTimeout(timeoutId);
  }
}
