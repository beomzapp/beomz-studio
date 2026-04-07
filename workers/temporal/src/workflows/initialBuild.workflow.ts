import type {
  BuilderV3AssistantDeltaEvent,
  BuilderV3DoneEvent,
  BuilderV3ErrorEvent,
  BuilderV3Event,
  BuilderV3PreviewReadyEvent,
  BuilderV3StatusEvent,
  BuilderV3ToolResultEvent,
  BuilderV3ToolUseProgressEvent,
  BuilderV3ToolUseStartedEvent,
  BuilderV3TracePatch,
} from "@beomz-studio/contracts";
import { initialBuildOperation } from "@beomz-studio/operations";
import { getTemplateDefinition } from "@beomz-studio/templates";
import { proxyActivities } from "@temporalio/workflow";

import { createInitialBuildPlan } from "../shared/planner.js";
import type {
  BuildResultSource,
  InitialBuildWorkflowInput,
  InitialBuildWorkflowResult,
} from "../shared/types.js";
import type * as activities from "../activities/index.js";

const {
  createFallbackScaffold,
  generateFiles,
  persistBuildState,
  templateSelect,
  validateBuild,
} = proxyActivities<typeof activities>({
  retry: {
    maximumAttempts: 2,
  },
  startToCloseTimeout: 300_000,
});

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown workflow error.";
}

export async function initialBuildWorkflow(
  input: InitialBuildWorkflowInput,
): Promise<InitialBuildWorkflowResult> {
  const plan = createInitialBuildPlan(input.prompt, input.projectName);
  const isIteration = input.existingFiles.length > 0;
  let eventSequence = 1;
  let fallbackReason: string | null = null;
  let fallbackUsed = false;
  let selectedTemplateId = input.provisionalTemplateId;
  let selectedTemplateReason = "Template not yet selected.";
  let selectedTemplateScores: Record<string, number> = {};

  type BuilderV3EventInput =
    | Omit<BuilderV3AssistantDeltaEvent, "id" | "operation" | "timestamp">
    | Omit<BuilderV3DoneEvent, "id" | "operation" | "timestamp">
    | Omit<BuilderV3ErrorEvent, "id" | "operation" | "timestamp">
    | Omit<BuilderV3PreviewReadyEvent, "id" | "operation" | "timestamp">
    | Omit<BuilderV3StatusEvent, "id" | "operation" | "timestamp">
    | Omit<BuilderV3ToolResultEvent, "id" | "operation" | "timestamp">
    | Omit<BuilderV3ToolUseProgressEvent, "id" | "operation" | "timestamp">
    | Omit<BuilderV3ToolUseStartedEvent, "id" | "operation" | "timestamp">;

  const createTraceEvent = (
    event: BuilderV3EventInput,
  ): BuilderV3Event => ({
    ...event,
    id: String(++eventSequence),
    operation: "initial_build",
    timestamp: new Date().toISOString(),
  });

  const createTracePatch = (
    events: ReadonlyArray<BuilderV3EventInput>,
    patch: Omit<BuilderV3TracePatch, "appendEvents"> = {},
  ): BuilderV3TracePatch => ({
    ...patch,
    appendEvents: events.map((event) => createTraceEvent(event)),
  });

  try {
    await persistBuildState({
      buildId: input.buildId,
      generationPatch: {
        builderTracePatch: createTracePatch([
          {
            type: "status",
            code: "planner_started",
            message: isIteration
              ? `Planning requested changes for ${plan.projectNameSuggestion}.`
              : `Planning initial build for ${plan.projectNameSuggestion}.`,
            phase: "planner",
          },
          {
            type: "tool_use_started",
            tool_use_id: "tool-plan-blueprint-1",
            tool_name: "plan_blueprint",
            code: "plan_blueprint_started",
            message: isIteration
              ? "Creating an edit blueprint from the latest user request."
              : "Creating the initial build blueprint from the prompt.",
            payload: {
              keywordCount: plan.keywords.length,
            },
          },
          {
            type: "tool_result",
            tool_use_id: "tool-plan-blueprint-1",
            tool_name: "plan_blueprint",
            code: "plan_blueprint_completed",
            message: isIteration
              ? "Edit blueprint is ready."
              : "Initial build blueprint is ready.",
            payload: {
              keywords: [...plan.keywords],
              suggestedProjectName: plan.projectNameSuggestion,
            },
            status: "success",
          },
        ]),
        metadata: {
          phase: "planner",
          planKeywords: plan.keywords,
          planSummary: plan.intentSummary,
        },
        status: "running",
        summary: isIteration
          ? `Planning requested changes for ${plan.projectNameSuggestion}.`
          : `Planning initial build for ${plan.projectNameSuggestion}.`,
      },
      projectId: input.projectId,
      projectPatch: {
        name: plan.projectNameSuggestion,
        status: "building",
      },
    });

    await persistBuildState({
      buildId: input.buildId,
      generationPatch: {
        builderTracePatch: createTracePatch([
          {
            type: "status",
            code: "template_selection_started",
            message: isIteration
              ? "Reusing the existing project template for this iteration."
              : "Selecting the best template for this build.",
            phase: "template-selector",
          },
          {
            type: "tool_use_started",
            tool_use_id: "tool-template-select-1",
            tool_name: "template_select",
            code: "template_select_started",
            message: isIteration
              ? "Reusing the current project template."
              : "Evaluating templates against the build plan.",
            payload: {
              mode: isIteration ? "iteration" : "initial_build",
              provisionalTemplateId: input.provisionalTemplateId ?? null,
            },
          },
        ]),
        metadata: {
          phase: "template-selector",
        },
        summary: "Selecting the best template for the initial build.",
      },
      projectId: input.projectId,
    });

    if (isIteration && !input.provisionalTemplateId) {
      throw new Error("Iteration builds require a provisional template id.");
    }

    const selection = isIteration
      ? (() => {
          const iterationTemplateId = input.provisionalTemplateId;
          if (!iterationTemplateId) {
            throw new Error("Iteration builds require a provisional template id.");
          }

          return {
            reason: "Reusing the existing project template for this iteration request.",
            scores: { [iterationTemplateId]: 1 },
            template: getTemplateDefinition(iterationTemplateId),
          };
        })()
      : await templateSelect({
          plan,
          prompt: input.prompt,
        });
    selectedTemplateId = selection.template.id;
    selectedTemplateReason = selection.reason;
    selectedTemplateScores = selection.scores;

    await persistBuildState({
      buildId: input.buildId,
      generationPatch: {
        builderTracePatch: createTracePatch([
          {
            type: "tool_result",
            tool_use_id: "tool-template-select-1",
            tool_name: "template_select",
            code: "template_select_completed",
            message: isIteration
              ? `Reusing ${selection.template.name} as the current project template.`
              : `Selected ${selection.template.name} as the starting template.`,
            payload: {
              reason: selection.reason,
              scores: selection.scores,
              templateId: selection.template.id,
            },
            status: "success",
          },
        ]),
        metadata: {
          phase: "template-selector",
          templateReason: selection.reason,
          templateScores: selection.scores,
        },
        previewEntryPath: selection.template.previewEntryPath,
        summary: isIteration
          ? `Reusing ${selection.template.name} template for the requested changes.`
          : `Selected ${selection.template.name} template for the initial build.`,
        templateId: selection.template.id,
      },
      projectId: input.projectId,
      projectPatch: {
        name: plan.projectNameSuggestion,
        status: "building",
        template: selection.template.id,
      },
    });

    const project = {
      id: input.projectId,
      name: plan.projectNameSuggestion,
      orgId: input.actor.org.id,
      previewEntryPath: selection.template.previewEntryPath,
      status: "building" as const,
      templateId: selection.template.id,
    };

    await persistBuildState({
      buildId: input.buildId,
      generationPatch: {
        builderTracePatch: createTracePatch([
          {
            type: "status",
            code: "generation_started",
            message: isIteration
              ? `Applying requested changes to ${plan.projectNameSuggestion}.`
              : `Generating files for ${selection.template.name}.`,
            phase: "generate",
          },
          {
            type: "tool_use_started",
            tool_use_id: "tool-generate-files-1",
            tool_name: "generate_files",
            code: "generate_files_started",
            message: isIteration
              ? "Editing the current project files."
              : "Generating the initial file set.",
            payload: {
              mode: isIteration ? "iteration" : "initial_build",
              templateId: selection.template.id,
            },
          },
        ]),
        metadata: {
          phase: "generate",
        },
        summary: isIteration
          ? `Applying requested changes to ${plan.projectNameSuggestion}.`
          : `Generating files for ${selection.template.name}.`,
      },
      projectId: input.projectId,
    });

    let source: BuildResultSource = "ai";
    let generationWarnings: string[] = [];
    let draft = await generateFiles({
      actor: input.actor,
      buildId: input.buildId,
      existingFiles: input.existingFiles,
      plan,
      project,
      prompt: input.prompt,
      template: selection.template,
    }).catch(async (error: unknown) => {
      if (isIteration) {
        throw error;
      }

      source = "platform";
      fallbackUsed = true;
      fallbackReason = toErrorMessage(error);
      generationWarnings = [`Model generation failed: ${toErrorMessage(error)}`];

      await persistBuildState({
        buildId: input.buildId,
        generationPatch: {
          builderTracePatch: createTracePatch(
            [
              {
                type: "tool_result",
                tool_use_id: "tool-generate-files-1",
                tool_name: "generate_files",
                code: "generate_files_failed",
                message: "Model generation failed, switching to the fallback scaffold.",
                payload: {
                  reason: toErrorMessage(error),
                },
                status: "error",
              },
              {
                type: "status",
                code: "fallback_started",
                message: "Switching to the fallback scaffold after model generation failed.",
                phase: "fallback",
              },
              {
                type: "tool_use_started",
                tool_use_id: "tool-fallback-scaffold-1",
                tool_name: "fallback_scaffold",
                code: "fallback_scaffold_started",
                message: "Creating the deterministic fallback scaffold.",
                payload: {
                  reason: toErrorMessage(error),
                },
              },
            ],
            {
              fallbackReason,
              fallbackUsed: true,
            },
          ),
          metadata: {
            fallbackReason: toErrorMessage(error),
            phase: "fallback",
            resultSource: "fallback",
          },
          summary: "Model generation failed, switching to the fallback scaffold.",
        },
        projectId: input.projectId,
      });

      return createFallbackScaffold({
        plan,
        project,
        prompt: input.prompt,
        reason: toErrorMessage(error),
        template: selection.template,
      });
    });

    if (source === "ai") {
      await persistBuildState({
        buildId: input.buildId,
        generationPatch: {
          builderTracePatch: createTracePatch([
            {
              type: "tool_result",
              tool_use_id: "tool-generate-files-1",
              tool_name: "generate_files",
              code: "generate_files_completed",
              message: "Initial files generated successfully.",
              payload: {
                fileCount: draft.files.length,
              },
              status: "success",
            },
            {
              type: "status",
              code: "validation_started",
              message: "Validating the generated build output.",
              phase: "validate",
            },
            {
              type: "tool_use_started",
              tool_use_id: "tool-validate-build-1",
              tool_name: "validate_build",
              code: "validate_build_started",
              message: "Checking the generated files before preview launch.",
              payload: {
                source: "ai",
              },
            },
          ]),
          metadata: {
            phase: "validate",
          },
          summary: "Validating model-generated build output.",
        },
        projectId: input.projectId,
      });
    } else {
      await persistBuildState({
        buildId: input.buildId,
        generationPatch: {
          builderTracePatch: createTracePatch(
            [
              {
                type: "tool_result",
                tool_use_id: "tool-fallback-scaffold-1",
                tool_name: "fallback_scaffold",
                code: "fallback_scaffold_completed",
                message: "Fallback scaffold is ready for validation.",
                payload: {
                  fileCount: draft.files.length,
                },
                status: "success",
              },
              {
                type: "status",
                code: "validation_started",
                message: "Validating the fallback scaffold output.",
                phase: "validate",
              },
              {
                type: "tool_use_started",
                tool_use_id: "tool-validate-build-2",
                tool_name: "validate_build",
                code: "validate_build_started",
                message: "Checking the fallback scaffold before preview launch.",
                payload: {
                  source: "fallback",
                },
              },
            ],
            {
              fallbackReason,
              fallbackUsed: true,
            },
          ),
          metadata: {
            phase: "validate",
          },
          summary: "Validating fallback scaffold output.",
        },
        projectId: input.projectId,
      });
    }

    let validation = await validateBuild({
      draft,
      template: selection.template,
    });

    if (!validation.passed) {
      if (isIteration) {
        throw new Error(
          `Edited build failed validation: ${validation.errors
            .map((error) => error.message)
            .join("; ")}`,
        );
      }

      const failedValidationToolUseId =
        source === "ai" ? "tool-validate-build-1" : "tool-validate-build-2";
      source = "platform";
      fallbackUsed = true;
      fallbackReason = validation.errors.map((error) => error.message).join("; ");
      generationWarnings = [
        ...generationWarnings,
        ...validation.errors.map((error) => error.message),
      ];

      await persistBuildState({
        buildId: input.buildId,
        generationPatch: {
          builderTracePatch: createTracePatch(
            [
              {
                type: "tool_result",
                tool_use_id: failedValidationToolUseId,
                tool_name: "validate_build",
                code: "validate_build_failed",
                message: "Validation failed, switching to the fallback scaffold instead.",
                payload: {
                  errors: validation.errors.map((error) => error.message),
                },
                status: "error",
              },
              {
                type: "status",
                code: "fallback_started",
                message: "Validation failed, creating the deterministic fallback scaffold.",
                phase: "fallback",
              },
              {
                type: "tool_use_started",
                tool_use_id: "tool-fallback-scaffold-1",
                tool_name: "fallback_scaffold",
                code: "fallback_scaffold_started",
                message: "Creating the deterministic fallback scaffold.",
                payload: {
                  reason: validation.errors.map((error) => error.message),
                },
              },
            ],
            {
              fallbackReason,
              fallbackUsed: true,
            },
          ),
          metadata: {
            fallbackReason,
            phase: "fallback",
            resultSource: "fallback",
          },
          summary: "Validation failed, generating a fallback scaffold instead.",
        },
        projectId: input.projectId,
      });

      draft = await createFallbackScaffold({
        plan,
        project,
        prompt: input.prompt,
        reason: fallbackReason,
        template: selection.template,
      });

      await persistBuildState({
        buildId: input.buildId,
        generationPatch: {
          builderTracePatch: createTracePatch(
            [
              {
                type: "tool_result",
                tool_use_id: "tool-fallback-scaffold-1",
                tool_name: "fallback_scaffold",
                code: "fallback_scaffold_completed",
                message: "Fallback scaffold is ready for validation.",
                payload: {
                  fileCount: draft.files.length,
                },
                status: "success",
              },
              {
                type: "status",
                code: "validation_started",
                message: "Re-validating the fallback scaffold output.",
                phase: "validate",
              },
              {
                type: "tool_use_started",
                tool_use_id: "tool-validate-build-2",
                tool_name: "validate_build",
                code: "validate_build_started",
                message: "Checking the fallback scaffold before preview launch.",
                payload: {
                  source: "fallback",
                },
              },
            ],
            {
              fallbackReason,
              fallbackUsed: true,
            },
          ),
          metadata: {
            phase: "validate",
            resultSource: "fallback",
          },
          summary: "Validating fallback scaffold output.",
        },
        projectId: input.projectId,
      });

      validation = await validateBuild({
        draft,
        template: selection.template,
      });

      if (!validation.passed) {
        throw new Error(
          `Fallback scaffold failed validation: ${validation.errors
            .map((error) => error.message)
            .join("; ")}`,
        );
      }
    }

    const warnings = Array.from(
      new Set([
        ...generationWarnings,
        ...draft.warnings,
        ...validation.warnings,
      ]),
    );

    const result: InitialBuildWorkflowResult = {
      files: validation.files,
      generation: {
        id: input.buildId,
        operationId: initialBuildOperation.id,
        outputPaths: validation.outputPaths,
        status: "completed",
        summary: draft.summary,
      },
      previewEntryPath: selection.template.previewEntryPath,
      source,
      template: selection.template,
      validationWarnings: validation.warnings,
      warnings,
    };

    await persistBuildState({
      buildId: input.buildId,
      generationPatch: {
        builderTracePatch: createTracePatch(
          [
            {
              type: "tool_result",
              tool_use_id:
                source === "platform" ? "tool-validate-build-2" : "tool-validate-build-1",
              tool_name: "validate_build",
              code: "validate_build_completed",
              message:
                source === "platform"
                  ? "Fallback scaffold passed validation."
                  : "Generated build passed validation.",
              payload: {
                warningCount: validation.warnings.length,
              },
              status: "success",
            },
            {
              type: "tool_use_started",
              tool_use_id: "tool-persist-build-state-1",
              tool_name: "persist_build_state",
              code: "persist_build_state_started",
              message: "Persisting the validated files and preview metadata.",
              payload: {
                outputPathCount: validation.outputPaths.length,
              },
            },
            {
              type: "tool_result",
              tool_use_id: "tool-persist-build-state-1",
              tool_name: "persist_build_state",
              code: "persist_build_state_completed",
              message: "Persisted the validated build state.",
              payload: {
                outputPathCount: validation.outputPaths.length,
              },
              status: "success",
            },
            {
              type: "preview_ready",
              buildId: input.buildId,
              code: "preview_ready",
              fallbackReason,
              fallbackUsed,
              message: "Preview is ready for the studio client.",
              payload: {
                source,
                warningCount: warnings.length,
              },
              previewEntryPath: selection.template.previewEntryPath,
              projectId: input.projectId,
            },
            {
              type: "done",
              buildId: input.buildId,
              code: "build_completed",
              fallbackReason,
              fallbackUsed,
              message: draft.summary,
              payload: {
                source,
                warningCount: warnings.length,
              },
              projectId: input.projectId,
            },
          ],
          {
            fallbackReason,
            fallbackUsed,
            previewReady: true,
          },
        ),
        completedAt: null,
        error: null,
        files: validation.files,
        metadata: {
          assistantResponseText: draft.assistantResponseText,
          assistantResponsesByPage: draft.assistantResponsesByPage,
          fallbackReason,
          phase: source === "platform" ? "fallback-completed" : "completed",
          resultSource: source === "platform" ? "fallback" : "ai",
          templateReason: selectedTemplateReason,
          templateScores: selectedTemplateScores,
          validationWarnings: validation.warnings,
        },
        outputPaths: validation.outputPaths,
        previewEntryPath: selection.template.previewEntryPath,
        status: "completed",
        summary: draft.summary,
        templateId: selection.template.id,
        warnings,
      },
      projectId: input.projectId,
      projectPatch: {
        name: plan.projectNameSuggestion,
        status: "ready",
        template: selection.template.id,
      },
    });

    return result;
  } catch (error) {
    await persistBuildState({
      buildId: input.buildId,
      generationPatch: {
        builderTracePatch: createTracePatch(
          [
            {
              type: "error",
              buildId: input.buildId,
              code: "build_failed",
              message: toErrorMessage(error),
              payload: {
                selectedTemplateId,
              },
              projectId: input.projectId,
            },
          ],
          {
            fallbackReason,
            fallbackUsed,
          },
        ),
        error: toErrorMessage(error),
        metadata: {
          fallbackReason,
          phase: "failed",
          resultSource: "error",
          selectedTemplateId,
        },
        status: "failed",
      },
      projectId: input.projectId,
      projectPatch: {
        status: "draft",
        template: selectedTemplateId,
      },
    });

    throw error;
  }
}
