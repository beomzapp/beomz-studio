import {
  getInitialBuildPromptPolicy,
  type InitialBuildPromptPolicy,
} from "@beomz-studio/prompt-policies";
import type { TemplatePage } from "@beomz-studio/contracts";
import { z } from "zod";

import { getAnthropicRuntimeConfig } from "../config.js";
import {
  buildGeneratedPageComponentName,
  buildGeneratedPageFilePath,
} from "../shared/paths.js";
import type {
  GenerateFilesActivityInput,
  GeneratedBuildDraft,
} from "../shared/types.js";

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
  const componentName = buildGeneratedPageComponentName(input.template.id, page.id);

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
        componentName,
        routePath: page.path,
        kind: page.kind,
        summary: page.summary,
        requiresAuth: page.requiresAuth,
      },
      null,
      2,
    ),
    "Output ONLY the complete TSX file contents for that one page.",
    `The file must default export a React component named ${componentName}.`,
    "Do not return JSON, markdown fences, explanations, or any prose outside the TSX file.",
  ].join("\n\n");
}

function extractCodePayload(text: string): string {
  const fencedMatch = text.match(/```(?:tsx|ts|jsx|js)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  return text.trim();
}

function isLikelyCodeStartLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length === 0) {
    return false;
  }

  return /^(?:import|export|const|let|var|function|async function|class|type|interface|enum)\b/.test(trimmed)
    || /^(?:["']use\s+\w+["'];?)$/.test(trimmed)
    || /^(?:\/\/|\/\*|\*\/|\*)/.test(trimmed)
    || /^(?:<[A-ZA-Za-z!/]|return\s*\(|return\s*<)/.test(trimmed);
}

function isLikelyCodeEndLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length === 0) {
    return false;
  }

  return /(?:[;{}])$/.test(trimmed)
    || /(?:\)|\])$/.test(trimmed)
    || /\/>$/.test(trimmed)
    || /^<\/?[A-ZA-z]/.test(trimmed)
    || /^export default\b/.test(trimmed);
}

function stripNonTsxEnvelope(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+$/, ""));

  let startIndex = 0;
  while (startIndex < lines.length && lines[startIndex]?.trim().length === 0) {
    startIndex += 1;
  }

  const firstCodeLineIndex = lines.findIndex(isLikelyCodeStartLine);
  if (firstCodeLineIndex !== -1) {
    startIndex = Math.max(startIndex, firstCodeLineIndex);
  }

  let endIndex = lines.length - 1;
  while (endIndex >= startIndex && lines[endIndex]?.trim().length === 0) {
    endIndex -= 1;
  }

  for (let index = endIndex; index >= startIndex; index -= 1) {
    if (isLikelyCodeEndLine(lines[index] ?? "")) {
      endIndex = index;
      break;
    }
  }

  return lines.slice(startIndex, endIndex + 1).join("\n").trim();
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

function parseGeneratedFileContent(input: {
  config: ReturnType<typeof getAnthropicRuntimeConfig>;
  page: TemplatePage;
  templateId: GenerateFilesActivityInput["template"]["id"];
  text: string;
}): string {
  const extractedContent = extractCodePayload(input.text);
  const content = stripNonTsxEnvelope(extractedContent);
  if (content.length > 0) {
    if (content !== extractedContent) {
      console.warn("Stripped non-TSX envelope from generated page content.", {
        pageId: input.page.id,
        templateId: input.templateId,
      });
    }
    return content;
  }

  console.error("Anthropic generation response was empty after code extraction.", {
    maxTokens: input.config.ANTHROPIC_MAX_TOKENS,
    model: input.config.ANTHROPIC_MODEL,
    pageId: input.page.id,
    rawResponseText: input.text,
    templateId: input.templateId,
  });
  throw new Error(`Anthropic returned empty code content for page ${input.page.id}.`);
}

export async function generateFiles(
  input: GenerateFilesActivityInput,
): Promise<GeneratedBuildDraft> {
  const config = getAnthropicRuntimeConfig();
  const policy = getInitialBuildPromptPolicy(input.template.id);
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

    const content = parseGeneratedFileContent({
      config,
      page,
      templateId: input.template.id,
      text,
    });

    files.push({
      path: buildGeneratedPageFilePath(input.template.id, page.id),
      kind: "route" as const,
      language: "tsx",
      content: content.trim(),
      locked: false,
      source: "ai" as const,
    });
  }

  return {
    files,
    previewEntryPath: input.template.previewEntryPath,
    source: "ai",
    summary: `Generated ${input.template.pages.length} route files for ${input.template.name}.`,
    warnings: [],
  };
}
