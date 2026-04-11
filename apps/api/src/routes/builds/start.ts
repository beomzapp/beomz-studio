import { randomUUID } from "node:crypto";

import { initialBuildOperation, projectIterationOperation } from "@beomz-studio/operations";
import type {
  BuilderV3TraceMetadata,
  OrgPlan,
  PlanStep,
  TemplateId,
} from "@beomz-studio/contracts";
import { getTemplateDefinitionSafe } from "@beomz-studio/templates";
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
import { matchTemplate as slmMatchTemplate } from "../../lib/slm/client.js";
import { runBuildInBackground } from "./generate.js";
import { PLAN_LIMITS, isAdminEmail, needsFreeDailyReset } from "../../lib/credits.js";

// ─── Inlined from workers/temporal/src/shared/planner.ts ────────────────────

const PROMPT_STOP_WORDS = new Set([
  "a", "an", "and", "app", "build", "create", "for", "from",
  "in", "make", "of", "the", "to", "with",
]);

function buildProjectNameFromPrompt(prompt: string, fallbackName: string): string {
  const tokens = prompt
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((t) => t.replace(/[^a-zA-Z0-9-]/g, ""))
    .filter((t) => t.length > 2 && !PROMPT_STOP_WORDS.has(t.toLowerCase()))
    .slice(0, 3);

  if (tokens.length === 0) return fallbackName;

  return tokens
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase())
    .join(" ");
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TEMPLATE_ICONS: Record<string, string> = {
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

function getProjectIcon(templateId: string): string {
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
  if (!summary || !steps || steps.length === 0) return prompt;

  const stepsBlock = steps
    .map((step, i) => `${i + 1}. ${step.title} — ${step.description}`)
    .join("\n");

  return `${prompt}\n\nApproved build plan:\nSummary: ${summary}\nSteps:\n${stepsBlock}`;
}

function derivePlanKeywords(steps: readonly PlanStep[] | undefined): string[] | undefined {
  if (!steps || steps.length === 0) return undefined;

  return steps
    .flatMap((s) => s.title.split(/[^a-zA-Z0-9]+/))
    .map((kw) => kw.trim().toLowerCase())
    .filter((kw) => kw.length >= 3)
    .filter((kw, idx, arr) => arr.indexOf(kw) === idx)
    .slice(0, 12);
}

function toOrgPlan(plan: string): OrgPlan {
  if (plan === "free" || plan === "starter" || plan === "pro" || plan === "business") {
    return plan;
  }
  return "free";
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
        message: "Build queued.",
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

// ─── Route ────────────────────────────────────────────────────────────────────

const buildsStartRoute = new Hono();

buildsStartRoute.post("/", verifyPlatformJwt, loadOrgContext, async (c) => {
  const orgContext = c.get("orgContext") as OrgContext;
  const requestBody = await c.req.json().catch(() => null);
  const parsedBody = startBuildRequestSchema.safeParse(requestBody);

  if (!parsedBody.success) {
    return c.json({ details: parsedBody.error.flatten(), error: "Invalid build request body." }, 400);
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

  if (requestedProjectId && !projectRow) return c.json({ error: "Project not found." }, 404);
  if (projectRow && projectRow.org_id !== orgContext.org.id) return c.json({ error: "Project not found." }, 404);

  let existingFiles = parsedBody.data.existingFiles ? [...parsedBody.data.existingFiles] : [];
  if (projectRow && existingFiles.length === 0) {
    const latestGeneration = await orgContext.db.findLatestGenerationByProjectId(projectRow.id);
    existingFiles = latestGeneration?.files ? [...latestGeneration.files] : [];
  }

  const isIteration = Boolean(projectRow && existingFiles.length > 0);

  // ── Template selection (fast; generate.ts picks the best prebuilt later) ───
  let selectedTemplateId: string;
  if (isIteration && projectRow) {
    selectedTemplateId = projectRow.template;
  } else {
    try {
      const slm = await slmMatchTemplate({ prompt: effectivePrompt });
      selectedTemplateId = slm.template.id;
    } catch {
      selectedTemplateId = "interactive-tool"; // safe fallback
    }
  }

  const selectedTemplateDef = getTemplateDefinitionSafe(selectedTemplateId);
  const projectName =
    (isIteration ? projectRow?.name : parsedBody.data.projectName?.trim())
    || projectRow?.name
    || buildProjectNameFromPrompt(prompt, selectedTemplateDef.defaultProjectName);

  // ── Credit balance check (synchronous 402 before generation row creation) ──
  // Admins bypass; free plan lazily resets daily; block if totalAvailable <= 0.
  const userEmail = orgContext.user.email;
  if (!isAdminEmail(userEmail)) {
    const freshOrg = await orgContext.db.getOrgWithBalance(orgContext.org.id);
    if (freshOrg) {
      let monthlyCredits = Number(freshOrg.credits ?? 0);
      const topupCredits  = Number(freshOrg.topup_credits ?? 0);

      // Lazy daily reset for free plan
      if (freshOrg.plan === "free") {
        if (needsFreeDailyReset(freshOrg.daily_reset_at)) {
          const dailyAmount = PLAN_LIMITS.free!.dailyReset ?? 10;
          await orgContext.db.updateOrg(freshOrg.id, {
            credits: dailyAmount,
            daily_reset_at: new Date().toISOString(),
          }).catch(() => undefined);
          monthlyCredits = dailyAmount;
        }
      }

      const totalAvailable = monthlyCredits + topupCredits;
      if (totalAvailable <= 0) {
        return c.json(
          { error: "Insufficient credits. Please purchase a credit pack or upgrade your plan." },
          402,
        );
      }
    }
  }

  const buildId = randomUUID();
  const projectId = projectRow?.id ?? randomUUID();
  const requestedAt = new Date().toISOString();
  const operation = isIteration ? "iteration" : "initial_build";
  const operationId = isIteration ? projectIterationOperation.id : initialBuildOperation.id;
  const initialBuilderTrace = createInitialBuilderTrace(requestedAt, operation);

  const initialMetadata = {
    builderTrace: initialBuilderTrace,
    creditsUsed: 0,
    phase: "queued",
    planKeywords: derivePlanKeywords(planSteps),
    planSessionId,
    planSteps: planSteps ? [...planSteps] : undefined,
    planSummary,
    resultSource: undefined,
    selectedTemplateId,
    sourcePrompt,
    templateUsed: selectedTemplateId,
    userId: orgContext.user.id,
  } satisfies Record<string, unknown>;

  console.log("[BEO-210] Build queued.", {
    buildId, operation, prompt: sourcePrompt, projectId,
    templateId: selectedTemplateId, userId: orgContext.user.id,
  });

  if (projectRow) {
    projectRow = await orgContext.db.updateProject(projectId, {
      name: projectName, status: "queued", template: selectedTemplateId as TemplateId,
    });
  } else {
    projectRow = await orgContext.db.createProject({
      id: projectId, name: projectName,
      org_id: orgContext.org.id, status: "queued", template: selectedTemplateId as TemplateId,
    });
  }

  if (!projectRow) return c.json({ error: "Project not found." }, 404);

  const iconValue = getProjectIcon(selectedTemplateId);
  await orgContext.db.updateProject(projectId, { icon: iconValue }).catch(() => undefined);
  if (!projectRow.icon) projectRow = { ...projectRow, icon: iconValue };

  const generationRow = await orgContext.db.createGeneration({
    completed_at: null, error: null, files: [],
    id: buildId, metadata: initialMetadata, operation_id: operationId,
    output_paths: [], preview_entry_path: "/",
    project_id: projectId, prompt: effectivePrompt, started_at: requestedAt,
    status: "queued",
    summary: isIteration
      ? `Queued requested changes for ${projectName}.`
      : `Queued initial build for ${projectName}.`,
    template_id: selectedTemplateId as TemplateId, warnings: [],
  });

  // ── Fire-and-forget background build (BEO-210 — no Temporal) ──────────────
  runBuildInBackground(
    {
      buildId, projectId,
      orgId: orgContext.org.id,
      userId: orgContext.user.id,
      userEmail: orgContext.user.email,
      prompt: effectivePrompt, sourcePrompt,
      templateId: selectedTemplateId,
      model: parsedBody.data.model ?? "claude-haiku-4-5-20251001",
      requestedAt, operationId,
      isIteration, existingFiles,
    },
    orgContext.db,
  ).catch((err: unknown) => {
    console.error("[BEO-210] Unhandled error in runBuildInBackground.", {
      buildId, error: err instanceof Error ? err.message : String(err),
    });
  });

  // Return 202 immediately — client subscribes to /builds/:id/events
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
        workflowId: null,
      },
      project: mapProjectRowToProject(projectRow),
      result: null,
      template: selectedTemplateDef,
      trace,
    },
    202,
  );
});

export default buildsStartRoute;
