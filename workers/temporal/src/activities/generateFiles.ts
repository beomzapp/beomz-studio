import {
  AnthropicStreamingModel,
  GenerationEngine,
} from "@beomz-studio/engine";
import { projectIterationOperation } from "@beomz-studio/operations";
import {
  getInitialBuildPromptPolicy,
  getIterationPromptPolicy,
} from "@beomz-studio/prompt-policies";
import {
  createEmptyBuilderV3TraceMetadata,
  normalizeGeneratedPath,
  type BuilderV3TraceMetadata,
  type StudioFile,
  type TemplatePage,
} from "@beomz-studio/contracts";
import { createStudioDbClient } from "@beomz-studio/studio-db";
import {
  APPROVED_GENERATED_IMPORTS,
  validateGeneratedFileGuardrails,
} from "@beomz-studio/validators";

import { getAnthropicRuntimeConfig } from "../config.js";
import {
  buildGeneratedPageComponentName,
  buildGeneratedPageFilePath,
} from "../shared/paths.js";
import {
  buildGeneratedScaffoldFiles,
  buildScaffoldPromptBlock,
} from "../shared/generatedSurface.js";
import {
  buildIterationPromptBlock,
  buildLayoutFingerprint,
  classifyIterationIntent,
} from "../shared/iterationContext.js";
import type {
  GenerateFilesActivityInput,
  GeneratedBuildDraft,
} from "../shared/types.js";

interface PromptPolicyLike {
  systemPrompt: string;
  constraints: readonly string[];
}

type GenerationFailureCode =
  | "auth_required"
  | "upstream_connection"
  | "upstream_timeout"
  | "build_validation"
  | "unknown";

interface ClassifiedGenerationError {
  code: GenerationFailureCode;
  message: string;
  rawMessage: string;
}

interface StreamedAnthropicMessageResult {
  text: string;
  streamError?: ClassifiedGenerationError;
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

const APPROVED_SANDBOX_PACKAGE_RULE = `Approved sandbox packages for generated app code: ${APPROVED_GENERATED_IMPORTS.join(", ")}.`;
const BANNED_SANDBOX_IMPORT_RULE =
  "Never import from react-icons, @heroicons, or any other package that is not in the approved sandbox package list.";

function buildSystemPrompt(policy: PromptPolicyLike, mode: "initial" | "iteration"): string {
  return [
    mode === "iteration"
      ? "You are the Beomz Studio iteration generator."
      : "You are the Beomz Studio initial build generator.",
    policy.systemPrompt,
    "Non-negotiable constraints:",
    ...policy.constraints.map((constraint) => `- ${constraint}`),
    `- ${APPROVED_SANDBOX_PACKAGE_RULE}`,
    `- ${BANNED_SANDBOX_IMPORT_RULE}`,
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
    buildScaffoldPromptBlock(input.template),
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
    "The page MUST import AppShell from the generated scaffold and wrap route-specific content inside it.",
    "Import AppShell with a default import, not a namespace import.",
    "Use shared generated theme/data/ui modules where helpful. Do not re-create shell navigation, footer, mobile drawer, or topbar inside the route file.",
    APPROVED_SANDBOX_PACKAGE_RULE,
    BANNED_SANDBOX_IMPORT_RULE,
    "Output ONLY the complete TSX file contents for that one page.",
    `The file must default export a React component named ${componentName}.`,
    "Do not return JSON, markdown fences, explanations, or any prose outside the TSX file.",
  ].join("\n\n");
}

function buildIterationUserPrompt(input: GenerateFilesActivityInput): string {
  const intent = classifyIterationIntent(input.plan.normalizedPrompt);
  const fingerprint = buildLayoutFingerprint(input.template, input.existingFiles);
  return [
    `Project name: ${input.project.name}`,
    `User request: ${input.plan.normalizedPrompt}`,
    `Intent summary: ${input.plan.intentSummary}`,
    `Template: ${input.template.name}`,
    `Template description: ${input.template.description}`,
    buildScaffoldPromptBlock(input.template),
    buildIterationPromptBlock({ fingerprint, intent }),
    "Current files are already mounted in the virtual filesystem and are the source of truth.",
    "Use tool actions to inspect the current app, make the minimum required edits, and finish with a concise summary.",
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "Generation failed";
}

function isTransientGenerationError(error: unknown): boolean {
  const message = toErrorMessage(error).toLowerCase();
  if (message.length === 0) {
    return false;
  }

  return [
    "connection error.",
    "network error",
    "socket hang up",
    "econnreset",
    "etimedout",
    "fetch failed",
    "upstream connect error",
    "overloaded",
    "temporarily unavailable",
    "stream disconnected",
    "terminated",
    "aborted",
  ].some((needle) => message.includes(needle));
}

function hasBuildValidationSignal(normalizedMessage: string): boolean {
  return (
    normalizedMessage.includes("validation failed")
    || normalizedMessage.includes("guardrails failed")
    || normalizedMessage.includes("missing default export")
    || normalizedMessage.includes("missing ")
    || normalizedMessage.includes("empty code content")
    || normalizedMessage.includes("no text content")
    || normalizedMessage.includes("unavailable sandbox package")
    || normalizedMessage.includes("imports a banned package")
  );
}

function classifyGenerationError(error: unknown): ClassifiedGenerationError {
  const rawMessage = toErrorMessage(error);
  const normalized = rawMessage.toLowerCase();

  if (
    normalized.includes("unauthorized")
    || normalized.includes("authentication")
    || normalized.includes("invalid x-api-key")
    || normalized.includes("api key")
  ) {
    return {
      code: "auth_required",
      message: rawMessage,
      rawMessage,
    };
  }

  if (hasBuildValidationSignal(normalized)) {
    return {
      code: "build_validation",
      message: rawMessage,
      rawMessage,
    };
  }

  if (
    normalized.includes("timeout")
    || normalized.includes("timed out")
    || normalized.includes("stalled")
    || normalized.includes("hard timeout")
  ) {
    return {
      code: "upstream_timeout",
      message: "The AI model took too long to respond, so generation could not finish in time.",
      rawMessage,
    };
  }

  if (
    isTransientGenerationError(error)
    || normalized.includes("connection error")
    || normalized.includes("stream disconnected")
  ) {
    return {
      code: "upstream_connection",
      message: "The AI model connection dropped while generating files.",
      rawMessage,
    };
  }

  return {
    code: "unknown",
    message: rawMessage,
    rawMessage,
  };
}

function combineGenerationErrors(...errors: unknown[]): Error {
  const messages = errors
    .map((error) => toErrorMessage(error).trim())
    .filter((message, index, all) => message.length > 0 && all.indexOf(message) === index);

  return new Error(messages.join(" | ") || "Generation failed");
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
}): Promise<StreamedAnthropicMessageResult> {
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

  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
      await consumeBuffer(done);

      if (done) {
        await flushEvent();
        break;
      }
    }
  } catch (error) {
    try {
      await consumeBuffer(true);
      await flushEvent();
    } catch (flushError) {
      throw combineGenerationErrors(error, flushError);
    }

    return {
      text: textParts.join(""),
      streamError: classifyGenerationError(error),
    };
  }

  return {
    text: textParts.join(""),
  };
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

function normalizeComparableContent(content: string): string {
  return content.replace(/\r\n/g, "\n").trim();
}

function getMaterialChangedPaths(
  existingFiles: readonly StudioFile[],
  nextFiles: readonly StudioFile[],
): readonly string[] {
  const existingByPath = new Map(
    existingFiles.map((file) => [normalizeGeneratedPath(file.path), normalizeComparableContent(file.content)] as const),
  );

  return nextFiles
    .filter((file) => {
      const normalizedPath = normalizeGeneratedPath(file.path);
      const previous = existingByPath.get(normalizedPath);
      if (previous === undefined) {
        return true;
      }

      return previous !== normalizeComparableContent(file.content);
    })
    .map((file) => normalizeGeneratedPath(file.path));
}

function assertGeneratedFileGuardrails(files: readonly StudioFile[]): void {
  const result = validateGeneratedFileGuardrails(files);
  if (result.valid) {
    return;
  }

  throw new Error(`Generated file guardrails failed:\n${result.errors.join("\n")}`);
}

export async function generateFiles(
  input: GenerateFilesActivityInput,
): Promise<GeneratedBuildDraft> {
  const config = getAnthropicRuntimeConfig();
  const isIteration = input.existingFiles.length > 0;
  const policy = isIteration
    ? getIterationPromptPolicy(input.template.id)
    : getInitialBuildPromptPolicy(input.template.id);
  const files: StudioFile[] = [];
  const assistantResponseParts: string[] = [];
  const assistantResponsesByPage: Array<{ pageId: string; text: string }> = [];
  const warnings: string[] = [];
  let streamSequence = 0;

  if (isIteration) {
    if (!config.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not configured.");
    }

    const model = new AnthropicStreamingModel({
      apiKey: config.ANTHROPIC_API_KEY,
      baseUrl: config.ANTHROPIC_BASE_URL,
      maxTokens: config.ANTHROPIC_MAX_TOKENS,
      model: config.ANTHROPIC_MODEL,
      timeoutMs: 180_000,
    });
    const engine = new GenerationEngine({
      actor: input.actor,
      generationId: input.buildId,
      initialFiles: input.existingFiles.map((file) => ({
        content: file.content,
        path: normalizeGeneratedPath(file.path),
      })),
      maxTurns: 30,
      model,
      operation: projectIterationOperation,
      persistence: false,
      prompt: buildIterationUserPrompt(input),
      promptPolicy: getIterationPromptPolicy(input.template.id),
      project: input.project,
      template: input.template,
    });

    const turnTexts: string[] = [];
    let resultSummary = "";
    let finalFiles = input.existingFiles;

    for await (const event of engine.run()) {
      if (event.type === "text_delta" && event.text.length > 0) {
        assistantResponseParts.push(event.text);
        turnTexts.push(event.text);
        streamSequence += 1;
        await appendAssistantDeltaEvent({
          buildId: input.buildId,
          delta: event.text,
          eventId: `assistant-iteration-${streamSequence}`,
        });
      }

      if (event.type === "llm_turn_completed") {
        assistantResponsesByPage.push({
          pageId: `iteration-turn-${event.turn}`,
          text: turnTexts.join(""),
        });
        turnTexts.length = 0;
      }

      if (event.type === "generation_completed") {
        finalFiles = event.result.files;
        resultSummary = event.result.summary;
      }
    }

    await persistAssistantResponseMetadata({
      buildId: input.buildId,
      assistantResponseText: assistantResponseParts.join(""),
      assistantResponsesByPage,
    });
    const changedPaths = getMaterialChangedPaths(input.existingFiles, finalFiles);
    const changedFiles = finalFiles.filter((file) =>
      changedPaths.includes(normalizeGeneratedPath(file.path))
    );
    assertGeneratedFileGuardrails(changedFiles);

    return {
      assistantResponseText: assistantResponseParts.join(""),
      assistantResponsesByPage,
      changedPaths,
      files: finalFiles,
      previewEntryPath: input.template.previewEntryPath,
      source: "ai",
      summary:
        resultSummary.trim()
        || (changedPaths.length > 0
          ? `Updated ${changedPaths.length} file${changedPaths.length === 1 ? "" : "s"} in ${input.project.name}.`
          : `No file changes were needed for ${input.project.name}.`),
      warnings,
    };
  }

  const scaffoldFiles = buildGeneratedScaffoldFiles({
    project: input.project,
    template: input.template,
  });
  files.push(...scaffoldFiles);

  for (const page of input.template.pages) {
    const streamResult = await streamAnthropicMessage({
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
    const text = streamResult.text;

    if (text.trim().length === 0) {
      if (streamResult.streamError) {
        throw new Error(streamResult.streamError.message);
      }
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

    let content: string;
    try {
      content = parseGeneratedFileContent({
        config,
        page,
        templateId: input.template.id,
        text,
      });
    } catch (parseError) {
      if (streamResult.streamError) {
        throw new Error(
          classifyGenerationError(
            combineGenerationErrors(streamResult.streamError.rawMessage, parseError),
          ).message,
        );
      }
      throw parseError;
    }

    const nextFile: StudioFile = {
      path: buildGeneratedPageFilePath(input.template.id, page.id),
      kind: "route" as const,
      language: "tsx",
      content: content.trim(),
      locked: false,
      source: "ai" as const,
    };

    try {
      assertGeneratedFileGuardrails([nextFile]);
    } catch (validationError) {
      if (streamResult.streamError) {
        throw new Error(
          classifyGenerationError(
            combineGenerationErrors(streamResult.streamError.rawMessage, validationError),
          ).message,
        );
      }
      throw validationError;
    }

    if (streamResult.streamError) {
      warnings.push(
        `Recovered ${page.name} after a model stream failure and kept the validated page output.`,
      );
      console.warn("Recovered generated page after stream error.", {
        errorCode: streamResult.streamError.code,
        errorMessage: streamResult.streamError.rawMessage,
        pageId: page.id,
        templateId: input.template.id,
      });
    }

    files.push(nextFile);
  }

  assertGeneratedFileGuardrails(files);

  return {
    assistantResponseText: assistantResponseParts.join(""),
    assistantResponsesByPage,
    files,
    previewEntryPath: input.template.previewEntryPath,
    source: "ai",
    summary: `Generated ${files.length} scaffold and route files for ${input.template.name}.`,
    warnings,
  };
}
