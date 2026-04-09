import type { BuildResultSource, BuilderV3TracePatch, GenerateFilesProjectContext, InitialBuildPlan, InitialBuildWorkflowInput, GenerationStatus, ProjectStatus, StudioFile, TemplateDefinition, TemplateId } from "@beomz-studio/contracts";
export type { BuildResultSource, InitialBuildPlan, InitialBuildWorkflowInput, InitialBuildWorkflowResult, TemplateSelectionResult, } from "@beomz-studio/contracts";
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
export interface TemplateSelectActivityInput {
    prompt: string;
    plan: InitialBuildPlan;
}
export interface GenerateFilesActivityInput {
    buildId: string;
    prompt: string;
    plan: InitialBuildPlan;
    template: TemplateDefinition;
    actor: InitialBuildWorkflowInput["actor"];
    project: GenerateFilesProjectContext;
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
    project: GenerateFilesProjectContext;
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
