import { createStudioDbClient } from "@beomz-studio/studio-db";

import type { PersistBuildStateActivityInput } from "../shared/types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function persistBuildState(
  input: PersistBuildStateActivityInput,
): Promise<void> {
  const db = createStudioDbClient();

  if (input.projectPatch) {
    await db.updateProject(input.projectId, {
      name: input.projectPatch.name,
      status: input.projectPatch.status,
      template: input.projectPatch.template,
    });
  }

  if (!input.generationPatch) {
    return;
  }

  const currentGeneration = await db.findGenerationById(input.buildId);
  if (!currentGeneration) {
    throw new Error(`Build ${input.buildId} does not exist in the studio database.`);
  }

  const mergedMetadata = input.generationPatch.metadata
    ? {
        ...(isRecord(currentGeneration.metadata) ? currentGeneration.metadata : {}),
        ...input.generationPatch.metadata,
      }
    : currentGeneration.metadata;

  await db.updateGeneration(input.buildId, {
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
}
