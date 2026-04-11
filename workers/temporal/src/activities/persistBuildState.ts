import { setTimeout as delay } from "node:timers/promises";

import {
  createEmptyBuilderV3TraceMetadata,
  type BuilderV3TraceMetadata,
} from "@beomz-studio/contracts";
import { projectIterationOperation } from "@beomz-studio/operations";
import {
  createStudioDbClient,
  type ProjectUpdate,
  type StudioDbClient,
} from "@beomz-studio/studio-db";

import type { PersistBuildStateActivityInput } from "../shared/types.js";

const TEMPLATE_SCHEMA_CACHE_RETRY_DELAY_MS = 750;

type PersistBuildStateDb = Pick<
  StudioDbClient,
  | "findGenerationById"
  | "listGenerationsByProjectId"
  | "updateGeneration"
  | "updateProject"
  | "upsertBuildTelemetry"
>;

interface PersistBuildStateDependencies {
  db: PersistBuildStateDb;
  logger?: Pick<Console, "warn">;
  wait?: (ms: number) => Promise<void>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(metadata: Record<string, unknown>, key: string): string | null {
  const value = metadata[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readNumber(metadata: Record<string, unknown>, key: string): number | null {
  const value = metadata[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isTemplateSchemaCacheError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return message.includes("schema cache") && message.includes("template");
}

function buildProjectUpdatePatch(
  projectPatch: PersistBuildStateActivityInput["projectPatch"],
): ProjectUpdate {
  if (!projectPatch) {
    return {};
  }

  return {
    ...(projectPatch.name !== undefined ? { name: projectPatch.name } : {}),
    ...(projectPatch.status !== undefined ? { status: projectPatch.status } : {}),
    ...(projectPatch.template !== undefined && projectPatch.template !== null
      ? { template: projectPatch.template }
      : {}),
  };
}

function hasProjectUpdateFields(patch: ProjectUpdate): boolean {
  return Object.keys(patch).length > 0;
}

async function updateProjectSafely(
  db: PersistBuildStateDb,
  input: PersistBuildStateActivityInput,
  projectId: string,
  projectPatch: ProjectUpdate,
  wait: (ms: number) => Promise<void>,
  logger?: Pick<Console, "warn">,
): Promise<void> {
  if (!hasProjectUpdateFields(projectPatch)) {
    return;
  }

  const warnMissingProject = () => {
    logger?.warn(
      [
        `persistBuildState: skipped project update for build ${input.buildId}.`,
        `No project row matched projectId=${projectId}.`,
        `Workflow input projectId=${input.projectId}.`,
      ].join(" "),
    );
  };

  const applyProjectPatch = async (patch: ProjectUpdate): Promise<boolean> => {
    const updatedProject = await db.updateProject(projectId, patch);
    if (!updatedProject) {
      warnMissingProject();
      return false;
    }

    return true;
  };

  try {
    await applyProjectPatch(projectPatch);
    return;
  } catch (error) {
    if (!("template" in projectPatch) || !isTemplateSchemaCacheError(error)) {
      throw error;
    }
  }

  await wait(TEMPLATE_SCHEMA_CACHE_RETRY_DELAY_MS);

  try {
    const didRetrySucceed = await applyProjectPatch(projectPatch);
    if (didRetrySucceed) {
      return;
    }
  } catch (retryError) {
    if (!isTemplateSchemaCacheError(retryError)) {
      throw retryError;
    }
  }

  const { template: _ignoredTemplate, ...patchWithoutTemplate } = projectPatch;
  if (!hasProjectUpdateFields(patchWithoutTemplate)) {
    logger?.warn(
      `persistBuildState: skipped template-only project update for build ${input.buildId} because the PostgREST schema cache is stale.`,
    );
    return;
  }

  const didFallbackSucceed = await applyProjectPatch(patchWithoutTemplate);
  if (didFallbackSucceed) {
    logger?.warn(
      `persistBuildState: retried project update for build ${input.buildId} without the template column because the PostgREST schema cache is stale.`,
    );
  }
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

function buildTelemetryFallbackReason(
  generation: Awaited<ReturnType<PersistBuildStateDb["updateGeneration"]>>,
  metadata: Record<string, unknown>,
): string | null {
  const telemetryFallbackReason = readString(metadata, "telemetryFallbackReason");
  if (telemetryFallbackReason) {
    return telemetryFallbackReason;
  }

  const fallbackTriggerReason = readString(metadata, "fallbackTriggerReason");
  const fallbackReason = readString(metadata, "fallbackReason");

  if (fallbackTriggerReason && fallbackReason) {
    return `${fallbackTriggerReason}: ${fallbackReason}`;
  }

  if (fallbackReason) {
    return fallbackReason;
  }

  if (generation.status === "failed" && generation.error) {
    return `build_failed: ${generation.error}`;
  }

  return null;
}

function buildTelemetryErrorLog(
  generation: Awaited<ReturnType<PersistBuildStateDb["updateGeneration"]>>,
  metadata: Record<string, unknown>,
  fallbackReason: string | null,
): Record<string, unknown> | null {
  const generateFilesError = metadata.generateFilesError;
  const hasGenerateFilesError = isRecord(generateFilesError);

  if (!generation.error && !fallbackReason && !hasGenerateFilesError) {
    return null;
  }

  return {
    fallbackReason,
    fallbackTriggerReason: readString(metadata, "fallbackTriggerReason"),
    generateFilesError: hasGenerateFilesError ? generateFilesError : null,
    generationError: generation.error,
    resultSource: readString(metadata, "resultSource"),
    status: generation.status,
  };
}

function shouldPersistTelemetry(status: string | undefined): boolean {
  return status === "completed" || status === "failed" || status === "cancelled";
}

async function persistBuildTelemetryRow(
  db: PersistBuildStateDb,
  generation: Awaited<ReturnType<PersistBuildStateDb["updateGeneration"]>>,
  metadata: Record<string, unknown>,
): Promise<void> {
  const userId = readString(metadata, "userId");

  const generations = await db.listGenerationsByProjectId(generation.project_id);
  const currentGenerationIndex = generations.findIndex((row) => row.id === generation.id);
  const iterationCount = currentGenerationIndex > 0
    ? currentGenerationIndex
    : Math.max(0, generations.length - 1);
  const fallbackReason = buildTelemetryFallbackReason(generation, metadata);
  const generationTimeMs = (() => {
    const startedAtMs = Date.parse(generation.started_at);
    const completedAtMs = Date.parse(
      generation.completed_at ?? new Date().toISOString(),
    );

    if (Number.isNaN(startedAtMs) || Number.isNaN(completedAtMs)) {
      return readNumber(metadata, "generateFilesDurationMs");
    }

    return Math.max(0, completedAtMs - startedAtMs);
  })();
  const resultSource = readString(metadata, "resultSource");

  await db.upsertBuildTelemetry({
    id: generation.id,
    project_id: generation.project_id,
    user_id: userId ?? null,
    prompt: readString(metadata, "sourcePrompt") ?? generation.prompt,
    template_used: generation.template_id,
    palette_used: readString(metadata, "paletteUsed"),
    files_generated: generation.files.length,
    succeeded: generation.status === "completed" && resultSource !== "fallback" && resultSource !== "error",
    fallback_reason: fallbackReason,
    error_log: buildTelemetryErrorLog(generation, metadata, fallbackReason),
    generation_time_ms: generationTimeMs,
    credits_used: readNumber(metadata, "creditsUsed") ?? 0,
    user_iterated: generation.operation_id === projectIterationOperation.id,
    iteration_count: iterationCount,
    model_used: readString(metadata, "modelUsed"),
  });
}

export async function persistBuildStateWithClient(
  input: PersistBuildStateActivityInput,
  {
    db,
    logger,
    wait = async (ms) => {
      await delay(ms);
    },
  }: PersistBuildStateDependencies,
): Promise<void> {
  const currentGeneration = await db.findGenerationById(input.buildId);
  if (!currentGeneration) {
    throw new Error(`Build ${input.buildId} does not exist in the studio database.`);
  }

  const resolvedProjectId = currentGeneration.project_id;
  if (resolvedProjectId !== input.projectId) {
    logger?.warn(
      [
        `persistBuildState: build ${input.buildId} received projectId=${input.projectId}`,
        `but generation ${input.buildId} is linked to projectId=${resolvedProjectId}.`,
        "Using the generation row as the source of truth.",
      ].join(" "),
    );
  }

  if (input.projectPatch) {
    await updateProjectSafely(
      db,
      input,
      resolvedProjectId,
      buildProjectUpdatePatch(input.projectPatch),
      wait,
      logger,
    );
  }

  if (!input.generationPatch) {
    return;
  }

  const currentMetadata = isRecord(currentGeneration.metadata) ? currentGeneration.metadata : {};
  const mergedMetadata = input.generationPatch.metadata
    ? {
        ...currentMetadata,
        ...input.generationPatch.metadata,
      }
    : { ...currentMetadata };

  if (input.generationPatch.builderTracePatch) {
    const currentTrace = readBuilderTraceMetadata(currentMetadata);
    const appendedEvents = input.generationPatch.builderTracePatch.appendEvents ?? [];
    const lastAppendedEvent = appendedEvents.at(-1);

    mergedMetadata.builderTrace = {
      events: [...currentTrace.events, ...appendedEvents],
      lastEventId:
        lastAppendedEvent?.id
        ?? currentTrace.lastEventId,
      previewReady:
        input.generationPatch.builderTracePatch.previewReady ?? currentTrace.previewReady,
      fallbackReason:
        input.generationPatch.builderTracePatch.fallbackReason ?? currentTrace.fallbackReason,
      fallbackUsed:
        input.generationPatch.builderTracePatch.fallbackUsed ?? currentTrace.fallbackUsed,
    } satisfies BuilderV3TraceMetadata;
  }

  const updatedGeneration = await db.updateGeneration(input.buildId, {
    completed_at:
      input.generationPatch.completedAt
      ?? ((input.generationPatch.status === "completed" || input.generationPatch.status === "failed")
        ? new Date().toISOString()
        : undefined),
    error: input.generationPatch.error,
    files: input.generationPatch.files,
    metadata: mergedMetadata,
    output_paths: input.generationPatch.outputPaths,
    preview_entry_path: input.generationPatch.previewEntryPath,
    status: input.generationPatch.status,
    summary: input.generationPatch.summary,
    template_id: input.generationPatch.templateId,
    warnings: input.generationPatch.warnings,
  });

  if (shouldPersistTelemetry(input.generationPatch.status)) {
    try {
      await persistBuildTelemetryRow(db, updatedGeneration, mergedMetadata);
    } catch (e) {
      // telemetry must never crash a build
      logger?.warn("Telemetry write failed (non-fatal):", e);
    }
  }
}

export async function persistBuildState(
  input: PersistBuildStateActivityInput,
): Promise<void> {
  await persistBuildStateWithClient(input, {
    db: createStudioDbClient(),
    logger: console,
  });
}
