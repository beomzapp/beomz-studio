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

type WebsiteSectionKey = z.infer<typeof websiteSectionSchema>;

type WebsiteFileOutput = {
  path: string;
  content: string;
};

type WebsiteIterationResult = {
  files: WebsiteFileOutput[];
  inputTokens: number;
  outputTokens: number;
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

const SECTION_FILE_PATHS: Record<WebsiteSectionKey, string> = {
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
}): string {
  return [
    `Project name: ${input.projectName}`,
    `Section: ${input.activeSection}`,
    `Target file: ${input.file.path}`,
    "",
    "User instruction:",
    input.prompt.trim(),
    "",
    "Current file:",
    buildFileContext([input.file]),
  ].join("\n");
}

function buildGeneralUserPrompt(input: {
  projectName: string;
  prompt: string;
  files: readonly StudioFile[];
}): string {
  return [
    `Project name: ${input.projectName}`,
    "",
    "User instruction:",
    input.prompt.trim(),
    "",
    "Current website files:",
    buildFileContext(input.files),
  ].join("\n");
}

function isSocketDropError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.message === "terminated") return true;
  const cause = (err as Error & { cause?: { code?: string } }).cause;
  return cause?.code === "UND_ERR_SOCKET";
}

async function callAnthropicWebsiteIteration(input: {
  projectName: string;
  prompt: string;
  existingFiles: readonly StudioFile[];
  activeSection?: WebsiteSectionKey;
  abortSignal?: AbortSignal;
}): Promise<WebsiteIterationResult> {
  const activeSection = input.activeSection;
  const targetFile = activeSection
    ? input.existingFiles.find((file) => file.path === SECTION_FILE_PATHS[activeSection])
    : null;

  const systemPrompt = activeSection
    ? [
        "You are editing a single section component of a marketing website.",
        WEBSITE_STRICT_ITERATION_RULE,
        "Rewrite ONLY this component based on the instruction.",
        "Keep the data-section attribute.",
        "Return only the updated file.",
      ].join(" ")
    : [
        "You are editing an existing React + TypeScript marketing website.",
        WEBSITE_STRICT_ITERATION_RULE,
        "Return only the changed files through the deliver_updated_website_files tool.",
        "Preserve every existing data-section attribute on section components.",
        "Do not add backend files, package manager files, or unrelated rewrites.",
        "Keep the website polished, responsive, and production-ready.",
      ].join(" ");

  const userPrompt = activeSection && targetFile
    ? buildSectionUserPrompt({
        projectName: input.projectName,
        prompt: input.prompt,
        activeSection,
        file: targetFile,
      })
    : buildGeneralUserPrompt({
        projectName: input.projectName,
        prompt: input.prompt,
        files: input.existingFiles,
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

function mergeStudioFiles(
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

async function findLatestWebsiteGenerationWithFiles(
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
              abortSignal: abortController.signal,
            });

        if (iteration.files.length === 0) {
          throw new Error("Website iteration returned no changed files.");
        }

        const changedStudioFiles = toStudioFiles(iteration.files);
        const mergedFiles = mergeStudioFiles(existingFiles, changedStudioFiles);

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
          files: mergedFiles,
          output_paths: mergedFiles.map((file) => file.path),
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
          files: mergedFiles,
          output_paths: mergedFiles.map((file) => file.path),
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
          studioFilesToVersionFiles(mergedFiles),
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
