import { initialBuildOperation } from "@beomz-studio/operations";
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
  let selectedTemplateId = input.provisionalTemplateId;
  let selectedTemplateReason = "Template not yet selected.";
  let selectedTemplateScores: Record<string, number> = {};

  try {
    await persistBuildState({
      buildId: input.buildId,
      generationPatch: {
        metadata: {
          phase: "planner",
          planKeywords: plan.keywords,
          planSummary: plan.intentSummary,
        },
        status: "running",
        summary: `Planning initial build for ${plan.projectNameSuggestion}.`,
      },
      projectId: input.projectId,
      projectPatch: {
        name: plan.projectNameSuggestion,
        status: "building",
      },
    });

    const selection = await templateSelect({
      plan,
      prompt: input.prompt,
    });
    selectedTemplateId = selection.template.id;
    selectedTemplateReason = selection.reason;
    selectedTemplateScores = selection.scores;

    await persistBuildState({
      buildId: input.buildId,
      generationPatch: {
        metadata: {
          phase: "template-selector",
          templateReason: selection.reason,
          templateScores: selection.scores,
        },
        previewEntryPath: selection.template.previewEntryPath,
        summary: `Selected ${selection.template.name} template for the initial build.`,
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
        metadata: {
          phase: "generate",
        },
        summary: `Generating files for ${selection.template.name}.`,
      },
      projectId: input.projectId,
    });

    let source: BuildResultSource = "ai";
    let generationWarnings: string[] = [];
    let draft = await generateFiles({
      actor: input.actor,
      existingFiles: input.existingFiles,
      plan,
      project,
      prompt: input.prompt,
      template: selection.template,
    }).catch(async (error: unknown) => {
      source = "platform";
      generationWarnings = [
        `Model generation failed: ${toErrorMessage(error)}`,
      ];

      await persistBuildState({
        buildId: input.buildId,
        generationPatch: {
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

    await persistBuildState({
      buildId: input.buildId,
      generationPatch: {
        metadata: {
          phase: "validate",
        },
        summary:
          source === "ai"
            ? "Validating model-generated build output."
            : "Validating fallback scaffold output.",
      },
      projectId: input.projectId,
    });

    let validation = await validateBuild({
      draft,
      template: selection.template,
    });

    if (!validation.passed) {
      source = "platform";
      generationWarnings = [
        ...generationWarnings,
        ...validation.errors.map((error) => error.message),
      ];

      await persistBuildState({
        buildId: input.buildId,
        generationPatch: {
          metadata: {
            fallbackReason: validation.errors.map((error) => error.message).join("; "),
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
        reason: validation.errors.map((error) => error.message).join("; "),
        template: selection.template,
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
        completedAt: null,
        error: null,
        files: validation.files,
        metadata: {
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
        error: toErrorMessage(error),
        metadata: {
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
