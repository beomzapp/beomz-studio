import type Anthropic from "@anthropic-ai/sdk";

import { anthropic } from "../routes/plan/shared.js";

const CLASSIFY_TURN_MODEL = "claude-haiku-4-5-20251001";
const CLASSIFY_TURN_MAX_TOKENS = 120;
const CLASSIFY_TURN_TIMEOUT_MS = 3_000;

const CLASSIFY_TURN_SYSTEM_PROMPT = [
  "You classify user messages in an app-building assistant. Reply with JSON only, no other text.",
  "{\"kind\":\"question\"|\"iteration\"|\"redesign\"|\"initial_build\",\"confidence\":0.0-1.0,\"reason\":\"...\"}",
  "",
  "Rules:",
  "- \"question\": user asks for info, clarification, or explanation. No build needed.",
  "- \"initial_build\": no existing files (hasExistingFiles=false), or user explicitly requests a brand new app.",
  "- \"redesign\": existing app + user wants major visual overhaul (\"redesign\", \"new look\", \"completely different style\").",
  "- \"iteration\": existing app + user requests a specific change, addition, or fix.",
  "- confidence: 0.0-1.0 how certain you are.",
  "- reason: <=10 words.",
].join("\n");

export interface ClassifyTurnResult {
  kind: "question" | "iteration" | "redesign" | "initial_build";
  confidence: number;
  reason: string;
}

interface ClassifyTurnInput {
  prompt: string;
  hasExistingFiles: boolean;
  fileCount: number;
}

function fallbackClassification(hasExistingFiles: boolean): ClassifyTurnResult {
  if (!hasExistingFiles) {
    return {
      kind: "initial_build",
      confidence: 0.5,
      reason: "fallback: no existing files",
    };
  }

  return {
    kind: "iteration",
    confidence: 0.5,
    reason: "fallback: parse error",
  };
}

function extractTextContent(response: Anthropic.Messages.Message): string {
  return response.content
    .filter((block): block is Anthropic.Messages.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

function normaliseClassification(value: unknown): ClassifyTurnResult {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Classifier payload was not an object.");
  }

  const record = value as Record<string, unknown>;
  const rawKind = typeof record.kind === "string" ? record.kind.trim().toLowerCase() : "";
  const rawConfidence = record.confidence;
  const rawReason = typeof record.reason === "string" ? record.reason.trim() : "";

  if (
    rawKind !== "question"
    && rawKind !== "iteration"
    && rawKind !== "redesign"
    && rawKind !== "initial_build"
  ) {
    throw new Error("Classifier payload kind was invalid.");
  }

  if (typeof rawConfidence !== "number" || Number.isNaN(rawConfidence)) {
    throw new Error("Classifier payload confidence was invalid.");
  }

  if (rawReason.length === 0) {
    throw new Error("Classifier payload reason was empty.");
  }

  return {
    kind: rawKind,
    confidence: Math.max(0, Math.min(1, rawConfidence)),
    reason: rawReason,
  };
}

function buildUserMessage(input: ClassifyTurnInput): string {
  return [
    `hasExistingFiles=${input.hasExistingFiles}, fileCount=${input.fileCount}`,
    `Message: ${JSON.stringify(input.prompt)}`,
  ].join("\n");
}

export async function classifyTurn(input: ClassifyTurnInput): Promise<ClassifyTurnResult> {
  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, CLASSIFY_TURN_TIMEOUT_MS);

  try {
    const response = await anthropic.messages.create(
      {
        model: CLASSIFY_TURN_MODEL,
        max_tokens: CLASSIFY_TURN_MAX_TOKENS,
        temperature: 0,
        system: CLASSIFY_TURN_SYSTEM_PROMPT,
        messages: [{ role: "user", content: buildUserMessage(input) }],
      },
      { signal: controller.signal },
    );

    try {
      return normaliseClassification(JSON.parse(extractTextContent(response)));
    } catch {
      return fallbackClassification(input.hasExistingFiles);
    }
  } catch {
    if (timedOut) {
      return fallbackClassification(input.hasExistingFiles);
    }

    return fallbackClassification(input.hasExistingFiles);
  } finally {
    clearTimeout(timeoutId);
  }
}
