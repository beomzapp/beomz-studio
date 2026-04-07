import type {
  BuildPlanContext,
  BuilderV3Event,
  BuilderV3TraceMetadata,
  InitialBuildOutput,
  Project,
  StudioFile,
} from "@beomz-studio/contracts";
import { createEmptyBuilderV3TraceMetadata } from "@beomz-studio/contracts";
import type { GenerationRow, ProjectRow } from "@beomz-studio/studio-db";
import { getTemplateDefinition } from "@beomz-studio/templates";
import { z } from "zod";

import { buildPlanContextSchema } from "../plan/shared.js";

export const FAILURE_REASONS = [
  "SHELL_VIOLATION",
  "INVALID_OUTPUT",
  "PREVIEW_FAILED",
  "GENERATION_TIMEOUT",
  "ANTHROPIC_ERROR",
  "TEMPLATE_NOT_FOUND",
  "FALLBACK_USED",
] as const;

export type FailureReasonCode = (typeof FAILURE_REASONS)[number];

const studioFileKindSchema = z.enum([
  "route",
  "component",
  "layout",
  "style",
  "data",
  "content",
  "config",
  "asset-manifest",
]);

const studioFileSourceSchema = z.enum(["user", "platform", "ai"]);

const studioFileSchema = z.object({
  path: z.string().trim().min(1),
  kind: studioFileKindSchema,
  language: z.string().trim().min(1),
  content: z.string(),
  source: studioFileSourceSchema,
  locked: z.boolean(),
  hash: z.string().optional(),
  updatedAt: z.string().optional(),
});

export interface StartBuildRequest extends BuildPlanContext {
  prompt: string;
  projectId?: string;
  projectName?: string;
  existingFiles?: readonly StudioFile[];
}

export const startBuildRequestSchema = z.object({
  existingFiles: z.array(studioFileSchema).optional(),
  prompt: z.string().trim().min(8).max(4000),
  projectId: z.string().trim().uuid().optional(),
  projectName: z.string().trim().min(1).max(120).optional(),
}).merge(buildPlanContextSchema) satisfies z.ZodType<StartBuildRequest>;

const builderTraceSchema = z.object({
  events: z.array(z.record(z.string(), z.unknown())).optional(),
  lastEventId: z.string().nullable().optional(),
  previewReady: z.boolean().optional(),
  fallbackUsed: z.boolean().optional(),
  fallbackReason: z.string().nullable().optional(),
}).passthrough();

const buildMetadataSchema = z
  .object({
    builderTrace: builderTraceSchema.optional(),
    assistantResponseText: z.string().optional(),
    assistantResponsesByPage: z.array(z.object({
      pageId: z.string(),
      text: z.string(),
    })).optional(),
    failureReason: z.enum(FAILURE_REASONS).optional(),
    fallbackReason: z.string().optional(),
    phase: z.string().optional(),
    planKeywords: z.array(z.string()).optional(),
    planSessionId: z.string().optional(),
    planSteps: z.array(z.object({
      description: z.string(),
      title: z.string(),
    })).optional(),
    planSummary: z.string().optional(),
    resultSource: z.enum(["ai", "fallback", "error"]).optional(),
    selectedTemplateId: z.string().optional(),
    sourcePrompt: z.string().optional(),
    startError: z.string().optional(),
    templateReason: z.string().optional(),
    templateScores: z.record(z.number()).optional(),
    validationWarnings: z.array(z.string()).optional(),
    workflowId: z.string().optional(),
  })
  .passthrough();

export type BuildRouteMetadata = z.infer<typeof buildMetadataSchema>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readBuilderTraceMetadataFromParsed(
  metadata: BuildRouteMetadata,
): BuilderV3TraceMetadata {
  const parsed = builderTraceSchema.safeParse(metadata.builderTrace ?? {});
  if (!parsed.success) {
    return createEmptyBuilderV3TraceMetadata();
  }

  return {
    events: (parsed.data.events ?? []) as unknown as readonly BuilderV3Event[],
    lastEventId: parsed.data.lastEventId ?? null,
    previewReady: parsed.data.previewReady ?? false,
    fallbackReason: parsed.data.fallbackReason ?? null,
    fallbackUsed: parsed.data.fallbackUsed ?? false,
  };
}

function synthesizeBuilderTrace(
  row: GenerationRow,
  metadata: BuildRouteMetadata,
): BuilderV3TraceMetadata {
  const template = getTemplateDefinition(row.template_id);
  const fallbackReason = metadata.fallbackReason ?? null;
  const fallbackUsed = metadata.resultSource === "fallback";
  const events: BuilderV3Event[] = [];

  if (metadata.phase) {
    events.push({
      code: `legacy_${metadata.phase}`,
      id: "legacy-1",
      message: row.summary ?? `Build is ${metadata.phase}.`,
      operation: "initial_build",
      phase: metadata.phase,
      timestamp: row.started_at,
      type: "status",
    });
  }

  if (row.status === "completed") {
    events.push({
      buildId: row.id,
      code: "preview_ready",
      fallbackReason,
      fallbackUsed,
      id: events.length === 0 ? "legacy-1" : "legacy-2",
      message: "Preview is ready for the studio client.",
      operation: "initial_build",
      payload: {
        source: metadata.resultSource ?? "ai",
      },
      previewEntryPath: row.preview_entry_path ?? template.previewEntryPath,
      projectId: row.project_id,
      timestamp: row.completed_at ?? row.started_at,
      type: "preview_ready",
    });
    events.push({
      buildId: row.id,
      code: "build_completed",
      fallbackReason,
      fallbackUsed,
      id: events.length === 1 ? "legacy-2" : "legacy-3",
      message: row.summary ?? "Build completed.",
      operation: "initial_build",
      payload: {
        source: metadata.resultSource ?? "ai",
      },
      projectId: row.project_id,
      timestamp: row.completed_at ?? row.started_at,
      type: "done",
    });
  }

  if (row.status === "failed" || row.status === "cancelled") {
    events.push({
      buildId: row.id,
      code: "build_failed",
      id: events.length === 0 ? "legacy-1" : "legacy-2",
      message: row.error ?? "Build failed.",
      operation: "initial_build",
      payload: {
        phase: metadata.phase ?? null,
      },
      projectId: row.project_id,
      timestamp: row.completed_at ?? row.started_at,
      type: "error",
    });
  }

  return {
    events,
    lastEventId: events.at(-1)?.id ?? null,
    previewReady: row.status === "completed",
    fallbackReason,
    fallbackUsed,
  };
}

export function readBuildMetadata(metadata: Record<string, unknown>): BuildRouteMetadata {
  const parsed = buildMetadataSchema.safeParse(metadata);
  return parsed.success ? parsed.data : {};
}

export function readBuildTraceMetadata(row: GenerationRow): BuilderV3TraceMetadata {
  const metadata = readBuildMetadata(isRecord(row.metadata) ? row.metadata : {});
  const trace = readBuilderTraceMetadataFromParsed(metadata);

  if (trace.events.length > 0 || trace.lastEventId || trace.previewReady || trace.fallbackUsed) {
    return {
      ...trace,
      fallbackReason: trace.fallbackReason ?? metadata.fallbackReason ?? null,
      fallbackUsed: trace.fallbackUsed || metadata.resultSource === "fallback",
      previewReady: trace.previewReady || row.status === "completed",
    };
  }

  return synthesizeBuilderTrace(row, metadata);
}

export function mapProjectRowToProject(row: ProjectRow): Project {
  const template = getTemplateDefinition(row.template);

  return {
    createdAt: row.created_at,
    id: row.id,
    name: row.name,
    orgId: row.org_id,
    previewEntryPath: template.previewEntryPath,
    status: row.status,
    templateId: row.template,
    updatedAt: row.updated_at,
  };
}

export function buildInitialBuildOutput(row: GenerationRow): InitialBuildOutput | null {
  if (row.status !== "completed") {
    return null;
  }

  return {
    files: row.files,
    generation: {
      id: row.id,
      operationId: row.operation_id,
      outputPaths: row.output_paths,
      status: row.status,
      summary: row.summary ?? undefined,
    },
    previewEntryPath:
      row.preview_entry_path ?? getTemplateDefinition(row.template_id).previewEntryPath,
    warnings: row.warnings,
  };
}

export function mapGenerationRowToBuild(row: GenerationRow) {
  const metadata = readBuildMetadata(row.metadata);

  return {
    completedAt: row.completed_at,
    error: row.error,
    id: row.id,
    phase: metadata.phase ?? null,
    projectId: row.project_id,
    source: metadata.resultSource ?? null,
    startedAt: row.started_at,
    status: row.status,
    summary: row.summary,
    templateId: row.template_id,
    templateReason: metadata.templateReason ?? null,
    workflowId: metadata.workflowId ?? null,
  };
}
