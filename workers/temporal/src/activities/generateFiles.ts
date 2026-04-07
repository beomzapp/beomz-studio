import {
  getInitialBuildPromptPolicy,
  getIterationPromptPolicy,
} from "@beomz-studio/prompt-policies";
import {
  createEmptyBuilderV3TraceMetadata,
  type BuilderV3TraceMetadata,
  type StudioFile,
  type TemplatePage,
} from "@beomz-studio/contracts";
import { createStudioDbClient } from "@beomz-studio/studio-db";

import { getAnthropicRuntimeConfig } from "../config.js";
import {
  buildGeneratedPageComponentName,
  buildGeneratedPageFilePath,
} from "../shared/paths.js";
import type {
  GenerateFilesActivityInput,
  GeneratedBuildDraft,
} from "../shared/types.js";

interface PromptPolicyLike {
  systemPrompt: string;
  constraints: readonly string[];
}

interface IterationResponseFile {
  path: string;
  content: string;
}

interface IterationResponsePayload {
  summary?: string;
  changedFiles: readonly IterationResponseFile[];
}

type AnthropicStreamEvent =
  | {
      type: "content_block_delta";
      delta?: {
        type?: string;
        text?: string;
      };
    }
  | {
      type: "error";
      error?: {
        message?: string;
        type?: string;
      };
    }
  | {
      type: string;
      [key: string]: unknown;
    };

function buildSystemPrompt(policy: PromptPolicyLike, mode: "initial" | "iteration"): string {
  return [
    mode === "iteration"
      ? "You are the Beomz Studio iteration generator."
      : "You are the Beomz Studio initial build generator.",
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

function buildIterationUserPrompt(input: GenerateFilesActivityInput): string {
  return [
    `Project name: ${input.project.name}`,
    `User request: ${input.plan.normalizedPrompt}`,
    `Intent summary: ${input.plan.intentSummary}`,
    `Template: ${input.template.name}`,
    `Template description: ${input.template.description}`,
    "Edit the current project instead of rebuilding it from scratch.",
    "Preserve every file that does not need to change.",
    "Current files (source of truth):",
    JSON.stringify(
      input.existingFiles.map((file) => ({
        content: file.content,
        kind: file.kind,
        language: file.language,
        locked: file.locked,
        path: file.path,
        source: file.source,
      })),
      null,
      2,
    ),
    "Return ONLY JSON with this exact shape:",
    JSON.stringify(
      {
        summary: "Short sentence describing the targeted edit.",
        changedFiles: [
          {
            path: "apps/web/src/app/generated/example/page.tsx",
            content: "Full updated file contents here",
          },
        ],
      },
      null,
      2,
    ),
    "Return only the files whose contents changed.",
    "Do not include markdown fences, explanations, comments, or unchanged files.",
  ].join("\n\n");
}

function extractCodePayload(text: string): string {
  const fencedMatch = text.match(/```(?:tsx|ts|jsx|js)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  return text.trim();
}

function extractJsonPayload(text: string): string {
  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const startIndex = text.indexOf("{");
  const endIndex = text.lastIndexOf("}");
  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    return text.trim();
  }

  return text.slice(startIndex, endIndex + 1).trim();
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readBuilderTraceMetadata(metadata: Record<string, unknown>): BuilderV3TraceMetadata {
  const candidate = metadata.builderTrace;
  if (!isRecord(candidate)) {
    return createEmptyBuilderV3TraceMetadata();
  }

  const events = Array.isArray(candidate.events) ? candidate.events : [];

  return {
    events,
    lastEventId:
      typeof candidate.lastEventId === "string" && candidate.lastEventId.length > 0
        ? candidate.lastEventId
        : null,
    previewReady: candidate.previewReady === true,
    fallbackReason:
      typeof candidate.fallbackReason === "string" ? candidate.fallbackReason : null,
    fallbackUsed: candidate.fallbackUsed === true,
  };
}

async function appendAssistantDeltaEvent(input: {
  buildId: string;
  delta: string;
  eventId: string;
}): Promise<void> {
  const db = createStudioDbClient();
  const currentGeneration = await db.findGenerationById(input.buildId);
  if (!currentGeneration) {
    throw new Error(`Build ${input.buildId} does not exist in the studio database.`);
  }

  const currentMetadata = isRecord(currentGeneration.metadata) ? currentGeneration.metadata : {};
  const currentTrace = readBuilderTraceMetadata(currentMetadata);
  const event = {
    delta: input.delta,
    id: input.eventId,
    operation: "initial_build" as const,
    timestamp: new Date().toISOString(),
    type: "assistant_delta" as const,
  };

  await db.updateGeneration(input.buildId, {
    metadata: {
      ...currentMetadata,
      builderTrace: {
        events: [...currentTrace.events, event],
        lastEventId: event.id,
        previewReady: currentTrace.previewReady,
        fallbackReason: currentTrace.fallbackReason,
        fallbackUsed: currentTrace.fallbackUsed,
      } satisfies BuilderV3TraceMetadata,
    },
  });
}

async function persistAssistantResponseMetadata(input: {
  buildId: string;
  assistantResponseText: string;
  assistantResponsesByPage: readonly {
    pageId: string;
    text: string;
  }[];
}): Promise<void> {
  const db = createStudioDbClient();
  const currentGeneration = await db.findGenerationById(input.buildId);
  if (!currentGeneration) {
    throw new Error(`Build ${input.buildId} does not exist in the studio database.`);
  }

  const currentMetadata = isRecord(currentGeneration.metadata) ? currentGeneration.metadata : {};
  await db.updateGeneration(input.buildId, {
    metadata: {
      ...currentMetadata,
      assistantResponseText: input.assistantResponseText,
      assistantResponsesByPage: input.assistantResponsesByPage,
    },
  });
}

async function streamAnthropicMessage(input: {
  system: string;
  userMessage: string;
  onTextDelta?: (delta: string) => Promise<void>;
}): Promise<string> {
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
        stream: true,
        system: input.system,
        messages: [
          {
            role: "user",
            content: input.userMessage,
          },
        ],
      }),
    },
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Anthropic returned ${response.status}: ${errorBody}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Anthropic streaming response body was unavailable.");
  }

  const decoder = new TextDecoder();
  const textParts: string[] = [];
  const dataLines: string[] = [];
  let buffer = "";

  const flushEvent = async () => {
    if (dataLines.length === 0) {
      return;
    }

    const payload = dataLines.join("\n");
    dataLines.length = 0;

    if (payload === "[DONE]") {
      return;
    }

    const event = JSON.parse(payload) as AnthropicStreamEvent;
    if (event.type === "error") {
      const errorMessage =
        isRecord(event.error) && typeof event.error.message === "string"
          ? event.error.message
          : "Anthropic streaming request failed.";
      throw new Error(errorMessage);
    }

    const delta =
      "delta" in event && isRecord(event.delta)
        ? event.delta
        : null;
    const deltaText = typeof delta?.text === "string" ? delta.text : null;
    if (
      event.type === "content_block_delta"
      && delta?.type === "text_delta"
      && deltaText
    ) {
      textParts.push(deltaText);
      await input.onTextDelta?.(deltaText);
    }
  };

  const consumeBuffer = async (flushRemainder: boolean) => {
    while (true) {
      const lineBreakIndex = buffer.indexOf("\n");
      if (lineBreakIndex === -1) {
        break;
      }

      const rawLine = buffer.slice(0, lineBreakIndex);
      buffer = buffer.slice(lineBreakIndex + 1);
      const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;

      if (line.length === 0) {
        await flushEvent();
        continue;
      }

      if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trim());
      }
    }

    if (!flushRemainder || buffer.length === 0) {
      return;
    }

    const line = buffer.endsWith("\r") ? buffer.slice(0, -1) : buffer;
    buffer = "";

    if (line.length === 0) {
      await flushEvent();
      return;
    }

    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trim());
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    await consumeBuffer(done);

    if (done) {
      await flushEvent();
      break;
    }
  }

  return textParts.join("");
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

function parseIterationResponse(text: string): IterationResponsePayload {
  const rawPayload = extractJsonPayload(text);
  const parsed = JSON.parse(rawPayload) as unknown;

  if (!isRecord(parsed)) {
    throw new Error("Iteration response was not a JSON object.");
  }

  const changedFiles = Array.isArray(parsed.changedFiles) ? parsed.changedFiles : null;
  if (!changedFiles) {
    throw new Error("Iteration response did not include a changedFiles array.");
  }

  const normalizedChangedFiles = changedFiles.map((file, index) => {
    if (!isRecord(file) || typeof file.path !== "string" || typeof file.content !== "string") {
      throw new Error(`Iteration response changedFiles[${index}] was invalid.`);
    }

    return {
      content: file.content,
      path: file.path,
    };
  });

  return {
    changedFiles: normalizedChangedFiles,
    summary: typeof parsed.summary === "string" ? parsed.summary : undefined,
  };
}

function mergeChangedFiles(input: {
  changedFiles: readonly IterationResponseFile[];
  existingFiles: readonly StudioFile[];
}): readonly StudioFile[] {
  const existingFilesByPath = new Map(
    input.existingFiles.map((file) => [file.path, file] as const),
  );

  for (const changedFile of input.changedFiles) {
    if (!existingFilesByPath.has(changedFile.path)) {
      throw new Error(
        `Iteration attempted to modify a file outside the current project: ${changedFile.path}`,
      );
    }
  }

  return input.existingFiles.map((file) => {
    const replacement = input.changedFiles.find((changedFile) => changedFile.path === file.path);
    if (!replacement) {
      return file;
    }

    return {
      ...file,
      content: replacement.content.trim(),
      source: "ai",
    };
  });
}

export async function generateFiles(
  input: GenerateFilesActivityInput,
): Promise<GeneratedBuildDraft> {
  const config = getAnthropicRuntimeConfig();
  const isIteration = input.existingFiles.length > 0;
  const policy = isIteration
    ? getIterationPromptPolicy(input.template.id)
    : getInitialBuildPromptPolicy(input.template.id);
  const files = [];
  const assistantResponseParts: string[] = [];
  const assistantResponsesByPage: Array<{ pageId: string; text: string }> = [];
  let streamSequence = 0;

  if (isIteration) {
    const text = await streamAnthropicMessage({
      system: buildSystemPrompt(policy, "iteration"),
      userMessage: buildIterationUserPrompt(input),
      onTextDelta: async (delta) => {
        assistantResponseParts.push(delta);
        streamSequence += 1;
        await appendAssistantDeltaEvent({
          buildId: input.buildId,
          delta,
          eventId: `assistant-iteration-${streamSequence}`,
        });
      },
    });

    if (text.trim().length === 0) {
      throw new Error("Anthropic returned no text content for the iteration request.");
    }

    const iterationResponse = parseIterationResponse(text);
    assistantResponsesByPage.push({
      pageId: "iteration",
      text,
    });
    await persistAssistantResponseMetadata({
      buildId: input.buildId,
      assistantResponseText: assistantResponseParts.join(""),
      assistantResponsesByPage,
    });

    const changedFiles = iterationResponse.changedFiles.map((file) => ({
      content: stripNonTsxEnvelope(extractCodePayload(file.content)),
      path: file.path,
    }));

    const mergedFiles = mergeChangedFiles({
      changedFiles,
      existingFiles: input.existingFiles,
    });

    return {
      assistantResponseText: assistantResponseParts.join(""),
      assistantResponsesByPage,
      changedPaths: changedFiles.map((file) => file.path),
      files: mergedFiles,
      previewEntryPath: input.template.previewEntryPath,
      source: "ai",
      summary:
        iterationResponse.summary?.trim()
        || (changedFiles.length > 0
          ? `Updated ${changedFiles.length} file${changedFiles.length === 1 ? "" : "s"} in ${input.project.name}.`
          : `No file changes were needed for ${input.project.name}.`),
      warnings: [],
    };
  }

  for (const page of input.template.pages) {
    const text = await streamAnthropicMessage({
      system: buildSystemPrompt(policy, "initial"),
      userMessage: buildUserPrompt(input, page),
      onTextDelta: async (delta) => {
        assistantResponseParts.push(delta);
        streamSequence += 1;
        await appendAssistantDeltaEvent({
          buildId: input.buildId,
          delta,
          eventId: `assistant-${page.id}-${streamSequence}`,
        });
      },
    });

    if (text.trim().length === 0) {
      throw new Error(`Anthropic returned no text content for page ${page.id}.`);
    }

    assistantResponsesByPage.push({
      pageId: page.id,
      text,
    });
    await persistAssistantResponseMetadata({
      buildId: input.buildId,
      assistantResponseText: assistantResponseParts.join(""),
      assistantResponsesByPage,
    });

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
    assistantResponseText: assistantResponseParts.join(""),
    assistantResponsesByPage,
    files,
    previewEntryPath: input.template.previewEntryPath,
    source: "ai",
    summary: `Generated ${input.template.pages.length} route files for ${input.template.name}.`,
    warnings: [],
  };
}
