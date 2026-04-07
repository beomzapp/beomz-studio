import type {
  BuilderV3TracePatch,
  FileSource,
  GenerationStatus,
  InitialBuildOutput,
  OperationActor,
  Project,
  ProjectStatus,
  StudioFile,
  TemplateDefinition,
  TemplateId,
} from "@beomz-studio/contracts";

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

export interface GeneratedBuildDraft {
  files: readonly StudioFile[];
  changedPaths?: readonly string[];
  previewEntryPath: string;
  summary: string;
  warnings: readonly string[];
  source: BuildResultSource;
  assistantResponseText?: string;
  assistantResponsesByPage?: readonly {
    pageId: string;
    text: string;
  }[];
}

export interface ValidationIssue {
  code: string;
  message: string;
  path?: string;
  validationId?: string;
}

export interface BuildValidationResult {
  passed: boolean;
  files: readonly StudioFile[];
  outputPaths: readonly string[];
  warnings: readonly string[];
  errors: readonly ValidationIssue[];
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

export interface TemplateSelectActivityInput {
  prompt: string;
  plan: InitialBuildPlan;
}

export interface GenerateFilesActivityInput {
  buildId: string;
  prompt: string;
  plan: InitialBuildPlan;
  template: TemplateDefinition;
  actor: OperationActor;
  project: Pick<Project, "id" | "name" | "templateId" | "previewEntryPath" | "status" | "orgId">;
  existingFiles: readonly StudioFile[];
}

export interface ValidateBuildActivityInput {
  template: TemplateDefinition;
  draft: GeneratedBuildDraft;
}

export interface FallbackScaffoldActivityInput {
  prompt: string;
  plan: InitialBuildPlan;
  template: TemplateDefinition;
  project: Pick<Project, "id" | "name" | "templateId" | "previewEntryPath" | "status" | "orgId">;
  reason: string;
}

export interface PersistProjectPatch {
  name?: string;
  status?: ProjectStatus;
  template?: TemplateId;
}

export interface PersistGenerationPatch {
  status?: GenerationStatus;
  templateId?: TemplateId;
  summary?: string;
  error?: string | null;
  outputPaths?: readonly string[];
  previewEntryPath?: string;
  warnings?: readonly string[];
  files?: readonly StudioFile[];
  metadata?: Record<string, unknown>;
  completedAt?: string | null;
  builderTracePatch?: BuilderV3TracePatch;
}

export interface PersistBuildStateActivityInput {
  buildId: string;
  projectId: string;
  projectPatch?: PersistProjectPatch;
  generationPatch?: PersistGenerationPatch;
}
