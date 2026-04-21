import { randomUUID } from "node:crypto";

import { initialBuildOperation, projectIterationOperation } from "@beomz-studio/operations";
import type {
  BuilderV3InsufficientCreditsEvent,
  BuilderV3TraceMetadata,
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
import {
  filterBlockedGeneratedFiles,
  generateClarifyingQuestion,
  generateConversationalAnswer,
  runBuildInBackground,
} from "./generate.js";
import { CONVERSATIONAL_COST, NEGATIVE_FLOOR_CONST, isAdminEmail } from "../../lib/credits.js";
import { classifyIntent, type Intent } from "../../lib/intentClassifier.js";
import {
  appendProjectChatHistory,
  readProjectChatHistory,
  shouldRefreshProjectChatSummary,
} from "../../lib/projectChat.js";
import { generateProjectChatSummary } from "../../lib/projectChatSummary.js";

// ─── Inlined from workers/temporal/src/shared/planner.ts ────────────────────

export const DEFAULT_BUILD_MODEL = "claude-sonnet-4-6";

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

function mapIntentToLegacyBuildIntent(intent: Intent, hasExistingFiles: boolean): "question" | "edit" | "build" | "ambiguous" {
  switch (intent) {
    case "greeting":
    case "question":
    case "research":
      return "question";
    case "ambiguous":
      return "ambiguous";
    case "iteration":
      return "edit";
    case "image_ref":
      return hasExistingFiles ? "edit" : "build";
    case "build_new":
      return "build";
    default:
      return hasExistingFiles ? "edit" : "build";
  }
}

async function persistConversationalProjectMemory(
  db: OrgContext["db"],
  projectId: string,
  userContent: string,
  assistantContent: string,
  existingFiles: Parameters<typeof generateProjectChatSummary>[0]["files"],
  projectName?: string,
): Promise<void> {
  try {
    const project = await db.findProjectById(projectId);
    if (!project) {
      return;
    }

    const updatedHistory = appendProjectChatHistory(project.chat_history, userContent, assistantContent);
    const nextChatSummary = shouldRefreshProjectChatSummary(updatedHistory.length)
      ? await generateProjectChatSummary({
          appName: projectName ?? project.name,
          existingSummary: typeof project.chat_summary === "string" ? project.chat_summary : null,
          files: existingFiles,
          history: updatedHistory,
        })
      : (typeof project.chat_summary === "string" ? project.chat_summary : null);

    try {
      await db.updateProject(projectId, {
        chat_history: updatedHistory,
        chat_summary: nextChatSummary,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/chat_summary/i.test(message)) {
        await db.updateProject(projectId, {
          chat_history: updatedHistory,
        });
      } else {
        throw error;
      }
    }
  } catch (error) {
    console.warn("[builds/start] failed to persist conversational memory:", error instanceof Error ? error.message : String(error));
  }
}

function buildImmediateTrace(args: {
  buildId: string;
  intent: "question" | "edit" | "build" | "ambiguous";
  message: string;
  operation: "initial_build" | "iteration";
  projectId: string;
  requestedAt: string;
  type: "conversational_response" | "clarifying_question";
}): BuilderV3TraceMetadata {
  const intentEvent = {
    type: "intent_detected",
    id: "1",
    timestamp: args.requestedAt,
    operation: args.operation,
    intent: args.intent,
  };

  const mainEvent = args.type === "conversational_response"
    ? {
        type: "conversational_response",
        id: "2",
        timestamp: args.requestedAt,
        operation: args.operation,
        message: args.message,
      }
    : {
        type: "clarifying_question",
        id: "2",
        timestamp: args.requestedAt,
        operation: args.operation,
        message: args.message,
      };

  const doneEvent = {
    type: "done",
    id: "3",
    timestamp: args.requestedAt,
    operation: args.operation,
    buildId: args.buildId,
    projectId: args.projectId,
    code: "conversational",
    message: args.type === "conversational_response"
      ? "Question answered - no build started."
      : "Clarifying question sent - awaiting user response.",
    fallbackUsed: false,
    conversational: true,
  };

  return {
    events: [
      intentEvent,
      mainEvent,
      doneEvent,
    ] as unknown as BuilderV3TraceMetadata["events"],
    lastEventId: "3",
    previewReady: false,
    fallbackReason: null,
    fallbackUsed: false,
  };
}

// ─── Route ────────────────────────────────────────────────────────────────────

interface BuildsStartRouteDeps {
  authMiddleware?: typeof verifyPlatformJwt;
  classifyIntent?: typeof classifyIntent;
  generateClarifyingQuestion?: typeof generateClarifyingQuestion;
  generateConversationalAnswer?: typeof generateConversationalAnswer;
  loadOrgContextMiddleware?: typeof loadOrgContext;
  runBuildInBackground?: typeof runBuildInBackground;
}

export function createBuildsStartRoute(deps: BuildsStartRouteDeps = {}) {
  const route = new Hono();

  route.post("/", deps.authMiddleware ?? verifyPlatformJwt, deps.loadOrgContextMiddleware ?? loadOrgContext, async (c) => {
  const orgContext = c.get("orgContext") as OrgContext;
  const classifyIntentFn = deps.classifyIntent ?? classifyIntent;
  const generateClarifyingQuestionFn = deps.generateClarifyingQuestion ?? generateClarifyingQuestion;
  const generateConversationalAnswerFn = deps.generateConversationalAnswer ?? generateConversationalAnswer;
  const runBuildInBackgroundFn = deps.runBuildInBackground ?? runBuildInBackground;
  const requestBody = await c.req.json().catch(() => null);
  const parsedBody = startBuildRequestSchema.safeParse(requestBody);

  if (!parsedBody.success) {
    return c.json({ details: parsedBody.error.flatten(), error: "Invalid build request body." }, 400);
  }

  const prompt = parsedBody.data.prompt.trim();
  const sourcePrompt = prompt;
  const imageUrl = parsedBody.data.imageUrl?.trim() || undefined;
  const confirmedIntent = parsedBody.data.confirmedIntent;
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
    // BEO-421: strip stale blocked stub files at load time so they are never
    // passed into the build pipeline or returned to the client as existingFiles.
    existingFiles = latestGeneration?.files
      ? filterBlockedGeneratedFiles([...latestGeneration.files])
      : [];
  }

  const isIteration = Boolean(projectRow && existingFiles.length > 0);
  const intentDecision = await classifyIntentFn(sourcePrompt, existingFiles.length > 0, Boolean(imageUrl));
  const classifiedIntent = intentDecision.intent;
  const legacyIntent = mapIntentToLegacyBuildIntent(classifiedIntent, existingFiles.length > 0);
  const isImmediateConversation = classifiedIntent === "greeting"
    || classifiedIntent === "question"
    || classifiedIntent === "research"
    || classifiedIntent === "ambiguous";

  // ── Template selection (fast; generate.ts picks the best prebuilt later) ───
  let selectedTemplateId: string;
  if (isImmediateConversation) {
    selectedTemplateId = projectRow?.template ?? "interactive-tool";
  } else if (isIteration && projectRow) {
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

  // ── Credit balance snapshot ───────────────────────────────────────────────
  // Admins bypass. The actual soft/hard block happens after the generation row
  // is created so the frontend receives the normal insufficient_credits state.
  // BEO-322: daily reset mechanic removed — free plan is signup grant only.
  const userEmail = orgContext.user.email;
  let totalAvailable = Infinity; // admins never reach the threshold checks below
  if (!isAdminEmail(userEmail)) {
    const freshOrg = await orgContext.db.getOrgWithBalance(orgContext.org.id);
    if (freshOrg) {
      const monthlyCredits = Number(freshOrg.credits ?? 0);
      const topupCredits   = Number(freshOrg.topup_credits ?? 0);

      totalAvailable = monthlyCredits + topupCredits;
    }
  }

  // ── Free plan: max 3 projects ─────────────────────────────────────────────
  // Only enforced on initial builds (not iterations on existing projects).
  if (
    !isImmediateConversation
    && !isIteration
    && !isAdminEmail(orgContext.user.email)
  ) {
    const org = await orgContext.db.getOrgWithBalance(orgContext.org.id);
    if (org?.plan === "free") {
      const existingProjects = await orgContext.db.findProjectsByOrgId(org.id);
      if (existingProjects.length >= 3) {
        return c.json(
          { error: "Free plan is limited to 3 projects. Upgrade to create more.", reason: "plan_limit" },
          403,
        );
      }
    }
  }

  if (!isAdminEmail(userEmail) && isImmediateConversation && classifiedIntent !== "ambiguous" && totalAvailable < CONVERSATIONAL_COST) {
    return c.json({
      error: "You are out of credits for chat right now. Top up or upgrade to keep going.",
      available: totalAvailable,
      required: CONVERSATIONAL_COST,
    }, 402);
  }

  const effectiveModel = parsedBody.data.model ?? DEFAULT_BUILD_MODEL;

  const buildId = randomUUID();
  const projectId = projectRow?.id ?? randomUUID();
  const requestedAt = new Date().toISOString();
  const operation = isIteration ? "iteration" : "initial_build";
  const operationId = isIteration ? projectIterationOperation.id : initialBuildOperation.id;
  const initialBuilderTrace = createInitialBuilderTrace(requestedAt, operation);

  const initialMetadata = {
    builderTrace: initialBuilderTrace,
    confirmedIntent,
    creditsUsed: 0,
    imageUrl,
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

  const projectStatus = isImmediateConversation ? "ready" : "queued";

  if (projectRow) {
    projectRow = await orgContext.db.updateProject(projectId, {
      name: projectName,
      status: projectStatus,
      template: selectedTemplateId as TemplateId,
    });
  } else {
    projectRow = await orgContext.db.createProject({
      id: projectId, name: projectName,
      org_id: orgContext.org.id, status: projectStatus, template: selectedTemplateId as TemplateId,
    });
  }

  if (!projectRow) return c.json({ error: "Project not found." }, 404);

  const iconValue = getProjectIcon(selectedTemplateId);
  await orgContext.db.updateProject(projectId, { icon: iconValue }).catch(() => undefined);
  if (!projectRow.icon) projectRow = { ...projectRow, icon: iconValue };

  if (isImmediateConversation) {
    const chatHistory = readProjectChatHistory(projectRow.chat_history);
    const chatSummary = typeof projectRow.chat_summary === "string" ? projectRow.chat_summary : null;
    const eventType = classifiedIntent === "ambiguous"
      ? "clarifying_question"
      : "conversational_response";
    const assistantMessage = eventType === "clarifying_question"
      ? await generateClarifyingQuestionFn({
          chatHistory,
          chatSummary,
          currentMessage: sourcePrompt,
          existingFiles,
          projectName,
        })
      : (await generateConversationalAnswerFn({
          chatHistory,
          chatSummary,
          currentMessage: sourcePrompt,
          existingFiles,
          projectName,
        })).message;
    const trace = buildImmediateTrace({
      buildId,
      intent: legacyIntent,
      message: assistantMessage,
      operation,
      projectId,
      requestedAt,
      type: eventType,
    });

    const generationRow = await orgContext.db.createGeneration({
      completed_at: requestedAt,
      error: null,
      files: [],
      id: buildId,
      metadata: {
        ...initialMetadata,
        builderTrace: trace,
        phase: "completed",
        resultSource: "ai",
      },
      operation_id: operationId,
      output_paths: [],
      preview_entry_path: "/",
      project_id: projectId,
      prompt: effectivePrompt,
      session_events: [
        { type: "user", content: sourcePrompt, timestamp: requestedAt },
        { type: eventType === "clarifying_question" ? "clarifying_question" : "question_answer", content: assistantMessage, timestamp: requestedAt },
      ],
      started_at: requestedAt,
      status: "completed",
      summary: eventType === "clarifying_question"
        ? "Clarifying question sent - awaiting user response."
        : "Question answered - no build started.",
      template_id: selectedTemplateId as TemplateId,
      warnings: [],
    });

    if (eventType === "conversational_response") {
      await persistConversationalProjectMemory(
        orgContext.db,
        projectId,
        sourcePrompt,
        assistantMessage,
        existingFiles,
        projectName,
      );
      if (!isAdminEmail(userEmail)) {
        orgContext.db.applyOrgUsageDeduction(
          orgContext.org.id,
          CONVERSATIONAL_COST,
          buildId,
          "Conversational answer",
        ).catch((error: unknown) => {
          console.error("[builds/start] conversational credit deduction failed (non-fatal):", error instanceof Error ? error.message : String(error));
        });
      }
    } else {
      await persistConversationalProjectMemory(
        orgContext.db,
        projectId,
        sourcePrompt,
        assistantMessage,
        existingFiles,
        projectName,
      );
    }

    return c.json(
      {
        build: {
          completedAt: generationRow.completed_at,
          error: generationRow.error,
          id: generationRow.id,
          phase: "completed",
          projectId: generationRow.project_id,
          source: "ai",
          startedAt: generationRow.started_at,
          status: generationRow.status,
          summary: generationRow.summary,
          templateId: generationRow.template_id,
          workflowId: null,
        },
        project: mapProjectRowToProject(projectRow),
        result: null,
        template: selectedTemplateDef,
        trace: { ...trace, lastEventId: null },
      },
      202,
    );
  }

  console.log("[BEO-210] Build queued.", {
    buildId, operation, prompt: sourcePrompt, projectId,
    templateId: selectedTemplateId, userId: orgContext.user.id,
  });

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

  // ── Balance-based credit gate ────────────────────────────────────────────
  // Only runs when the org is exhausted or already too negative so we avoid
  // the extra Haiku intent call for healthy balances. Question/ambiguous
  // prompts still pass through because they don't start a build here.
  if (!isAdminEmail(userEmail) && !isIteration && totalAvailable <= 0 && !(imageUrl && !confirmedIntent)) {
    if (legacyIntent === "build" || legacyIntent === "edit") {
      const reason = totalAvailable <= NEGATIVE_FLOOR_CONST
        ? "negative_floor_reached"
        : "credits_exhausted";
      const icEventId = "2";
      const icEvent = {
        type: "insufficient_credits",
        id: icEventId,
        timestamp: new Date().toISOString(),
        operation: operation,
        available: totalAvailable,
        required: 0,
        features: [],
        reason,
      } as unknown as BuilderV3InsufficientCreditsEvent;

      const icTrace: BuilderV3TraceMetadata = {
        ...initialBuilderTrace,
        events: [...initialBuilderTrace.events, icEvent],
        lastEventId: icEventId,
      };

      await orgContext.db.updateGeneration(buildId, {
        metadata: { ...initialMetadata, builderTrace: icTrace },
        status: "insufficient_credits",
      });

      console.log("[BEO-439] balance gate fired — build blocked.", {
        buildId,
        intent: legacyIntent,
        available: totalAvailable,
        reason,
      });

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
            status: "insufficient_credits",
            summary: generationRow.summary,
            templateId: generationRow.template_id,
            workflowId: null,
          },
          project: mapProjectRowToProject(projectRow),
          result: null,
          template: selectedTemplateDef,
          trace: icTrace,
        },
        202,
      );
    }
  }

  // ── Fire-and-forget background build (BEO-210 — no Temporal) ──────────────
  runBuildInBackgroundFn(
    {
      buildId, projectId,
      orgId: orgContext.org.id,
      userId: orgContext.user.id,
      userEmail: orgContext.user.email,
      prompt: effectivePrompt, sourcePrompt,
      templateId: selectedTemplateId,
      model: effectiveModel,
      requestedAt, operationId,
      isIteration, existingFiles,
      imageUrl,
      confirmedIntent,
      projectName,
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

  return route;
}

const buildsStartRoute = createBuildsStartRoute();

export default buildsStartRoute;
