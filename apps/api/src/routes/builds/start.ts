import { randomUUID } from "node:crypto";

import { initialBuildOperation, projectIterationOperation } from "@beomz-studio/operations";
import type {
  BuilderV3TraceMetadata,
  InitialBuildWorkflowInput,
  OrgPlan,
  PlanStep,
  TemplateId,
} from "@beomz-studio/contracts";
import {
  INITIAL_BUILD_WORKFLOW_TYPE,
  PROJECT_ITERATION_WORKFLOW_TYPE,
  buildInitialBuildWorkflowId,
  buildProjectIterationWorkflowId,
  buildProjectNameFromPrompt,
  getInitialBuildTaskQueue,
  getTemporalClient,
  selectInitialBuildTemplate,
} from "@beomz-studio/temporal-worker";
import { getTemplateDefinition } from "@beomz-studio/templates";
import { Hono } from "hono";

import { loadOrgContext } from "../../middleware/loadOrgContext.js";
import { verifyPlatformJwt } from "../../middleware/verifyPlatformJwt.js";
import type { OrgContext } from "../../types.js";
import {
  mapProjectRowToProject,
  readBuildMetadata,
  readBuildTraceMetadata,
  startBuildRequestSchema,
} from "./shared.js";

const TEMPLATE_ICONS: Record<TemplateId, string> = {
  "marketing-website": "Globe",
  "saas-dashboard": "BarChart2",
  "workspace-task": "CheckSquare",
  "mobile-app": "Smartphone",
  "social-app": "Users",
  "ecommerce": "ShoppingCart",
  "portfolio": "Briefcase",
  "blog-cms": "BookOpen",
  "onboarding-flow": "ListChecks",
  "data-table-app": "Table",
  "interactive-tool": "Wrench",
};

function getProjectIcon(templateId: TemplateId): string {
  return TEMPLATE_ICONS[templateId] ?? "Sparkles";
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown API error.";
}

function buildPlanContextPrompt(
  prompt: string,
  summary: string | undefined,
  steps: readonly PlanStep[] | undefined,
): string {
  if (!summary || !steps || steps.length === 0) {
    return prompt;
  }

  const stepsBlock = steps
    .map((step, index) => `${index + 1}. ${step.title} — ${step.description}`)
    .join("\n");

  return `${prompt}

Approved build plan:
Summary: ${summary}
Steps:
${stepsBlock}`;
}

function derivePlanKeywords(steps: readonly PlanStep[] | undefined): string[] | undefined {
  if (!steps || steps.length === 0) {
    return undefined;
  }

  return steps
    .flatMap((step) => step.title.split(/[^a-zA-Z0-9]+/))
    .map((keyword) => keyword.trim().toLowerCase())
    .filter((keyword) => keyword.length >= 3)
    .filter((keyword, index, items) => items.indexOf(keyword) === index)
    .slice(0, 12);
}

function toOrgPlan(plan: string): OrgPlan {
  switch (plan) {
    case "free":
    case "starter":
    case "pro":
    case "business":
      return plan;
    default:
      return "free";
  }
}

function createInitialBuilderTrace(
  requestedAt: string,
  operation: "initial_build" | "iteration",
): BuilderV3TraceMetadata {
  return {
    events: [
      {
        code: "build_queued",
        id: "1",
        message: "Build queued. Waiting for the worker to start.",
        operation,
        timestamp: requestedAt,
        type: "status",
        phase: "queued",
      },
    ],
    lastEventId: "1",
    previewReady: false,
    fallbackReason: null,
    fallbackUsed: false,
  };
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
  const sourcePrompt = prompt;
  let planSessionId = parsedBody.data.planSessionId;
  let planSummary = parsedBody.data.summary;
  let planSteps: readonly PlanStep[] | undefined = parsedBody.data.steps;
  const requestedProjectId = parsedBody.data.projectId?.trim();

  if (planSessionId) {
    const planSession = await orgContext.db.findPlanSessionById(planSessionId);
    if (!planSession || planSession.user_id !== orgContext.user.id) {
      return c.json({ error: "Approved plan session not found." }, 404);
    }

    if (planSession.phase !== "approved") {
      return c.json({ error: "Plan session is not approved yet." }, 409);
    }

    planSummary = planSession.summary ?? planSummary;
    planSteps = planSession.steps ?? planSteps;
  }

  const effectivePrompt = buildPlanContextPrompt(prompt, planSummary, planSteps);
  let projectRow = requestedProjectId
    ? await orgContext.db.findProjectById(requestedProjectId)
    : null;

  if (requestedProjectId && !projectRow) {
    return c.json({ error: "Project not found." }, 404);
  }

  if (projectRow && projectRow.org_id !== orgContext.org.id) {
    return c.json({ error: "Project not found." }, 404);
  }

  let existingFiles = parsedBody.data.existingFiles ? [...parsedBody.data.existingFiles] : [];
  if (projectRow && existingFiles.length === 0) {
    const latestGeneration = await orgContext.db.findLatestGenerationByProjectId(projectRow.id);
    existingFiles = latestGeneration?.files ? [...latestGeneration.files] : [];
  }

  const isIteration = Boolean(projectRow && existingFiles.length > 0);
  const selection = isIteration && projectRow
    ? {
        reason: `Reusing the current ${projectRow.template} template for this project iteration.`,
        scores: { [projectRow.template]: 1 },
        template: getTemplateDefinition(projectRow.template),
      }
    : selectInitialBuildTemplate({ prompt: effectivePrompt });
  const projectName =
    (isIteration ? projectRow?.name : parsedBody.data.projectName?.trim())
    || (projectRow?.name)
    || buildProjectNameFromPrompt(prompt, selection.template.defaultProjectName);
  const buildId = randomUUID();
  const projectId = projectRow?.id ?? randomUUID();
  const requestedAt = new Date().toISOString();
  const operation = isIteration ? "iteration" : "initial_build";
  const workflowId = isIteration
    ? buildProjectIterationWorkflowId(buildId)
    : buildInitialBuildWorkflowId(buildId);
  const workflowType = isIteration ? PROJECT_ITERATION_WORKFLOW_TYPE : INITIAL_BUILD_WORKFLOW_TYPE;
  const operationId = isIteration ? projectIterationOperation.id : initialBuildOperation.id;
  const initialBuilderTrace = createInitialBuilderTrace(requestedAt, operation);

  const initialMetadata = {
    builderTrace: initialBuilderTrace,
    phase: "queued",
    planKeywords: derivePlanKeywords(planSteps),
    planSessionId,
    planSteps: planSteps ? [...planSteps] : undefined,
    planSummary,
    resultSource: undefined,
    sourcePrompt,
    templateReason: selection.reason,
    templateScores: selection.scores,
    workflowId,
  } satisfies Record<string, unknown>;

  if (projectRow) {
    projectRow = await orgContext.db.updateProject(projectId, {
      name: projectName,
      status: "queued",
      template: selection.template.id,
    });
  } else {
    projectRow = await orgContext.db.createProject({
      id: projectId,
      name: projectName,
      org_id: orgContext.org.id,
      status: "queued",
      template: selection.template.id,
    });
  }

  if (!projectRow) {
    return c.json({ error: "Project not found." }, 404);
  }

  // Best-effort: set icon after create/update (column may not exist yet pending migration).
  const iconValue = getProjectIcon(selection.template.id);
  await orgContext.db.updateProject(projectId, { icon: iconValue }).catch(() => undefined);
  if (projectRow && !projectRow.icon) {
    projectRow = { ...projectRow, icon: iconValue };
  }

  const generationRow = await orgContext.db.createGeneration({
    completed_at: null,
    error: null,
    files: [],
    id: buildId,
    metadata: initialMetadata,
    operation_id: operationId,
    output_paths: [],
    preview_entry_path: selection.template.previewEntryPath,
    project_id: projectId,
    prompt: effectivePrompt,
    started_at: requestedAt,
    status: "queued",
    summary: planSummary
      ? isIteration
        ? `Queued requested changes for ${projectName} from the approved plan.`
        : `Queued ${selection.template.name} initial build from approved plan.`
      : isIteration
        ? `Queued requested changes for ${projectName}.`
        : `Queued ${selection.template.name} initial build.`,
    template_id: selection.template.id,
    warnings: [],
  });

  try {
    const temporalClient = await getTemporalClient();

    const workflowInput: InitialBuildWorkflowInput = {
      actor: {
        org: {
          id: orgContext.org.id,
          name: orgContext.org.name,
          plan: toOrgPlan(orgContext.org.plan),
        },
        user: {
          email: orgContext.user.email,
          id: orgContext.user.id,
          platformUserId: orgContext.user.platform_user_id,
        },
      },
      buildId,
      existingFiles,
      projectId,
      projectName,
      prompt: effectivePrompt,
      provisionalTemplateId: selection.template.id,
      requestedAt,
    };

    await temporalClient.workflow.start(workflowType, {
      args: [workflowInput],
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
  const trace = readBuildTraceMetadata(generationRow);

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
      trace,
    },
    202,
  );
});

export default buildsStartRoute;
