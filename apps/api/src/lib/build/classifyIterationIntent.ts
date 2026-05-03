import Anthropic from "@anthropic-ai/sdk";

import { apiConfig } from "../../config.js";

const ITERATION_INTENT_MODEL = "claude-haiku-4-5-20251001";
const ITERATION_INTENT_MAX_TOKENS = 100;
const ITERATION_INTENT_TIMEOUT_MS = 3_000;

const ITERATION_INTENT_SYSTEM_PROMPT = [
  "You are a strict JSON classifier for website iteration requests.",
  "Classify whether the user's latest message is asking a question/explanation or requesting a real website change/build.",
  "Return STRICT JSON only with this exact shape:",
  "{\"kind\":\"question\"|\"build\",\"confidence\":0.0,\"reason\":\"short string\"}",
  "Rules:",
  "- kind=question for explanations, brainstorming, comparisons, guidance, feasibility questions, or requests to describe what already exists.",
  "- kind=build for direct change requests, redesigns, copy edits, style tweaks, feature additions, deletions, or implementation instructions.",
  "- If uncertain, prefer build.",
  "- confidence must be a number between 0 and 1.",
  "- reason must be short and concrete.",
  "- No markdown. No prose outside the JSON object.",
].join("\n");

export interface ClassifyIterationIntentInput {
  prompt: string;
  lastAssistantMessage?: string;
  projectName: string;
}

export interface IterationIntentClassification {
  kind: "question" | "build";
  confidence: number;
  reason: string;
}

export interface IterationIntentUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface IterationIntentClassificationWithUsage {
  result: IterationIntentClassification;
  usage: IterationIntentUsage;
}

function fallbackClassification(reason: string): IterationIntentClassification {
  return {
    kind: "build",
    confidence: 0,
    reason,
  };
}

function normaliseClassification(value: unknown): IterationIntentClassification {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Classifier payload was not an object.");
  }

  const record = value as Record<string, unknown>;
  const rawKind = typeof record.kind === "string" ? record.kind.trim().toLowerCase() : "";
  const rawConfidence = record.confidence;
  const rawReason = typeof record.reason === "string" ? record.reason.trim() : "";

  if (rawKind !== "question" && rawKind !== "build") {
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

function extractTextContent(response: Anthropic.Messages.Message): string {
  return response.content
    .filter((block): block is Anthropic.Messages.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

function buildUserPrompt(input: ClassifyIterationIntentInput): string {
  return [
    `Project name: ${input.projectName}`,
    `Last assistant message: ${input.lastAssistantMessage?.trim() || "(none)"}`,
    "User message:",
    input.prompt.trim(),
  ].join("\n");
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export async function classifyIterationIntentWithUsage(
  input: ClassifyIterationIntentInput,
): Promise<IterationIntentClassificationWithUsage> {
  if (!apiConfig.ANTHROPIC_API_KEY) {
    return {
      result: fallbackClassification("missing_api_key"),
      usage: { inputTokens: 0, outputTokens: 0 },
    };
  }

  const client = new Anthropic({ apiKey: apiConfig.ANTHROPIC_API_KEY });
  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, ITERATION_INTENT_TIMEOUT_MS);
  let timeoutRaceId: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutRaceId = setTimeout(() => reject(new Error("timeout")), ITERATION_INTENT_TIMEOUT_MS);
  });

  try {
    const response = await Promise.race([
      client.messages.create(
        {
          model: ITERATION_INTENT_MODEL,
          max_tokens: ITERATION_INTENT_MAX_TOKENS,
          temperature: 0,
          system: ITERATION_INTENT_SYSTEM_PROMPT,
          messages: [{ role: "user", content: buildUserPrompt(input) }],
        },
        { signal: controller.signal },
      ),
      timeoutPromise,
    ]);

    const usage = {
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
    };

    try {
      return {
        result: normaliseClassification(JSON.parse(extractTextContent(response))),
        usage,
      };
    } catch {
      return {
        result: fallbackClassification("parse_failure"),
        usage,
      };
    }
  } catch (error) {
    if (timedOut || (error instanceof Error && error.message === "timeout") || isAbortError(error)) {
      return {
        result: fallbackClassification("timeout"),
        usage: { inputTokens: 0, outputTokens: 0 },
      };
    }

    return {
      result: fallbackClassification("network_error"),
      usage: { inputTokens: 0, outputTokens: 0 },
    };
  } finally {
    clearTimeout(timeoutId);
    if (timeoutRaceId !== null) {
      clearTimeout(timeoutRaceId);
    }
  }
}

export async function classifyIterationIntent(
  input: ClassifyIterationIntentInput,
): Promise<IterationIntentClassification> {
  const { result } = await classifyIterationIntentWithUsage(input);
  return result;
}
