import {
  getInitialBuildPromptPolicy,
  type InitialBuildPromptPolicy,
} from "@beomz-studio/prompt-policies";
import { z } from "zod";

import { getAnthropicRuntimeConfig } from "../config.js";
import { buildGeneratedPageFilePath } from "../shared/paths.js";
import type {
  GenerateFilesActivityInput,
  GeneratedBuildDraft,
} from "../shared/types.js";

const generatedFileSchema = z.object({
  path: z.string().min(1),
  kind: z.enum([
    "route",
    "component",
    "layout",
    "style",
    "data",
    "content",
    "config",
    "asset-manifest",
  ]),
  language: z.string().min(1),
  content: z.string().min(1),
});

const generatedBuildResponseSchema = z.object({
  summary: z.string().min(1).max(400),
  warnings: z.array(z.string()).default([]),
  files: z.array(generatedFileSchema).min(1),
});

function buildSystemPrompt(policy: InitialBuildPromptPolicy): string {
  return [
    "You are the Beomz Studio initial build generator.",
    policy.systemPrompt,
    "Non-negotiable constraints:",
    ...policy.constraints.map((constraint) => `- ${constraint}`),
  ].join("\n");
}

function buildUserPrompt(input: GenerateFilesActivityInput): string {
  const requiredFiles = input.template.pages.map((page) => ({
    pageId: page.id,
    label: page.name,
    path: buildGeneratedPageFilePath(input.template.id, page.id),
    routePath: page.path,
    summary: page.summary,
  }));

  return [
    `Project name: ${input.project.name}`,
    `Prompt: ${input.plan.normalizedPrompt}`,
    `Intent summary: ${input.plan.intentSummary}`,
    `Template: ${input.template.name}`,
    `Template description: ${input.template.description}`,
    `Template prompt hints: ${input.template.promptHints.join(" | ")}`,
    `Required route files (generate exactly these page files, each as standalone TSX with a default export):`,
    JSON.stringify(requiredFiles, null, 2),
    "Return JSON with this exact shape:",
    JSON.stringify(
      {
        summary: "Short summary of what was generated",
        warnings: ["Optional warning"],
        files: [
          {
            path: requiredFiles[0]?.path ?? "apps/web/src/app/generated/template/page.tsx",
            kind: "route",
            language: "tsx",
            content: "export default function ExamplePage() { return <div />; }",
          },
        ],
      },
      null,
      2,
    ),
    "Do not return markdown fences, commentary, or any prose outside the JSON object.",
  ].join("\n\n");
}

function extractJsonPayload(text: string): string {
  const fencedMatch = text.match(/```json\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error("Anthropic response did not include a JSON object.");
  }

  return text.slice(firstBrace, lastBrace + 1);
}

async function callAnthropic(system: string, userMessage: string) {
  const config = getAnthropicRuntimeConfig();
  if (!config.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not configured.");
  }

  const response = await fetch(
    `${config.ANTHROPIC_BASE_URL.replace(/\/$/, "")}/v1/messages`,
    {
      method: "POST",
      headers: {
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
        "x-api-key": config.ANTHROPIC_API_KEY,
      },
      body: JSON.stringify({
        max_tokens: config.ANTHROPIC_MAX_TOKENS,
        model: config.ANTHROPIC_MODEL,
        system,
        messages: [
          {
            role: "user",
            content: userMessage,
          },
        ],
      }),
    },
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Anthropic returned ${response.status}: ${errorBody}`);
  }

  return response.json() as Promise<{
    content?: Array<{ type?: string; text?: string }>;
  }>;
}

export async function generateFiles(
  input: GenerateFilesActivityInput,
): Promise<GeneratedBuildDraft> {
  const config = getAnthropicRuntimeConfig();
  const policy = getInitialBuildPromptPolicy(input.template.id);
  const rawResponse = await callAnthropic(
    buildSystemPrompt(policy),
    buildUserPrompt(input),
  );

  const text = (rawResponse.content ?? [])
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text ?? "")
    .join("\n")
    .trim();

  if (!text) {
    throw new Error("Anthropic returned no text content.");
  }

  let parsed: z.infer<typeof generatedBuildResponseSchema>;
  try {
    parsed = generatedBuildResponseSchema.parse(
      JSON.parse(extractJsonPayload(text)),
    );
  } catch (error) {
    console.error("Failed to parse Anthropic generation response.", {
      error: error instanceof Error ? error.message : String(error),
      maxTokens: config.ANTHROPIC_MAX_TOKENS,
      model: config.ANTHROPIC_MODEL,
      rawResponseText: text,
    });
    throw error;
  }

  return {
    files: parsed.files.map((file) => ({
      ...file,
      content: file.content.trim(),
      locked: false,
      source: "ai",
    })),
    previewEntryPath: input.template.previewEntryPath,
    source: "ai",
    summary: parsed.summary,
    warnings: parsed.warnings,
  };
}
