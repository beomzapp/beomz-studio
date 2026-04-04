import { randomUUID } from "node:crypto";

import { initialBuildOperation } from "@beomz-studio/operations";
import {
  INITIAL_BUILD_WORKFLOW_TYPE,
  buildInitialBuildWorkflowId,
  buildProjectNameFromPrompt,
  getInitialBuildTaskQueue,
  getTemporalClient,
  selectInitialBuildTemplate,
} from "@beomz-studio/temporal-worker";
import { Hono } from "hono";

import { loadOrgContext } from "../../middleware/loadOrgContext.js";
import { verifyPlatformJwt } from "../../middleware/verifyPlatformJwt.js";
import type { OrgContext } from "../../types.js";
import {
  mapProjectRowToProject,
  readBuildMetadata,
  startBuildRequestSchema,
} from "./shared.js";

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown API error.";
}

const buildsStartRoute = new Hono();

buildsStartRoute.post("/", verifyPlatformJwt, loadOrgContext, async (c) => {
  const orgContext = c.get("orgContext") as OrgContext;
  const requestBody = await c.req.json().catch(() => null);
  const parsedBody = startBuildRequestSchema.safeParse(requestBody);

  if (!parsedBody.success) {
    return c.json(
      {
        details: parsedBody.error.flatten(),
        error: "Invalid build request body.",
      },
      400,
    );
  }

  const prompt = parsedBody.data.prompt.trim();
  const selection = selectInitialBuildTemplate({ prompt });
  const projectName =
    parsedBody.data.projectName?.trim()
    || buildProjectNameFromPrompt(prompt, selection.template.defaultProjectName);
  const buildId = randomUUID();
  const projectId = randomUUID();
  const requestedAt = new Date().toISOString();
  const workflowId = buildInitialBuildWorkflowId(buildId);

  const initialMetadata = {
    phase: "queued",
    resultSource: undefined,
    templateReason: selection.reason,
    templateScores: selection.scores,
    workflowId,
  } satisfies Record<string, unknown>;

  const projectRow = await orgContext.db.createProject({
    id: projectId,
    name: projectName,
    org_id: orgContext.org.id,
    status: "queued",
    template: selection.template.id,
  });

  const generationRow = await orgContext.db.createGeneration({
    completed_at: null,
    error: null,
    files: [],
    id: buildId,
    metadata: initialMetadata,
    operation_id: initialBuildOperation.id,
    output_paths: [],
    preview_entry_path: selection.template.previewEntryPath,
    project_id: projectId,
    prompt,
    started_at: requestedAt,
    status: "queued",
    summary: `Queued ${selection.template.name} initial build.`,
    template_id: selection.template.id,
    warnings: [],
  });

  try {
    const temporalClient = await getTemporalClient();

    await temporalClient.workflow.start(INITIAL_BUILD_WORKFLOW_TYPE, {
      args: [
        {
          actor: {
            org: {
              id: orgContext.org.id,
              name: orgContext.org.name,
              plan: orgContext.org.plan,
            },
            user: {
              email: orgContext.user.email,
              id: orgContext.user.id,
              platformUserId: orgContext.user.platform_user_id,
            },
          },
          buildId,
          existingFiles: [],
          projectId,
          projectName,
          prompt,
          provisionalTemplateId: selection.template.id,
          requestedAt,
        },
      ],
      taskQueue: getInitialBuildTaskQueue(),
      workflowId,
    });
  } catch (error) {
    const errorMessage = toErrorMessage(error);
    const failureReason = errorMessage.includes("timeout")
      ? "GENERATION_TIMEOUT" as const
      : "ANTHROPIC_ERROR" as const;

    await orgContext.db.updateGeneration(buildId, {
      completed_at: new Date().toISOString(),
      error: errorMessage,
      metadata: {
        ...initialMetadata,
        failureReason,
        phase: "failed",
        resultSource: "error",
        startError: errorMessage,
      },
      status: "failed",
    });
    await orgContext.db.updateProject(projectId, {
      status: "draft",
    });

    return c.json(
      {
        error: "Failed to start build workflow.",
        failureReason,
        details: errorMessage,
      },
      500,
    );
  }

  const metadata = readBuildMetadata(generationRow.metadata);

  return c.json(
    {
      build: {
        completedAt: generationRow.completed_at,
        error: generationRow.error,
        id: generationRow.id,
        phase: metadata.phase ?? null,
        projectId: generationRow.project_id,
        source: metadata.resultSource ?? null,
        startedAt: generationRow.started_at,
        status: generationRow.status,
        summary: generationRow.summary,
        templateId: generationRow.template_id,
        workflowId: metadata.workflowId ?? workflowId,
      },
      project: mapProjectRowToProject(projectRow),
      result: null,
      template: selection.template,
    },
    202,
  );
});

export default buildsStartRoute;
