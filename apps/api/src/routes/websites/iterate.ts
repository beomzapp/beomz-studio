import { randomUUID } from "node:crypto";

import Anthropic from "@anthropic-ai/sdk";
import type {
  BuilderV3DoneEvent,
  BuilderV3Event,
  BuilderV3Operation,
  BuilderV3TraceMetadata,
  StudioFile,
} from "@beomz-studio/contracts";
import { createEmptyBuilderV3TraceMetadata } from "@beomz-studio/contracts";
import type { StudioDbClient } from "@beomz-studio/studio-db";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";

import { apiConfig } from "../../config.js";
import {
  calcIterationCreditCost,
  isAdminEmail,
} from "../../lib/credits.js";
import { getModelForBuilder } from "../../lib/modelConfig.js";
import { saveProjectVersion, studioFilesToVersionFiles } from "../../lib/projectVersions.js";
import { loadOrgContext } from "../../middleware/loadOrgContext.js";
import { verifyPlatformJwt } from "../../middleware/verifyPlatformJwt.js";
import type { OrgContext } from "../../types.js";

const websitesIterateRoute = new Hono();

const WEBSITE_ITERATION_MODEL_FALLBACK = "claude-haiku-4-5-20251001";
const WEBSITE_ITERATION_MAX_TOKENS = 32000;
const WEBSITE_OPERATION: BuilderV3Operation = "iteration";
const WEBSITE_PREVIEW_ENTRY_PATH = "/";
const WEBSITE_PING_INTERVAL_MS = 20_000;
const WEBSITE_STRICT_ITERATION_RULE = "CRITICAL: NEVER regenerate or redesign the entire site. You are making surgical changes only. Only rebuild from scratch if the user explicitly says 'rebuild', 'redesign', 'start over', 'make it completely different', or 'try a new design'. ALL other requests — even vague ones — are precise iterations on the existing design.";

const websiteSectionSchema = z.enum(["hero", "features", "about", "cta", "footer", "nav"]);

const requestSchema = z.object({
  projectId: z.string().uuid(),
  sessionId: z.string().trim().min(1).max(200),
  prompt: z.string().trim().min(1).max(8000),
  activeSection: websiteSectionSchema.optional(),
});

export type WebsiteSectionKey = z.infer<typeof websiteSectionSchema>;

type WebsiteFileOutput = {
  path: string;
  content: string;
};

export type WebsiteIterationResult = {
  files: WebsiteFileOutput[];
  inputTokens: number;
  outputTokens: number;
};

export type LockedImageReference = {
  filePath: string;
  slotIndex: number;
  url: string;
};

interface WebsiteIterationAckEvent extends Record<string, unknown> {
  type: "iteration_ack";
  id: string;
  timestamp: string;
  operation: BuilderV3Operation;
  message: string;
  activeSection?: WebsiteSectionKey;
}

interface WebsiteFilesEvent extends Record<string, unknown> {
  type: "files";
  id: string;
  timestamp: string;
  operation: BuilderV3Operation;
  files: Array<{ path: string; content: string }>;
  totalFiles: number;
  activeSection?: WebsiteSectionKey;
}

const REQUIRED_FILE_PATHS = [
  "index.html",
  "src/components/Nav.tsx",
  "src/components/Hero.tsx",
  "src/components/Features.tsx",
  "src/components/About.tsx",
  "src/components/CTA.tsx",
  "src/components/Footer.tsx",
  "src/pages/Home.tsx",
  "src/App.tsx",
  "src/main.tsx",
  "src/index.css",
] as const;

export const SECTION_FILE_PATHS: Record<WebsiteSectionKey, string> = {
  nav: "src/components/Nav.tsx",
  hero: "src/components/Hero.tsx",
  features: "src/components/Features.tsx",
  about: "src/components/About.tsx",
  cta: "src/components/CTA.tsx",
  footer: "src/components/Footer.tsx",
};

const REQUIRED_SECTION_ATTRIBUTES: Record<string, WebsiteSectionKey> = {
  "src/components/Nav.tsx": "nav",
  "src/components/Hero.tsx": "hero",
  "src/components/Features.tsx": "features",
  "src/components/About.tsx": "about",
  "src/components/CTA.tsx": "cta",
  "src/components/Footer.tsx": "footer",
};

const WEBSITE_ITERATION_TOOL: Anthropic.Messages.Tool = {
  name: "deliver_updated_website_files",
  description:
    "Return only the website files changed by this iteration. "
    + "Do not include unchanged files.",
  input_schema: {
    type: "object",
    properties: {
      files: {
        type: "array",
        description:
          "Only the updated website files. Use the existing project-relative file paths.",
        items: {
          type: "object",
          properties: {
            path: { type: "string", description: "The project-relative file path." },
            content: { type: "string", description: "Complete file content." },
          },
          required: ["path", "content"],
          additionalProperties: false,
        },
      },
    },
    required: ["files"],
    additionalProperties: false,
  },
};

const IMAGE_CHANGE_REQUEST_PATTERN = /image|photo|picture|hero image|background/i;
const IMAGE_SRC_PATTERN = /\bsrc=\{?(["'])(https?:\/\/[^\s"'`)<>{}]+)\1\}?/g;
const CSS_URL_PATTERN = /url\((["']?)(https?:\/\/[^\s"'`)<>{}]+)\1\)/g;
const FAL_IMAGE_HOST_PATTERN = /\b(?:fal\.ai|fal\.media|fal\.run)\b/i;

type ImageUrlSlot = {
  url: string;
  start: number;
  end: number;
};

function ts(): string {
  return new Date().toISOString();
}

function inferFileKind(path: string): StudioFile["kind"] {
  if (/\/(routes|pages|screens|views)\//.test(path) || /App\.(tsx|jsx)$/.test(path)) return "route";
  if (/\/components\//.test(path)) return "component";
  if (/\/(styles?|css)\//.test(path) || /\.css$/.test(path)) return "style";
  if (/\/(config|settings)\//.test(path) || /\.(config|rc)\.(ts|js|json)$/.test(path)) return "config";
  if (/\/(data|fixtures)\//.test(path)) return "data";
  if (/\.(json|md|html)$/.test(path)) return "content";
  return "component";
}

function inferLanguage(path: string): string {
  const extension = path.split(".").pop()?.toLowerCase() ?? "";
  const languageByExtension: Record<string, string> = {
    css: "css",
    html: "html",
    js: "javascript",
    json: "json",
    jsx: "jsx",
    md: "markdown",
    ts: "typescript",
    tsx: "tsx",
  };

  return languageByExtension[extension] ?? "typescript";
}

function readTrace(metadata: Record<string, unknown>): BuilderV3TraceMetadata {
  const trace = metadata.builderTrace;
  if (typeof trace === "object" && trace !== null && !Array.isArray(trace)) {
    const raw = trace as Record<string, unknown>;
    return {
      events: Array.isArray(raw.events) ? (raw.events as BuilderV3TraceMetadata["events"]) : [],
      lastEventId: typeof raw.lastEventId === "string" ? raw.lastEventId : null,
      previewReady: raw.previewReady === true,
      fallbackUsed: raw.fallbackUsed === true,
      fallbackReason: typeof raw.fallbackReason === "string" ? raw.fallbackReason : null,
    };
  }

  return createEmptyBuilderV3TraceMetadata();
}

async function appendEventToDb(
  db: StudioDbClient,
  buildId: string,
  event: BuilderV3Event | WebsiteIterationAckEvent | WebsiteFilesEvent,
  extraPatch?: Partial<Parameters<StudioDbClient["updateGeneration"]>[1]>,
): Promise<void> {
  const row = await db.findGenerationById(buildId);
  if (!row) {
    return;
  }

  const metadata = typeof row.metadata === "object" && row.metadata !== null
    ? (row.metadata as Record<string, unknown>)
    : {};
  const currentTrace = readTrace(metadata);
  const nextTrace: BuilderV3TraceMetadata = {
    ...currentTrace,
    events: [...currentTrace.events, event as unknown as BuilderV3Event],
    lastEventId: event.id,
  };

  await db.updateGeneration(buildId, {
    metadata: { ...metadata, builderTrace: nextTrace },
    ...extraPatch,
  });
}

async function appendSessionEventToDb(
  db: StudioDbClient,
  buildId: string,
  event: Record<string, unknown>,
): Promise<void> {
  try {
    const row = await db.findGenerationById(buildId);
    if (!row) {
      return;
    }

    const currentEvents = Array.isArray(row.session_events)
      ? (row.session_events as Record<string, unknown>[])
      : [];

    await db.updateGeneration(buildId, {
      session_events: [...currentEvents, { ...event, timestamp: ts() }],
    });
  } catch (error) {
    console.warn(
      "[websites/iterate] appendSessionEventToDb failed (non-fatal):",
      error instanceof Error ? error.message : String(error),
    );
  }
}

function isAllowedWebsitePath(path: string): boolean {
  return path === "index.html" || path.startsWith("src/");
}

function cleanPath(path: string): string {
  return path.replace(/^\.?\//, "").replaceAll("\\", "/").trim();
}

function toStudioFiles(files: WebsiteFileOutput[]): StudioFile[] {
  return files.map((file) => ({
    path: file.path,
    kind: inferFileKind(file.path),
    language: inferLanguage(file.path),
    content: file.content,
    source: "ai",
    locked: false,
  }));
}

function getFileBasename(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] ?? path;
}

function resolveReturnedPath(
  rawPath: string,
  existingFiles: readonly StudioFile[],
): string | null {
  const cleaned = cleanPath(rawPath);
  if (!cleaned) {
    return null;
  }

  if (isAllowedWebsitePath(cleaned)) {
    return cleaned;
  }

  const basename = getFileBasename(cleaned);
  const matches = existingFiles.filter((file) => getFileBasename(file.path) === basename);
  if (matches.length === 1) {
    return matches[0]!.path;
  }

  return null;
}

function validateSectionAttribute(path: string, content: string): void {
  const requiredSection = REQUIRED_SECTION_ATTRIBUTES[path];
  if (!requiredSection) {
    return;
  }

  if (!content.includes(`data-section="${requiredSection}"`)) {
    throw new Error(`Updated ${getFileBasename(path)} must preserve data-section="${requiredSection}".`);
  }
}

function parseToolFiles(
  raw: { files?: unknown },
  existingFiles: readonly StudioFile[],
): WebsiteFileOutput[] {
  if (!Array.isArray(raw.files)) {
    return [];
  }

  const deduped = new Map<string, WebsiteFileOutput>();
  for (const candidate of raw.files) {
    if (!candidate || typeof candidate !== "object") {
      continue;
    }

    const file = candidate as Record<string, unknown>;
    if (typeof file.path !== "string" || typeof file.content !== "string") {
      continue;
    }

    const resolvedPath = resolveReturnedPath(file.path, existingFiles);
    if (!resolvedPath || !isAllowedWebsitePath(resolvedPath)) {
      continue;
    }

    validateSectionAttribute(resolvedPath, file.content);
    deduped.set(resolvedPath, {
      path: resolvedPath,
      content: file.content,
    });
  }

  return [...deduped.values()];
}

function enforceSingleSectionResult(
  files: WebsiteFileOutput[],
  activeSection: WebsiteSectionKey,
): WebsiteFileOutput[] {
  const targetPath = SECTION_FILE_PATHS[activeSection];
  const matching = files.filter((file) => file.path === targetPath);

  if (matching.length !== 1 || files.length !== 1) {
    throw new Error(`Section iteration must return exactly one updated file for ${activeSection}.`);
  }

  validateSectionAttribute(targetPath, matching[0]!.content);
  return matching;
}

function buildFileContext(files: readonly StudioFile[]): string {
  return files.map((file) => [
    `File: ${file.path}`,
    "```tsx",
    file.content,
    "```",
  ].join("\n")).join("\n\n");
}

function buildSectionUserPrompt(input: {
  projectName: string;
  prompt: string;
  activeSection: WebsiteSectionKey;
  file: StudioFile;
  lockedImages: readonly LockedImageReference[];
  imageChangeRequested: boolean;
}): string {
  return [
    `Project name: ${input.projectName}`,
    `Section: ${input.activeSection}`,
    `Target file: ${input.file.path}`,
    "",
    "User instruction:",
    input.prompt.trim(),
    "",
    `Image change requested: ${input.imageChangeRequested ? "yes" : "no"}`,
    ...buildLockedImagePromptLines(input.lockedImages),
    "",
    "Current file:",
    buildFileContext([input.file]),
  ].join("\n");
}

function buildGeneralUserPrompt(input: {
  projectName: string;
  prompt: string;
  files: readonly StudioFile[];
  lockedImages: readonly LockedImageReference[];
  imageChangeRequested: boolean;
}): string {
  return [
    `Project name: ${input.projectName}`,
    "",
    "User instruction:",
    input.prompt.trim(),
    "",
    `Image change requested: ${input.imageChangeRequested ? "yes" : "no"}`,
    ...buildLockedImagePromptLines(input.lockedImages),
    "",
    "Current website files:",
    buildFileContext(input.files),
  ].join("\n");
}

function buildLockedImagePromptLines(lockedImages: readonly LockedImageReference[]): string[] {
  if (lockedImages.length === 0) {
    return ["Locked images: none detected."];
  }

  return [
    "Locked images (preserve these exact URLs unless the user explicitly requested an image change):",
    ...lockedImages.map((image) => `- ${image.filePath} [image ${image.slotIndex + 1}]: ${image.url}`),
  ];
}

function safeDecodeUrl(value: string): string {
  let current = value;

  for (let i = 0; i < 2; i += 1) {
    try {
      const decoded = decodeURIComponent(current);
      if (decoded === current) {
        return decoded;
      }
      current = decoded;
    } catch {
      return current;
    }
  }

  return current;
}

function toFalComparableUrl(url: string): string {
  const variants = new Set<string>([url, safeDecodeUrl(url)]);

  try {
    const parsed = new URL(url);
    const proxiedUrl = parsed.searchParams.get("url");
    if (proxiedUrl) {
      variants.add(proxiedUrl);
      variants.add(safeDecodeUrl(proxiedUrl));
    }
  } catch {
    // Ignore invalid URL parsing and fall back to raw string matching.
  }

  return [...variants].join(" ");
}

function isFalImageUrl(url: string): boolean {
  return FAL_IMAGE_HOST_PATTERN.test(toFalComparableUrl(url));
}

function pushImageUrlMatches(
  pattern: RegExp,
  groupIndex: number,
  content: string,
  matches: ImageUrlSlot[],
): void {
  for (const match of content.matchAll(pattern)) {
    const url = match[groupIndex];
    if (typeof url !== "string" || typeof match.index !== "number") {
      continue;
    }

    const relativeStart = match[0].indexOf(url);
    if (relativeStart < 0) {
      continue;
    }

    const start = match.index + relativeStart;
    matches.push({
      url,
      start,
      end: start + url.length,
    });
  }
}

function extractImageUrlSlots(content: string): ImageUrlSlot[] {
  const matches: ImageUrlSlot[] = [];
  pushImageUrlMatches(IMAGE_SRC_PATTERN, 2, content, matches);
  pushImageUrlMatches(CSS_URL_PATTERN, 2, content, matches);

  return matches
    .sort((left, right) => left.start - right.start)
    .filter((match, index, all) => index === 0
      || match.start !== all[index - 1]!.start
      || match.end !== all[index - 1]!.end
      || match.url !== all[index - 1]!.url);
}

export function isImageChangeRequested(prompt: string): boolean {
  return IMAGE_CHANGE_REQUEST_PATTERN.test(prompt);
}

export function extractLockedImageReferences(files: readonly StudioFile[]): LockedImageReference[] {
  const lockedImages: LockedImageReference[] = [];

  for (const file of files) {
    const slots = extractImageUrlSlots(file.content);
    slots.forEach((slot, slotIndex) => {
      if (!isFalImageUrl(slot.url)) {
        return;
      }

      lockedImages.push({
        filePath: file.path,
        slotIndex,
        url: slot.url,
      });
    });
  }

  return lockedImages;
}

function replaceRanges(content: string, replacements: Array<{ start: number; end: number; value: string }>): string {
  let nextContent = content;

  for (const replacement of [...replacements].sort((left, right) => right.start - left.start)) {
    nextContent = `${nextContent.slice(0, replacement.start)}${replacement.value}${nextContent.slice(replacement.end)}`;
  }

  return nextContent;
}

function restoreLockedImageUrlsInContent(
  content: string,
  lockedImages: readonly LockedImageReference[],
): {
  content: string;
  restoredCount: number;
} {
  const currentSlots = extractImageUrlSlots(content);
  const replacements: Array<{ start: number; end: number; value: string }> = [];
  const usedSlotKeys = new Set<string>();

  for (const lockedImage of lockedImages) {
    const exactSlot = currentSlots[lockedImage.slotIndex];
    const targetSlot = exactSlot ?? currentSlots.find((slot) => isFalImageUrl(slot.url));
    if (!targetSlot || targetSlot.url === lockedImage.url) {
      continue;
    }

    const slotKey = `${targetSlot.start}:${targetSlot.end}`;
    if (usedSlotKeys.has(slotKey)) {
      continue;
    }
    usedSlotKeys.add(slotKey);

    replacements.push({
      start: targetSlot.start,
      end: targetSlot.end,
      value: lockedImage.url,
    });
  }

  if (replacements.length === 0) {
    return { content, restoredCount: 0 };
  }

  return {
    content: replaceRanges(content, replacements),
    restoredCount: replacements.length,
  };
}

export function restoreLockedImagesAfterMerge(input: {
  mergedFiles: readonly StudioFile[];
  lockedImages: readonly LockedImageReference[];
  imageChangeRequested: boolean;
}): {
  files: StudioFile[];
  restoredCount: number;
  restoredPaths: string[];
} {
  if (input.imageChangeRequested || input.lockedImages.length === 0) {
    return {
      files: [...input.mergedFiles],
      restoredCount: 0,
      restoredPaths: [],
    };
  }

  const lockedByFile = new Map<string, LockedImageReference[]>();
  for (const lockedImage of input.lockedImages) {
    const current = lockedByFile.get(lockedImage.filePath) ?? [];
    current.push(lockedImage);
    lockedByFile.set(lockedImage.filePath, current);
  }

  let restoredCount = 0;
  const restoredPaths = new Set<string>();
  const files = input.mergedFiles.map((file) => {
    const fileLocks = lockedByFile.get(file.path);
    if (!fileLocks || fileLocks.length === 0) {
      return file;
    }

    const restored = restoreLockedImageUrlsInContent(file.content, fileLocks);
    if (restored.restoredCount === 0 || restored.content === file.content) {
      return file;
    }

    restoredCount += restored.restoredCount;
    restoredPaths.add(file.path);
    return {
      ...file,
      content: restored.content,
    };
  });

  return {
    files,
    restoredCount,
    restoredPaths: [...restoredPaths],
  };
}

function isSocketDropError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.message === "terminated") return true;
  const cause = (err as Error & { cause?: { code?: string } }).cause;
  return cause?.code === "UND_ERR_SOCKET";
}

export async function callAnthropicWebsiteIteration(input: {
  projectName: string;
  prompt: string;
  existingFiles: readonly StudioFile[];
  activeSection?: WebsiteSectionKey;
  lockedImages?: readonly LockedImageReference[];
  imageChangeRequested?: boolean;
  abortSignal?: AbortSignal;
}): Promise<WebsiteIterationResult> {
  const activeSection = input.activeSection;
  const lockedImages = input.lockedImages ?? [];
  const imageChangeRequested = input.imageChangeRequested ?? isImageChangeRequested(input.prompt);
  const targetFile = activeSection
    ? input.existingFiles.find((file) => file.path === SECTION_FILE_PATHS[activeSection])
    : null;

  const systemPrompt = activeSection
    ? [
        "You are editing a single section component of a marketing website.",
        WEBSITE_STRICT_ITERATION_RULE,
        "Rewrite ONLY this component based on the instruction.",
        "Keep the data-section attribute.",
        imageChangeRequested
          ? "Only change image URLs if the user explicitly asked for an image change."
          : "Do not change any existing image src/background URL. Locked image URLs must remain byte-for-byte identical.",
        "Return only the updated file.",
      ].join(" ")
    : [
        "You are editing an existing React + TypeScript marketing website.",
        WEBSITE_STRICT_ITERATION_RULE,
        "Return only the changed files through the deliver_updated_website_files tool.",
        "Preserve every existing data-section attribute on section components.",
        imageChangeRequested
          ? "Only change image URLs where the user explicitly requested an image update."
          : "Locked image URLs are immutable for this iteration. Do not generate, replace, or restyle image src/background URLs.",
        "Do not add backend files, package manager files, or unrelated rewrites.",
        "Keep the website polished, responsive, and production-ready.",
      ].join(" ");

  const userPrompt = activeSection && targetFile
    ? buildSectionUserPrompt({
        projectName: input.projectName,
        prompt: input.prompt,
        activeSection,
        file: targetFile,
        lockedImages,
        imageChangeRequested,
      })
    : buildGeneralUserPrompt({
        projectName: input.projectName,
        prompt: input.prompt,
        files: input.existingFiles,
        lockedImages,
        imageChangeRequested,
      });

  const executeCall = async (model: string): Promise<WebsiteIterationResult> => {
    const client = new Anthropic({ apiKey: apiConfig.ANTHROPIC_API_KEY });
    const stream = client.messages.stream(
      {
        model,
        max_tokens: WEBSITE_ITERATION_MAX_TOKENS,
        system: [
          {
            type: "text",
            text: systemPrompt,
            cache_control: { type: "ephemeral" },
          } as any,
        ],
        tools: [WEBSITE_ITERATION_TOOL],
        tool_choice: { type: "tool", name: WEBSITE_ITERATION_TOOL.name },
        messages: [{ role: "user", content: userPrompt }],
      },
      input.abortSignal ? { signal: input.abortSignal } : undefined,
    );
    // Prevent Node from throwing on EventEmitter 'error' before finalMessage() can catch it
    stream.on("error", () => {});
    const message = await stream.finalMessage().catch((err: unknown) => {
      if (isSocketDropError(err)) {
        console.error("[websites/iterate] Anthropic socket dropped:", err instanceof Error ? err.message : String(err));
        throw new Error("Connection dropped, please retry");
      }
      throw err;
    });
    const toolBlock = message.content.find(
      (block): block is Anthropic.Messages.ToolUseBlock =>
        block.type === "tool_use" && block.name === WEBSITE_ITERATION_TOOL.name,
    );

    if (!toolBlock) {
      throw new Error("Anthropic did not call the deliver_updated_website_files tool.");
    }

    const parsedFiles = parseToolFiles(
      toolBlock.input as { files?: unknown },
      input.existingFiles,
    );
    const finalFiles = activeSection
      ? enforceSingleSectionResult(parsedFiles, activeSection)
      : parsedFiles;

    return {
      files: finalFiles,
      inputTokens: message.usage?.input_tokens ?? 0,
      outputTokens: message.usage?.output_tokens ?? 0,
    };
  };

  const runWithRetry = async (model: string): Promise<WebsiteIterationResult> => {
    const initial = await executeCall(model);
    if (initial.files.length > 0) {
      return initial;
    }

    const retry = await executeCall(model);
    if (retry.files.length === 0) {
      throw new Error("Model returned 0 changed files on retry.");
    }

    return {
      files: retry.files,
      inputTokens: initial.inputTokens + retry.inputTokens,
      outputTokens: initial.outputTokens + retry.outputTokens,
    };
  };

  try {
    return await runWithRetry(await getModelForBuilder("websites"));
  } catch (error) {
    if (error instanceof Anthropic.APIError && error.status === 404) {
      return runWithRetry(WEBSITE_ITERATION_MODEL_FALLBACK);
    }
    throw error;
  }
}

export function mergeStudioFiles(
  existingFiles: readonly StudioFile[],
  changedFiles: readonly StudioFile[],
): StudioFile[] {
  const merged = new Map(existingFiles.map((file) => [file.path, file]));

  for (const file of changedFiles) {
    merged.set(file.path, file);
  }

  const requiredOrder = new Map<string, number>(REQUIRED_FILE_PATHS.map((path, index) => [path, index]));
  return [...merged.values()].sort((left, right) => {
    const leftIndex = requiredOrder.get(left.path);
    const rightIndex = requiredOrder.get(right.path);

    if (leftIndex !== undefined || rightIndex !== undefined) {
      return (leftIndex ?? Number.MAX_SAFE_INTEGER) - (rightIndex ?? Number.MAX_SAFE_INTEGER);
    }

    return left.path.localeCompare(right.path);
  });
}

export function diffStudioFiles(
  previousFiles: readonly StudioFile[],
  nextFiles: readonly StudioFile[],
): StudioFile[] {
  const previousByPath = new Map(previousFiles.map((file) => [file.path, file.content]));
  return nextFiles.filter((file) => previousByPath.get(file.path) !== file.content);
}

function createAbortError(): Error {
  const error = new Error("The operation was aborted.");
  error.name = "AbortError";
  return error;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw createAbortError();
  }
}

function buildAckMessage(activeSection?: WebsiteSectionKey): string {
  if (!activeSection) {
    return "Applying your website changes...";
  }

  return `Updating the ${activeSection} section...`;
}

function buildDoneMessage(changedCount: number, activeSection?: WebsiteSectionKey): string {
  if (activeSection) {
    return `Updated the ${activeSection} section.`;
  }

  return `Applied website changes across ${changedCount} file${changedCount === 1 ? "" : "s"}.`;
}

function isWebsiteGeneration(row: Awaited<ReturnType<StudioDbClient["findGenerationById"]>>): boolean {
  const metadata = typeof row?.metadata === "object" && row.metadata !== null
    ? row.metadata as Record<string, unknown>
    : {};
  return metadata.generationMode === "website";
}

export async function findLatestWebsiteGenerationWithFiles(
  db: StudioDbClient,
  projectId: string,
) {
  const generations = await db.listGenerationsByProjectId(projectId);
  return [...generations].reverse().find((row) => isWebsiteGeneration(row) && Array.isArray(row.files) && row.files.length > 0) ?? null;
}

websitesIterateRoute.post(
  "/iterate",
  verifyPlatformJwt,
  loadOrgContext,
  async (c) => {
    const orgContext = c.get("orgContext") as OrgContext;
    const body = await c.req.json().catch(() => null);
    const parsed = requestSchema.safeParse(body);

    if (!parsed.success) {
      return c.json(
        {
          error: "Invalid website iteration request body.",
          details: parsed.error.flatten(),
        },
        400,
      );
    }

    const { projectId, activeSection, prompt } = parsed.data;
    const sessionId = parsed.data.sessionId.trim();
    const project = await orgContext.db.findProjectById(projectId);

    if (!project || project.org_id !== orgContext.org.id) {
      return c.json({ error: "Project not found." }, 404);
    }

    const sourceGeneration = await findLatestWebsiteGenerationWithFiles(orgContext.db, projectId);
    if (!sourceGeneration || !Array.isArray(sourceGeneration.files) || sourceGeneration.files.length === 0) {
      return c.json({ error: "No existing website files found. Generate the website first." }, 400);
    }

    const existingFiles = sourceGeneration.files as readonly StudioFile[];
    const lockedImages = extractLockedImageReferences(existingFiles);
    const imageChangeRequested = isImageChangeRequested(prompt);
    if (activeSection && !existingFiles.some((file) => file.path === SECTION_FILE_PATHS[activeSection])) {
      return c.json({ error: `Could not find the ${activeSection} section file.` }, 400);
    }

    const buildId = randomUUID();
    const requestedAt = ts();
    const initialMetadata = {
      builderTrace: createEmptyBuilderV3TraceMetadata(),
      generationMode: "website",
      model: await getModelForBuilder("websites"),
      sessionId,
      activeSection: activeSection ?? null,
      iterationSourceGenerationId: sourceGeneration.id,
      resultSource: "ai",
      creditsUsed: 0,
    };

    await orgContext.db.createGeneration({
      id: buildId,
      project_id: projectId,
      template_id: project.template,
      operation_id: sessionId,
      status: "running",
      prompt,
      started_at: requestedAt,
      completed_at: null,
      output_paths: [],
      summary: activeSection
        ? `Iterating ${activeSection} section for ${project.name}.`
        : `Iterating website for ${project.name}.`,
      error: null,
      preview_entry_path: WEBSITE_PREVIEW_ENTRY_PATH,
      warnings: [],
      files: [],
      metadata: initialMetadata,
      session_events: [],
    });

    await orgContext.db.updateProject(projectId, {
      status: "queued",
      updated_at: requestedAt,
    }).catch(() => undefined);

    return streamSSE(c, async (sse) => {
      let nextEventId = 1;
      let streamOpen = true;
      const abortController = new AbortController();
      const handleAbort = () => abortController.abort();

      c.req.raw.signal.addEventListener("abort", handleAbort, { once: true });

      const pingInterval = setInterval(async () => {
        if (!streamOpen || c.req.raw.signal.aborted) {
          return;
        }

        try {
          await sse.write(": ping\n\n");
        } catch {
          streamOpen = false;
        }
      }, WEBSITE_PING_INTERVAL_MS);

      const cleanup = () => {
        streamOpen = false;
        clearInterval(pingInterval);
        c.req.raw.signal.removeEventListener("abort", handleAbort);
      };

      const writeEvent = async (
        eventName: string,
        payload: WebsiteIterationAckEvent | WebsiteFilesEvent | BuilderV3DoneEvent,
        extraPatch?: Partial<Parameters<StudioDbClient["updateGeneration"]>[1]>,
      ) => {
        await appendEventToDb(orgContext.db, buildId, payload, extraPatch);

        if (!streamOpen || c.req.raw.signal.aborted) {
          throw createAbortError();
        }

        try {
          await sse.writeSSE({
            event: eventName,
            id: payload.id,
            data: JSON.stringify(payload),
          });
        } catch (error) {
          streamOpen = false;
          throw error;
        }
      };

      try {
        throwIfAborted(abortController.signal);

        const ackEvent: WebsiteIterationAckEvent = {
          type: "iteration_ack",
          id: String(nextEventId++),
          timestamp: ts(),
          operation: WEBSITE_OPERATION,
          message: buildAckMessage(activeSection),
          ...(activeSection ? { activeSection } : {}),
        };

        await writeEvent("iteration_ack", ackEvent, { status: "running" });
        await appendSessionEventToDb(orgContext.db, buildId, { type: "user", content: prompt });
        await appendSessionEventToDb(orgContext.db, buildId, {
          type: "iteration_ack",
          content: ackEvent.message,
          ...(activeSection ? { activeSection } : {}),
        });

        throwIfAborted(abortController.signal);

        const iteration = apiConfig.MOCK_ANTHROPIC
          ? { files: [], inputTokens: 0, outputTokens: 0 }
          : await callAnthropicWebsiteIteration({
              projectName: project.name,
              prompt,
              existingFiles: activeSection
                  ? existingFiles.filter((file) => file.path === SECTION_FILE_PATHS[activeSection])
                  : existingFiles,
              activeSection,
              lockedImages,
              imageChangeRequested,
              abortSignal: abortController.signal,
            });

        if (iteration.files.length === 0) {
          throw new Error("Website iteration returned no changed files.");
        }

        const aiChangedStudioFiles = toStudioFiles(iteration.files);
        const mergedFiles = mergeStudioFiles(existingFiles, aiChangedStudioFiles);
        const restoredMerge = restoreLockedImagesAfterMerge({
          mergedFiles,
          lockedImages,
          imageChangeRequested,
        });
        const finalMergedFiles = restoredMerge.files;
        const changedStudioFiles = diffStudioFiles(existingFiles, finalMergedFiles);
        if (changedStudioFiles.length === 0) {
          throw new Error("Website iteration returned no non-image changes after preserving locked images.");
        }

        if (restoredMerge.restoredCount > 0) {
          console.log("[websites/iterate] restored locked images:", {
            restoredCount: restoredMerge.restoredCount,
            restoredPaths: restoredMerge.restoredPaths,
            buildId,
          });
        }

        const filesEvent: WebsiteFilesEvent = {
          type: "files",
          id: String(nextEventId++),
          timestamp: ts(),
          operation: WEBSITE_OPERATION,
          files: changedStudioFiles.map((file) => ({ path: file.path, content: file.content })),
          totalFiles: changedStudioFiles.length,
          ...(activeSection ? { activeSection } : {}),
        };

        await writeEvent("files", filesEvent, {
          files: finalMergedFiles,
          output_paths: finalMergedFiles.map((file) => file.path),
          preview_entry_path: WEBSITE_PREVIEW_ENTRY_PATH,
        });

        const inputTokens = iteration.inputTokens;
        const outputTokens = iteration.outputTokens;
        let creditsUsed = 0;
        if (outputTokens > 0 && !isAdminEmail(orgContext.user.email)) {
          const totalCost = calcIterationCreditCost(inputTokens, outputTokens);
          try {
            const deduction = await orgContext.db.applyOrgUsageDeduction(
              orgContext.org.id,
              totalCost,
              buildId,
              "App iteration",
            );
            creditsUsed = deduction.deducted;
            console.log("[websites/iterate] credits deducted:", {
              deducted: creditsUsed,
              inputTokens,
              outputTokens,
              buildId,
            });
          } catch (error) {
            console.error(
              "[websites/iterate] credit deduction failed (non-fatal):",
              error instanceof Error ? error.message : String(error),
            );
          }
        }

        const completedAt = ts();
        const doneMessage = buildDoneMessage(changedStudioFiles.length, activeSection);
        const doneEvent: BuilderV3DoneEvent = {
          type: "done",
          id: String(nextEventId++),
          timestamp: completedAt,
          operation: WEBSITE_OPERATION,
          code: "build_completed",
          message: doneMessage,
          buildId,
          projectId,
          fallbackUsed: false,
          fallbackReason: null,
          payload: {
            previewEntryPath: WEBSITE_PREVIEW_ENTRY_PATH,
            totalFiles: changedStudioFiles.length,
            ...(activeSection ? { activeSection } : {}),
          },
        };

        await writeEvent("done", doneEvent, {
          completed_at: completedAt,
          files: finalMergedFiles,
          output_paths: finalMergedFiles.map((file) => file.path),
          preview_entry_path: WEBSITE_PREVIEW_ENTRY_PATH,
          status: "completed",
          summary: doneMessage,
        });

        const completedRow = await orgContext.db.findGenerationById(buildId).catch(() => null);
        const completedMetadata = typeof completedRow?.metadata === "object" && completedRow.metadata !== null
          ? (completedRow.metadata as Record<string, unknown>)
          : initialMetadata;

        await orgContext.db.updateGeneration(buildId, {
          metadata: {
            ...completedMetadata,
            creditsUsed,
            inputTokens,
            outputTokens,
            resultSource: "ai",
          },
        }).catch(() => undefined);

        await appendSessionEventToDb(orgContext.db, buildId, {
          type: "done",
          content: doneMessage,
          filesChanged: changedStudioFiles.map((file) => file.path),
          ...(activeSection ? { activeSection } : {}),
        });

        await orgContext.db.updateProject(projectId, {
          status: "ready",
          updated_at: completedAt,
        }).catch(() => undefined);

        void saveProjectVersion(
          projectId,
          prompt.slice(0, 100),
          studioFilesToVersionFiles(finalMergedFiles),
        ).catch((error) => {
          console.error("[websites/iterate] auto-save failed:", error);
        });
      } catch (error) {
        const aborted = isAbortError(error) || abortController.signal.aborted || c.req.raw.signal.aborted;
        const failedAt = ts();

        if (aborted) {
          await orgContext.db.updateGeneration(buildId, {
            completed_at: failedAt,
            error: "Request aborted during website iteration.",
            status: "cancelled",
          }).catch(() => undefined);
        } else {
          console.error(
            "[websites/iterate] request failed:",
            error instanceof Error ? error.message : String(error),
          );

          await orgContext.db.updateGeneration(buildId, {
            completed_at: failedAt,
            error: error instanceof Error ? error.message : "Website iteration failed.",
            status: "failed",
          }).catch(() => undefined);

          if (streamOpen) {
            try {
              await sse.writeSSE({
                event: "error",
                id: String(nextEventId++),
                data: JSON.stringify({
                  type: "error",
                  id: String(nextEventId - 1),
                  timestamp: failedAt,
                  operation: WEBSITE_OPERATION,
                  code: "build_failed",
                  message: error instanceof Error ? error.message : "Website iteration failed.",
                  buildId,
                  projectId,
                }),
              });
            } catch {
              // ignore write failures during shutdown
            }
          }
        }

        await orgContext.db.updateProject(projectId, {
          status: "ready",
          updated_at: failedAt,
        }).catch(() => undefined);
      } finally {
        cleanup();
      }
    });
  },
);

export default websitesIterateRoute;
