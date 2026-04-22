import Anthropic from "@anthropic-ai/sdk";
import type { BuilderImageIntent } from "@beomz-studio/contracts";

import { apiConfig } from "../config.js";
import { resolveAnthropicImageBlock } from "./anthropicImages.js";

const SONNET_MODEL = "claude-sonnet-4-6";
const DEFAULT_TIMEOUT_MS = 5_000;

const CLASSIFICATION_SYSTEM_PROMPT = `Analyse this image carefully and describe what you see in detail.

If it's a UI/app screenshot: describe layout, colour scheme, components, navigation structure, and overall design style.
If it's a design reference or mockup: describe visual style, colours, typography, spacing, and design patterns.
If it's a logo or brand asset: describe colours, style, and visual identity.
If it's something else: describe it clearly.

Then classify the user's most likely intent from these internal values:
- theme: use for color_theme, brand palette, style guide, or visual theme changes
- reference: use for layout_reference, screenshot_reference, UI inspiration, or design mockups
- logo: use for logo_change or brand asset requests
- error: use only when the screenshot clearly shows a crash, error overlay, or broken preview
- general: anything else

Provide a specific actionable description the user can act on.

Output JSON only:
{ intent, confidence, description }

confidence: 0.0-1.0
description: 1-2 sentences, specific and actionable

If the user also provided text, weight it heavily — text like
'fix this', 'match this style', 'use this as my logo' overrides
visual classification.`;

const FALLBACK_DESCRIPTION = "I can see an image";
const VALID_INTENTS = new Set<BuilderImageIntent>(["logo", "reference", "error", "theme", "general"]);

export interface ClassifyImageIntentInput {
  imageUrl: string;
  userText: string;
}

export interface ImageIntentClassification {
  intent: BuilderImageIntent;
  confidence: number;
  description: string;
}

interface VisionRequest {
  imageUrl: string;
  maxTokens: number;
  systemPrompt: string;
  timeoutMs: number;
  userText: string;
}

export type ImageIntentInvoker = (request: VisionRequest) => Promise<string>;

interface ClassifyImageIntentOptions {
  invokeModel?: ImageIntentInvoker;
  timeoutMs?: number;
}

function parseJsonText(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("Empty model response.");
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedMatch?.[1]?.trim() ?? trimmed;
  return JSON.parse(candidate);
}

function clampConfidence(value: unknown): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}

function fallbackClassification(intent: BuilderImageIntent = "general", confidence = 0): ImageIntentClassification {
  return {
    intent,
    confidence,
    description: FALLBACK_DESCRIPTION,
  };
}

function detectTextIntentOverride(userText: string): BuilderImageIntent | null {
  const text = userText.trim().toLowerCase();
  if (!text) return null;

  if (
    /\b(use|make|set|treat)\b[\s\S]{0,30}\blogo\b/.test(text)
    || /\blogo\b[\s\S]{0,20}\b(use|add|apply)\b/.test(text)
  ) {
    return "logo";
  }

  if (
    /\bfix this\b/.test(text)
    || /\berror\b/.test(text)
    || /\bbroken\b/.test(text)
    || /\bcrash(?:ed)?\b/.test(text)
    || /\bnot working\b/.test(text)
  ) {
    return "error";
  }

  if (
    /\bmatch this style\b/.test(text)
    || /\bmatch this design\b/.test(text)
    || /\bmatch this layout\b/.test(text)
    || /\breference\b/.test(text)
    || /\bcopy this\b/.test(text)
  ) {
    return "reference";
  }

  if (
    /\btheme\b/.test(text)
    || /\bbrand guide(?:lines)?\b/.test(text)
    || /\bstyle guide\b/.test(text)
    || /\bmoodboard\b/.test(text)
    || /\bpalette\b/.test(text)
    || /\bfonts?\b/.test(text)
  ) {
    return "theme";
  }

  return null;
}

function normaliseClassification(raw: unknown, textOverride: BuilderImageIntent | null): ImageIntentClassification {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("Image intent payload was not an object.");
  }

  const record = raw as Record<string, unknown>;
  const rawIntent = typeof record.intent === "string" ? record.intent.trim().toLowerCase() : "";
  const intentAliases: Record<string, BuilderImageIntent> = {
    color_theme: "theme",
    layout_reference: "reference",
    logo_change: "logo",
    screenshot_reference: "reference",
  };
  const mappedIntent = intentAliases[rawIntent] ?? rawIntent;
  const modelIntent = VALID_INTENTS.has(mappedIntent as BuilderImageIntent)
    ? (mappedIntent as BuilderImageIntent)
    : "general";
  const description = typeof record.description === "string" && record.description.trim().length > 0
    ? record.description.trim()
    : FALLBACK_DESCRIPTION;
  const confidence = clampConfidence(record.confidence);

  return {
    intent: textOverride ?? modelIntent,
    confidence: textOverride ? Math.max(0.95, confidence) : confidence,
    description,
  };
}

async function runWithTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  return await new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => reject(new Error("timeout")), timeoutMs);

    work.then(
      (value) => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
}

async function defaultInvokeModel(request: VisionRequest): Promise<string> {
  const client = new Anthropic({ apiKey: apiConfig.ANTHROPIC_API_KEY });
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), request.timeoutMs);
  const userText = request.userText.trim();
  const promptText = userText.length > 0
    ? `User text: ${userText}`
    : "User text: (none)";

  try {
    const imageBlock = await resolveAnthropicImageBlock(request.imageUrl);
    console.log("[image-intent] image base64 length:", imageBlock.source.data.length);

    const response = await client.messages.create(
      {
        model: SONNET_MODEL,
        max_tokens: request.maxTokens,
        temperature: 0,
        system: request.systemPrompt,
        messages: [
          {
            role: "user",
            content: [
              imageBlock,
              { type: "text", text: promptText },
            ],
          },
        ],
      },
      { signal: controller.signal },
    );

    return response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function classifyImageIntent(
  input: ClassifyImageIntentInput,
  options: ClassifyImageIntentOptions = {},
): Promise<ImageIntentClassification> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const textOverride = detectTextIntentOverride(input.userText);

  if (!apiConfig.ANTHROPIC_API_KEY) {
    return fallbackClassification(textOverride ?? "general", textOverride ? 1 : 0);
  }

  try {
    const rawText = await runWithTimeout(
      (options.invokeModel ?? defaultInvokeModel)({
        imageUrl: input.imageUrl,
        maxTokens: 180,
        systemPrompt: CLASSIFICATION_SYSTEM_PROMPT,
        timeoutMs,
        userText: input.userText,
      }),
      timeoutMs,
    );

    return normaliseClassification(parseJsonText(rawText), textOverride);
  } catch (error) {
    console.warn(
      "[classifyImageIntent] failed — using fallback:",
      error instanceof Error ? error.message : String(error),
    );
    return fallbackClassification(textOverride ?? "general", textOverride ? 1 : 0);
  }
}
