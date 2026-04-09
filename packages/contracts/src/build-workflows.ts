import type { InitialBuildOutput, OperationActor } from "./operations.js";
import type { FileSource, Project, StudioFile } from "./studio.js";
import type { TemplateDefinition, TemplateId } from "./templates.js";

export type BuildResultSource = Extract<FileSource, "ai" | "platform">;

export interface InitialBuildPlan {
  normalizedPrompt: string;
  projectNameSuggestion: string;
  intentSummary: string;
  keywords: readonly string[];
}

export interface TemplateSelectionResult {
  template: TemplateDefinition;
  reason: string;
  scores: Record<TemplateId, number>;
}

export interface InitialBuildWorkflowInput {
  buildId: string;
  projectId: string;
  actor: OperationActor;
  prompt: string;
  projectName: string;
  requestedAt: string;
  existingFiles: readonly StudioFile[];
  provisionalTemplateId?: TemplateId;
}

export interface InitialBuildWorkflowResult extends InitialBuildOutput {
  template: TemplateDefinition;
  source: BuildResultSource;
  validationWarnings: readonly string[];
}

export interface GenerateFilesProjectContext
  extends Pick<Project, "id" | "name" | "templateId" | "previewEntryPath" | "status" | "orgId"> {}
