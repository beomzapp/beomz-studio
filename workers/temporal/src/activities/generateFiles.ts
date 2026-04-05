import {
  getInitialBuildPromptPolicy,
  type InitialBuildPromptPolicy,
} from "@beomz-studio/prompt-policies";
import type { TemplatePage } from "@beomz-studio/contracts";
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

function buildSystemPrompt(policy: InitialBuildPromptPolicy): string {
  return [
    "You are the Beomz Studio initial build generator.",
    policy.systemPrompt,
    "Non-negotiable constraints:",
    ...policy.constraints.map((constraint) => `- ${constraint}`),
  ].join("\n");
}

function buildTemplatePageContext(input: GenerateFilesActivityInput): string {
  return JSON.stringify(input.template.pages.map((page) => ({
    pageId: page.id,
    label: page.name,
    path: buildGeneratedPageFilePath(input.template.id, page.id),
    routePath: page.path,
    summary: page.summary,
  })), null, 2);
}

function buildUserPrompt(
  input: GenerateFilesActivityInput,
  page: TemplatePage,
): string {
  const filePath = buildGeneratedPageFilePath(input.template.id, page.id);

  return [
    `Project name: ${input.project.name}`,
    `Prompt: ${input.plan.normalizedPrompt}`,
    `Intent summary: ${input.plan.intentSummary}`,
    `Template: ${input.template.name}`,
    `Template description: ${input.template.description}`,
    `Template prompt hints: ${input.template.promptHints.join(" | ")}`,
    "Full template page set for consistency across navigation and tone:",
    buildTemplatePageContext(input),
    "Generate exactly one standalone TSX page file for this page:",
    JSON.stringify(
      {
        pageId: page.id,
        name: page.name,
        filePath,
        routePath: page.path,
        kind: page.kind,
        summary: page.summary,
        requiresAuth: page.requiresAuth,
      },
      null,
      2,
    ),
    "Return JSON with this exact shape:",
    JSON.stringify(
      {
        path: filePath,
        kind: "route",
        language: "tsx",
        content: "export default function ExamplePage() { return <div />; }",
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

function extractTextContent(rawResponse: {
  content?: Array<{ type?: string; text?: string }>;
}): string {
  return (rawResponse.content ?? [])
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text ?? "")
    .join("\n")
    .trim();
}

function parseGeneratedFileResponse(input: {
  config: ReturnType<typeof getAnthropicRuntimeConfig>;
  page: TemplatePage;
  templateId: GenerateFilesActivityInput["template"]["id"];
  text: string;
}): z.infer<typeof generatedFileSchema> {
  try {
    return generatedFileSchema.parse(
      JSON.parse(extractJsonPayload(input.text)),
    );
  } catch (error) {
    console.error("Failed to parse Anthropic generation response.", {
      error: error instanceof Error ? error.message : String(error),
      maxTokens: input.config.ANTHROPIC_MAX_TOKENS,
      model: input.config.ANTHROPIC_MODEL,
      pageId: input.page.id,
      rawResponseText: input.text,
      templateId: input.templateId,
    });
    throw error;
  }
}

export async function generateFiles(
  input: GenerateFilesActivityInput,
): Promise<GeneratedBuildDraft> {
  const config = getAnthropicRuntimeConfig();
  const policy = getInitialBuildPromptPolicy(input.template.id);
  const warnings: string[] = [];
  const files = [];

  for (const page of input.template.pages) {
    const rawResponse = await callAnthropic(
      buildSystemPrompt(policy),
      buildUserPrompt(input, page),
    );
    const text = extractTextContent(rawResponse);

    if (!text) {
      throw new Error(`Anthropic returned no text content for page ${page.id}.`);
    }

    const parsed = parseGeneratedFileResponse({
      config,
      page,
      templateId: input.template.id,
      text,
    });
    const expectedPath = buildGeneratedPageFilePath(input.template.id, page.id);

    if (parsed.path !== expectedPath) {
      warnings.push(`Model returned unexpected path for ${page.id}; normalized to ${expectedPath}.`);
    }

    if (parsed.kind !== "route") {
      warnings.push(`Model returned kind ${parsed.kind} for ${page.id}; normalized to route.`);
    }

    if (parsed.language.toLowerCase() !== "tsx") {
      warnings.push(`Model returned language ${parsed.language} for ${page.id}; normalized to tsx.`);
    }

    files.push({
      ...parsed,
      path: expectedPath,
      kind: "route" as const,
      language: "tsx",
      content: parsed.content.trim(),
      locked: false,
      source: "ai" as const,
    });
  }

  return {
    files,
    previewEntryPath: input.template.previewEntryPath,
    source: "ai",
    summary: `Generated ${input.template.pages.length} route files for ${input.template.name}.`,
    warnings,
  };
}
