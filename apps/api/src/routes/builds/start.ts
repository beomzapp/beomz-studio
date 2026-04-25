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
import {
  CONVERSATIONAL_COST,
  NEGATIVE_FLOOR_CONST,
  WEB_RESEARCH_SURCHARGE,
  isAdminEmail,
} from "../../lib/credits.js";
import { parseSupabaseProjectUrl } from "../../lib/projectDb.js";
import {
  classifyIntent,
  MAX_CLARIFYING_QUESTIONS,
  type Intent,
} from "../../lib/intentClassifier.js";
import {
  appendProjectChatHistory,
  readProjectChatHistory,
  shouldRefreshProjectChatSummary,
} from "../../lib/projectChat.js";
import { generateProjectChatSummary } from "../../lib/projectChatSummary.js";
import {
  generatePlanSummary as generatePlanSummaryMessage,
  type WebsiteContext,
} from "../../lib/chatPrompts.js";
import {
  canUseTavilySearch,
  extractUrlLike,
  loadResearchContext,
  loadUrlContext,
  researchUrl,
  toWebsiteContextFromUrlResearch,
} from "../../lib/webFetch.js";

// ─── Inlined from workers/temporal/src/shared/planner.ts ────────────────────

export const DEFAULT_BUILD_MODEL = "claude-sonnet-4-6";
const NEW_BUILD_PLAN_SUMMARY_CONFIDENCE = 0.8;
const ITERATION_BUILD_CONFIDENCE = 0.7;

const PROMPT_STOP_WORDS = new Set([
  "a", "an", "and", "app", "build", "create", "for", "from",
  "in", "make", "of", "the", "to", "with",
]);

const URL_FEATURE_PREFERENCE_TERMS = [
  "maintenance",
  "workflow",
  "work order",
  "vendor",
  "resident",
  "tenant",
  "dashboard",
  "analytics",
  "reporting",
  "login",
  "signup",
  "auth",
  "pricing",
  "contact form",
  "contact",
  "booking",
  "appointment",
  "inventory",
  "checkout",
  "payment",
  "billing",
  "notification",
  "alert",
  "search",
  "filter",
  "blog",
  "cms",
  "api",
  "integration",
  "calendar",
  "task",
  "todo",
  "portfolio",
] as const;

const URL_FEATURE_CONNECTOR_PATTERN = /\b(with|including|include|includes|featuring|features|feature|plus|add|needs?|must have)\b/i;

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

function hasExplicitFeaturePreferences(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  const matchedTerms = URL_FEATURE_PREFERENCE_TERMS
    .filter((term) => normalized.includes(term))
    .length;

  if (matchedTerms >= 2) {
    return true;
  }

  return matchedTerms >= 1 && URL_FEATURE_CONNECTOR_PATTERN.test(normalized);
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

const DISABLED_TEMPLATE_IDS = new Set<string>([
  // BEO-483: retired from the prebuilt pipeline.
  "product-catalog",
]);

function getProjectIcon(templateId: string): string {
  return TEMPLATE_ICONS[templateId] ?? "Sparkles";
}

function sanitiseSelectedTemplateId(templateId: string): string {
  if (!DISABLED_TEMPLATE_IDS.has(templateId)) return templateId;
  return "interactive-tool";
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

function normalisePromptForComparison(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized.length > 0 ? normalized : null;
}

function readPendingImplementPlan(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const implementPlan = (metadata as Record<string, unknown>).implementPlan;
  return typeof implementPlan === "string" && implementPlan.trim().length > 0
    ? implementPlan
    : null;
}

function countRecentClarifyingQuestions(history: readonly ReturnType<typeof readProjectChatHistory>[number][]): number {
  if (!history || history.length === 0) {
    return 0;
  }

  let count = 0;
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const entry = history[index];
    if (entry.role !== "assistant") {
      continue;
    }

    if (entry.content.trim().endsWith("?")) {
      count += 1;
      continue;
    }

    break;
  }

  return count;
}

function buildAccumulatedContextFallback(
  currentMessage: string,
  history: readonly ReturnType<typeof readProjectChatHistory>[number][],
): string {
  const parts = history
    .filter((entry) => entry.role === "user")
    .map((entry) => entry.content.trim())
    .filter((content) => content.length > 0);

  const current = currentMessage.trim();
  if (current.length > 0 && parts.at(-1) !== current) {
    parts.push(current);
  }

  return parts.join(". ").trim();
}

function readDomainFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return url;
  }
}

function readStringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function resolveBuildPromptField(record: Record<string, unknown>): string | undefined {
  const implementPlan = readStringField(record, "implementPlan");
  if (implementPlan && implementPlan.trim().length > 0) {
    return implementPlan;
  }

  const plan = readStringField(record, "plan");
  if (plan && plan.trim().length > 0) {
    return plan;
  }

  const prompt = readStringField(record, "prompt");
  if (prompt && prompt.trim().length > 0) {
    return prompt;
  }

  return implementPlan ?? plan ?? prompt;
}

function normaliseStartBuildRequestBody(requestBody: unknown): unknown {
  if (!requestBody || typeof requestBody !== "object" || Array.isArray(requestBody)) {
    return requestBody;
  }

  const record = requestBody as Record<string, unknown>;
  const prompt = resolveBuildPromptField(record);

  if (typeof prompt !== "string") {
    return requestBody;
  }

  return {
    ...record,
    prompt,
  };
}

function readExplicitImplementPrompt(requestBody: unknown): string | null {
  if (!requestBody || typeof requestBody !== "object" || Array.isArray(requestBody)) {
    return null;
  }

  const record = requestBody as Record<string, unknown>;
  const implementPlan = readStringField(record, "implementPlan");
  if (implementPlan && implementPlan.trim().length > 0) {
    return implementPlan.trim();
  }

  const plan = readStringField(record, "plan");
  if (plan && plan.trim().length > 0) {
    return plan.trim();
  }

  return null;
}

function hasExplicitImplementSignal(requestBody: unknown): boolean {
  if (!requestBody || typeof requestBody !== "object" || Array.isArray(requestBody)) {
    return false;
  }

  if (readExplicitImplementPrompt(requestBody)) {
    return true;
  }

  const record = requestBody as Record<string, unknown>;
  const action = readStringField(record, "action")?.trim().toLowerCase();

  return record.build_confirmed === true
    || record.buildConfirmed === true
    || action === "build_confirmed";
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
  implementPlan?: string | null;
  intent: "question" | "edit" | "build" | "ambiguous";
  message: string;
  operation: "initial_build" | "iteration";
  projectId: string;
  urlResearch?: {
    domain: string;
    features: string[];
    summary: string;
  } | null;
  readyToImplement?: boolean;
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

  const urlResearchEvent = args.urlResearch
    ? {
        type: "url_research",
        id: "2",
        timestamp: args.requestedAt,
        operation: args.operation,
        domain: args.urlResearch.domain,
        summary: args.urlResearch.summary,
        features: args.urlResearch.features,
      }
    : null;

  const mainEventId = urlResearchEvent ? "3" : "2";
  const doneEventId = urlResearchEvent ? "4" : "3";

  const mainEvent = args.type === "conversational_response"
    ? {
        type: "conversational_response",
        id: mainEventId,
        timestamp: args.requestedAt,
        operation: args.operation,
        message: args.message,
        ...(args.readyToImplement && args.implementPlan
          ? {
              readyToImplement: true,
              implementPlan: args.implementPlan,
              plan: args.implementPlan,
            }
          : {}),
      }
    : {
        type: "clarifying_question",
        id: mainEventId,
        timestamp: args.requestedAt,
        operation: args.operation,
        message: args.message,
      };

  const doneEvent = {
    type: "done",
    id: doneEventId,
    timestamp: args.requestedAt,
    operation: args.operation,
    buildId: args.buildId,
    projectId: args.projectId,
    code: "conversational",
    message: args.readyToImplement && args.implementPlan
      ? "Plan summary ready - awaiting build confirmation."
      : args.type === "conversational_response"
      ? "Question answered - no build started."
      : "Clarifying question sent - awaiting user response.",
    fallbackUsed: false,
    conversational: true,
    ...(args.readyToImplement && args.implementPlan
      ? {
          readyToImplement: true,
          implementPlan: args.implementPlan,
          plan: args.implementPlan,
        }
      : {}),
  };

  return {
    events: [
      intentEvent,
      ...(urlResearchEvent ? [urlResearchEvent] : []),
      mainEvent,
      doneEvent,
    ] as unknown as BuilderV3TraceMetadata["events"],
    lastEventId: doneEventId,
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
  generatePlanSummary?: typeof generatePlanSummaryMessage;
  loadUrlContext?: typeof loadUrlContext;
  loadOrgContextMiddleware?: typeof loadOrgContext;
  researchUrl?: typeof researchUrl;
  runBuildInBackground?: typeof runBuildInBackground;
}

export function createBuildsStartRoute(deps: BuildsStartRouteDeps = {}) {
  const route = new Hono();

  route.post("/", deps.authMiddleware ?? verifyPlatformJwt, deps.loadOrgContextMiddleware ?? loadOrgContext, async (c) => {
  const orgContext = c.get("orgContext") as OrgContext;
  const classifyIntentFn = deps.classifyIntent ?? classifyIntent;
  const generateClarifyingQuestionFn = deps.generateClarifyingQuestion ?? generateClarifyingQuestion;
  const generateConversationalAnswerFn = deps.generateConversationalAnswer ?? generateConversationalAnswer;
  const generatePlanSummaryFn = deps.generatePlanSummary ?? generatePlanSummaryMessage;
  const loadUrlContextFn = deps.loadUrlContext ?? loadUrlContext;
  const researchUrlFn = deps.researchUrl ?? researchUrl;
  const runBuildInBackgroundFn = deps.runBuildInBackground ?? runBuildInBackground;
  const requestBody = await c.req.json().catch(() => null);
  const normalisedRequestBody = normaliseStartBuildRequestBody(requestBody);
  const explicitImplementPrompt = readExplicitImplementPrompt(normalisedRequestBody);
  const explicitImplementSignal = hasExplicitImplementSignal(normalisedRequestBody);
  const parsedBody = startBuildRequestSchema.safeParse(normalisedRequestBody);

  if (!parsedBody.success) {
    return c.json({ details: parsedBody.error.flatten(), error: "Invalid build request body." }, 400);
  }

  const prompt = parsedBody.data.prompt.trim();
  console.log("[implementPlan]", prompt.slice(0, 100));
  const sourcePrompt = prompt;
  const imageUrl = parsedBody.data.imageUrl?.trim() || undefined;
  const confirmedIntent = parsedBody.data.confirmedIntent;
  const forceIteration = parsedBody.data.forceIteration === true;
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

  let latestGeneration = projectRow
    ? await orgContext.db.findLatestGenerationByProjectId(projectRow.id)
    : null;

  let existingFiles = parsedBody.data.existingFiles ? [...parsedBody.data.existingFiles] : [];
  if (projectRow && existingFiles.length === 0) {
    // BEO-421: strip stale blocked stub files at load time so they are never
    // passed into the build pipeline or returned to the client as existingFiles.
    existingFiles = latestGeneration?.files
      ? filterBlockedGeneratedFiles([...latestGeneration.files])
      : [];
  }

  const hasExistingIterationContext = Boolean(projectRow && existingFiles.length > 0);
  const isIteration = forceIteration || hasExistingIterationContext;

  // BEO-465: feed the classifier the last few turns so it can accumulate
  // context across the conversation (e.g. user first says "I want a website",
  // then answers "a portfolio with a blog" — confidence should climb).
  const recentHistory = projectRow
    ? readProjectChatHistory(projectRow.chat_history)
    : [];
  const clarifyingQuestionCount = countRecentClarifyingQuestions(recentHistory);
  const storedImplementPlan = normalisePromptForComparison(readPendingImplementPlan(latestGeneration?.metadata));
  const sourcePromptForComparison = normalisePromptForComparison(sourcePrompt);
  const matchingStoredImplementPlan = Boolean(
    storedImplementPlan
    && sourcePromptForComparison
    && storedImplementPlan === sourcePromptForComparison,
  );
  const isImplementConfirmation = explicitImplementSignal || matchingStoredImplementPlan;
  const confirmedBuildPrompt = explicitImplementPrompt
    ?? (matchingStoredImplementPlan ? storedImplementPlan : null)
    ?? (explicitImplementSignal ? sourcePromptForComparison : null);
  const implementConfirmationIntent: Intent = isIteration ? "iteration" : "build_new";
  const intentDecision = forceIteration
    ? {
        intent: "iteration" as const,
        confidence: 1,
        reason: "forceIteration requested.",
        accumulatedContext: effectivePrompt,
      }
    : isImplementConfirmation
    ? {
        intent: implementConfirmationIntent,
        confidence: 1,
        reason: matchingStoredImplementPlan
          ? "Stored implement plan confirmed."
          : "Explicit implement confirmation request.",
        accumulatedContext: confirmedBuildPrompt ?? sourcePrompt,
      }
    : await classifyIntentFn(
        sourcePrompt,
        existingFiles.length > 0,
        Boolean(imageUrl),
        recentHistory,
      );
  const classifiedIntent = intentDecision.intent;
  const legacyIntent = mapIntentToLegacyBuildIntent(classifiedIntent, existingFiles.length > 0);

  const isConversationalIntent = classifiedIntent === "greeting"
    || classifiedIntent === "question"
    || classifiedIntent === "research";

  // BEO-465: build-ish intents (build_new / iteration / image_ref / ambiguous)
  // are gated on confidence. Below 0.8 we ask a clarifying question instead
  // of firing the build.
  const isBuildIshIntent = classifiedIntent === "build_new"
    || classifiedIntent === "iteration"
    || classifiedIntent === "image_ref"
    || classifiedIntent === "ambiguous";
  const detectedUrl = extractUrlLike(sourcePrompt);
  const hasResearchUrl = Boolean(detectedUrl);
  const urlResearchResult = !isImplementConfirmation
    && isBuildIshIntent
    && detectedUrl
    ? await researchUrlFn(detectedUrl, readDomainFromUrl(detectedUrl))
    : null;
  const researchedUrlContext: WebsiteContext | null = detectedUrl && urlResearchResult
    ? toWebsiteContextFromUrlResearch(detectedUrl, urlResearchResult)
    : null;
  const hasUserFeaturePreferences = hasExplicitFeaturePreferences(sourcePrompt);
  const urlContextForConfidenceCap: WebsiteContext | null = researchedUrlContext
    && !isImplementConfirmation
    && isBuildIshIntent
    && !hasUserFeaturePreferences
    ? researchedUrlContext
    : null;
  const shouldCapConfidenceForUrlOnlyPrompt = Boolean(
    urlContextForConfidenceCap
      && !hasUserFeaturePreferences,
  );
  const forcedPlanSummary = isBuildIshIntent
    && !isImplementConfirmation
    && clarifyingQuestionCount >= MAX_CLARIFYING_QUESTIONS;
  const cappedConfidence = shouldCapConfidenceForUrlOnlyPrompt
    ? Math.min(intentDecision.confidence, 0.7)
    : intentDecision.confidence;
  const effectiveConfidence = forcedPlanSummary
    ? 0.95
    : cappedConfidence;
  const buildConfidenceThreshold = isIteration
    ? ITERATION_BUILD_CONFIDENCE
    : NEW_BUILD_PLAN_SUMMARY_CONFIDENCE;

  // Ambiguous always asks a question regardless of confidence — even if Haiku
  // happens to score it high, the user's wording said "unclear".
  const needsClarification = !forcedPlanSummary && (
    classifiedIntent === "ambiguous"
      || (isBuildIshIntent && effectiveConfidence < buildConfidenceThreshold)
  );
  const shouldOfferPlanSummary = isBuildIshIntent
    && !needsClarification
    && !isImplementConfirmation
    && !isIteration;
  const isNearReady = needsClarification && effectiveConfidence >= 0.7;

  // Original "immediate conversation" path now covers greeting/question/research
  // AND any build-ish intent that still needs clarification.
  const isImmediateConversation = isConversationalIntent || needsClarification || shouldOfferPlanSummary;
  const willUseConversationalAnswer = isImmediateConversation && !needsClarification && !shouldOfferPlanSummary;
  const shouldUseResearchLookup = willUseConversationalAnswer
    && (hasResearchUrl || (classifiedIntent === "research" && canUseTavilySearch(sourcePrompt)));
  const conversationalCreditsRequired = CONVERSATIONAL_COST + (shouldUseResearchLookup ? WEB_RESEARCH_SURCHARGE : 0);

  // BEO-465: accumulatedContext from the classifier becomes the enhanced
  // build prompt once confidence crosses 0.8.
  const accumulatedBuildContext = intentDecision.accumulatedContext?.trim()
    || buildAccumulatedContextFallback(sourcePrompt, recentHistory)
    || undefined;

  console.log("[BEO-465] intent classification", {
    intent: classifiedIntent,
    confidence: effectiveConfidence,
    originalConfidence: intentDecision.confidence,
    cappedConfidence,
    reason: intentDecision.reason,
    clarifyingQuestionCount,
    forcedPlanSummary,
    needsClarification,
    isNearReady,
    shouldOfferPlanSummary,
    forceIteration,
    isImplementConfirmation,
    explicitImplementSignal,
    isIteration,
    hasUserFeaturePreferences,
    hasUrlResearch: Boolean(urlResearchResult),
    hasUrlContextForConfidenceCap: Boolean(urlContextForConfidenceCap),
    shouldCapConfidenceForUrlOnlyPrompt,
    hasAccumulatedContext: Boolean(accumulatedBuildContext),
  });

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
  selectedTemplateId = sanitiseSelectedTemplateId(selectedTemplateId);

  const selectedTemplateDef = getTemplateDefinitionSafe(selectedTemplateId);
  const projectName =
    ((isIteration && projectRow) ? projectRow.name : parsedBody.data.projectName?.trim())
    || projectRow?.name
    || buildProjectNameFromPrompt(prompt, "New Project");

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

  if (!isAdminEmail(userEmail) && isImmediateConversation && classifiedIntent !== "ambiguous" && totalAvailable < conversationalCreditsRequired) {
    return c.json({
      error: "You are out of credits for chat right now. Top up or upgrade to keep going.",
      available: totalAvailable,
      required: conversationalCreditsRequired,
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

  if (typeof projectRow.byo_db_url === "string" && projectRow.byo_db_url.trim().length > 0) {
    try {
      const { host } = parseSupabaseProjectUrl(projectRow.byo_db_url);
      console.log("[db] using BYO supabase:", host);
    } catch {
      // Invalid persisted BYO URL should not block builds.
    }
  }

  const iconValue = getProjectIcon(selectedTemplateId);
  await orgContext.db.updateProject(projectId, { icon: iconValue }).catch(() => undefined);
  if (!projectRow.icon) projectRow = { ...projectRow, icon: iconValue };

  if (isImmediateConversation) {
    const chatHistory = readProjectChatHistory(projectRow.chat_history);
    const chatSummary = typeof projectRow.chat_summary === "string" ? projectRow.chat_summary : null;
    // BEO-465: when the classifier's confidence is below 0.8 on a build-ish
    // intent, render a clarifying question even if the raw intent was
    // build_new / iteration / image_ref. Greetings / questions / research
    // still render a full conversational response.
    const eventType = (classifiedIntent === "ambiguous" || needsClarification)
      ? "clarifying_question"
      : "conversational_response";
    const implementPlan = shouldOfferPlanSummary
      ? (accumulatedBuildContext ?? effectivePrompt)
      : null;
    const urlResearchEventPayload = hasResearchUrl && urlResearchResult
      ? {
          domain: urlResearchResult.domain,
          summary: urlResearchResult.summary,
          features: urlResearchResult.features,
        }
      : null;

    // BEO-485: URL context must be fetched before clarifying questions so the
    // model does not ask redundant "what does this site do?" questions.
    const websiteContext: WebsiteContext | null = shouldOfferPlanSummary
      ? null
      : classifiedIntent === "research"
      ? await loadResearchContext(sourcePrompt)
      : hasResearchUrl
      ? (urlContextForConfidenceCap ?? researchedUrlContext ?? await loadUrlContextFn(sourcePrompt))
      : null;

    if (eventType === "clarifying_question") {
      console.log("[builds/start] passing website context to clarifying question.", {
        buildId,
        hasWebsiteContext: Boolean(websiteContext),
        sourceType: websiteContext?.sourceType ?? null,
        url: websiteContext?.url ?? detectedUrl ?? null,
        websiteContextHasContent: Boolean(websiteContext?.content),
      });
    }

    const assistantMessage = shouldOfferPlanSummary
      ? await generatePlanSummaryFn(implementPlan ?? effectivePrompt, projectName)
      : eventType === "clarifying_question"
      ? await generateClarifyingQuestionFn({
          chatHistory,
          chatSummary,
          currentMessage: sourcePrompt,
          existingFiles,
          projectName,
          websiteContext,
          accumulatedContext: accumulatedBuildContext ?? null,
          nearReady: isNearReady,
        })
      : (await generateConversationalAnswerFn({
          chatHistory,
          chatSummary,
          currentMessage: sourcePrompt,
          existingFiles,
          projectName,
          websiteContext,
        })).message;
    const trace = buildImmediateTrace({
      buildId,
      intent: legacyIntent,
      message: assistantMessage,
      operation,
      projectId,
      urlResearch: urlResearchEventPayload,
      readyToImplement: Boolean(implementPlan),
      implementPlan,
      requestedAt,
      type: eventType,
    });

    if (urlResearchEventPayload) {
      console.log("[builds/start] url_research event emitted.", {
        buildId,
        domain: urlResearchEventPayload.domain,
        featureCount: urlResearchEventPayload.features.length,
        hasSummary: urlResearchEventPayload.summary.trim().length > 0,
      });
    }

    const generationRow = await orgContext.db.createGeneration({
      completed_at: requestedAt,
      error: null,
      files: [],
      id: buildId,
      metadata: {
        ...initialMetadata,
        builderTrace: trace,
        implementPlan: implementPlan ?? undefined,
        phase: "completed",
        readyToImplement: Boolean(implementPlan),
        resultSource: "ai",
      },
      operation_id: operationId,
      output_paths: [],
      preview_entry_path: "/",
      project_id: projectId,
      prompt: effectivePrompt,
      session_events: [
        { type: "user", content: sourcePrompt, timestamp: requestedAt },
        {
          type: eventType === "clarifying_question" ? "clarifying_question" : "question_answer",
          content: assistantMessage,
          timestamp: requestedAt,
          ...(implementPlan ? { implementPlan } : {}),
        },
      ],
      started_at: requestedAt,
      status: "completed",
      summary: implementPlan
        ? "Plan summary ready - awaiting build confirmation."
        : eventType === "clarifying_question"
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
        const creditsToDeduct = CONVERSATIONAL_COST + (websiteContext ? WEB_RESEARCH_SURCHARGE : 0);
        orgContext.db.applyOrgUsageDeduction(
          orgContext.org.id,
          creditsToDeduct,
          buildId,
          websiteContext ? "Conversational answer + web research" : "Conversational answer",
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

  // BEO-465: once confidence >= 0.8 the accumulated conversation summary
  // IS the build prompt. It's more specific than the user's original short
  // line ("im thinking of a website") so the build pipeline has enough to
  // go on without asking further questions downstream.
  const explicitBuildPrompt = isImplementConfirmation
    ? (confirmedBuildPrompt ?? prompt)
    : null;
  const buildPrompt = explicitBuildPrompt
    ?? ((!planSummary && accumulatedBuildContext)
      ? accumulatedBuildContext
      : effectivePrompt);

  console.log("[BEO-210] Build queued.", {
    buildId, operation, prompt: sourcePrompt, projectId,
    templateId: selectedTemplateId, userId: orgContext.user.id,
    confidence: effectiveConfidence,
    usingAccumulatedContext: !explicitBuildPrompt && buildPrompt !== effectivePrompt,
    usingStoredImplementPlan: Boolean(explicitBuildPrompt),
  });

  const generationRow = await orgContext.db.createGeneration({
    completed_at: null, error: null, files: [],
    id: buildId, metadata: initialMetadata, operation_id: operationId,
    output_paths: [], preview_entry_path: "/",
    project_id: projectId, prompt: buildPrompt, started_at: requestedAt,
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
  if (!isAdminEmail(userEmail) && !isIteration && totalAvailable <= 0) {
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
      prompt: buildPrompt, sourcePrompt,
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
