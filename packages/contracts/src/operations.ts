import type { Org, User } from "./auth.js";
import type { Generation, Project, StudioFile } from "./studio.js";
import type { TemplateDefinition, TemplateId } from "./templates.js";

export interface OperationWriteScope {
  allowedGlobs: readonly string[];
  deniedGlobs: readonly string[];
  immutableGlobs: readonly string[];
}

export interface OperationValidationStep {
  id: string;
  description: string;
  blocking: boolean;
}

export interface OperationActor {
  user: Pick<User, "id" | "email" | "platformUserId">;
  org: Pick<Org, "id" | "name" | "plan">;
}

export interface OperationContract<TInput = unknown, TOutput = unknown> {
  id: string;
  version: number;
  owner: "platform" | "ai";
  description: string;
  allowedTemplates: readonly TemplateId[];
  writeScope: OperationWriteScope;
  validations: readonly OperationValidationStep[];
  examples?: readonly string[];
  inputSample?: TInput;
  outputSample?: TOutput;
}

export interface InitialBuildInput {
  prompt: string;
  project: Project;
  template: TemplateDefinition;
  actor: OperationActor;
  existingFiles: readonly StudioFile[];
}

export interface InitialBuildOutput {
  generation: Pick<Generation, "id" | "operationId" | "status" | "summary" | "outputPaths"> & {
    changedPaths?: readonly string[];
  };
  files: readonly StudioFile[];
  previewEntryPath: string;
  warnings: readonly string[];
}
