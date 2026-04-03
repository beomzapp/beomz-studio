import type { InitialBuildOutput, Project } from "@beomz-studio/contracts";
import type { GenerationRow, ProjectRow } from "@beomz-studio/studio-db";
import { getTemplateDefinition } from "@beomz-studio/templates";
import { z } from "zod";

export const startBuildRequestSchema = z.object({
  prompt: z.string().trim().min(8).max(4000),
  projectName: z.string().trim().min(1).max(120).optional(),
});

const buildMetadataSchema = z
  .object({
    fallbackReason: z.string().optional(),
    phase: z.string().optional(),
    planKeywords: z.array(z.string()).optional(),
    planSummary: z.string().optional(),
    resultSource: z.enum(["ai", "fallback", "error"]).optional(),
    selectedTemplateId: z.string().optional(),
    startError: z.string().optional(),
    templateReason: z.string().optional(),
    templateScores: z.record(z.number()).optional(),
    validationWarnings: z.array(z.string()).optional(),
    workflowId: z.string().optional(),
  })
  .passthrough();

export type BuildRouteMetadata = z.infer<typeof buildMetadataSchema>;

export function readBuildMetadata(metadata: Record<string, unknown>): BuildRouteMetadata {
  const parsed = buildMetadataSchema.safeParse(metadata);
  return parsed.success ? parsed.data : {};
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
