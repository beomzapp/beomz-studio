import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import { apiConfig } from "../config.js";

export type Intent =
  | "greeting"
  | "question"
  | "build_new"
  | "iteration"
  | "research"
  | "image_ref"
  | "ambiguous";

export interface IntentClassification {
  confidence: number;
  intent: Intent;
  reason: string;
}

const CLASSIFIER_TIMEOUT_MS = 3_000;

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
});

function buildFallbackIntent(message: string, hasExistingFiles: boolean, hasImage: boolean): IntentClassification {
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
    return { intent: "research", confidence: 0.75, reason: "URL-like content fallback." };
  }

  if (/[?]$/.test(trimmed) || /^(what|how|why|does|do|can|could|would|is|are|should|where|when)\b/i.test(lower)) {
    return { intent: "question", confidence: 0.7, reason: "Question wording fallback." };
  }

  if (ambiguousPattern.test(lower)) {
    return { intent: "ambiguous", confidence: 0.65, reason: "Vague request fallback." };
  }

  if (hasExistingFiles) {
    return { intent: "iteration", confidence: 0.6, reason: "Existing app fallback." };
  }

  if (hasImage) {
    return { intent: "image_ref", confidence: 0.6, reason: "Image-attached fallback." };
  }

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

export async function classifyIntent(
  message: string,
  hasExistingFiles: boolean,
  hasImage: boolean,
): Promise<IntentClassification> {
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
        max_tokens: 120,
        system: "Classify the user's message into one intent. Reply with JSON only.",
        messages: [
          {
            role: "user",
            content: [
              "Classify this message into exactly one intent.",
              `Message: "${message}"`,
              `Has existing app: ${hasExistingFiles}`,
              `Has image: ${hasImage}`,
              "Intents:",
              "greeting: casual greeting or acknowledgement",
              "question: asking about the app or how to do something",
              "build_new: requesting to build a new app",
              "iteration: requesting changes to existing app",
              "research: asking to look up a website or research something",
              "image_ref: user is primarily sending an image as reference",
              "ambiguous: unclear intent",
              'Reply with JSON only: {"intent":"...","confidence":0.9,"reason":"..."}',
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

    return classifierResponseSchema.parse(JSON.parse(candidate));
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
