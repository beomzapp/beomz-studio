import Anthropic from "@anthropic-ai/sdk";
import type {
  BuildPlanContext,
  ClarifyQuestion,
  CreatePlanSessionRequest,
  PlanClarifyRequest,
  PlanGenerateRequest,
  PlanPhase,
  PlanSession,
  PlanStep,
  UpdatePlanSessionRequest,
} from "@beomz-studio/contracts";
import type { PlanSessionRow } from "@beomz-studio/studio-db";
import { z } from "zod";

import { apiConfig } from "../../config.js";

export const planPhaseSchema = z.enum([
  "idle",
  "streaming_intro",
  "awaiting_answers",
  "streaming_summary",
  "ready",
  "approved",
]) satisfies z.ZodType<PlanPhase>;

export const clarifyOptionSchema = z.object({
  label: z.string().trim().min(1).max(80),
  hint: z.string().trim().max(200).nullable(),
});

export const clarifyQuestionSchema = z.object({
  id: z.string().trim().min(1).max(80),
  text: z.string().trim().min(1).max(300),
  options: z.array(clarifyOptionSchema).min(2).max(4),
}) satisfies z.ZodType<ClarifyQuestion>;

export const planStepSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(400),
}) satisfies z.ZodType<PlanStep>;

export const buildPlanContextSchema = z.object({
  planSessionId: z.string().uuid().optional(),
  summary: z.string().trim().min(1).max(2000).optional(),
  steps: z.array(planStepSchema).min(1).max(12).optional(),
}) satisfies z.ZodType<BuildPlanContext>;

export const createPlanSessionRequestSchema = z.object({
  prompt: z.string().trim().min(1).max(4000),
}) satisfies z.ZodType<CreatePlanSessionRequest>;

export const updatePlanSessionRequestSchema = z
  .object({
    phase: planPhaseSchema.optional(),
    questions: z.array(clarifyQuestionSchema).max(8).optional(),
    answers: z.record(z.string(), z.string()).optional(),
    summary: z.string().trim().max(4000).nullable().optional(),
    steps: z.array(planStepSchema).max(12).optional(),
  })
  .refine(
    (value) =>
      value.phase !== undefined
      || value.questions !== undefined
      || value.answers !== undefined
      || value.summary !== undefined
      || value.steps !== undefined,
    "At least one field must be updated.",
  ) satisfies z.ZodType<UpdatePlanSessionRequest>;

export const planClarifyRequestSchema = z.object({
  prompt: z.string().trim().min(1).max(4000),
}) satisfies z.ZodType<PlanClarifyRequest>;

export const planGenerateRequestSchema = z.object({
  prompt: z.string().trim().min(1).max(4000),
  answers: z
    .array(
      z.object({
        questionId: z.string().trim().min(1).max(80),
        answer: z.string().trim().min(1).max(400),
      }),
    )
    .min(1)
    .max(8),
}) satisfies z.ZodType<PlanGenerateRequest>;

export const anthropic = new Anthropic({
  apiKey: apiConfig.ANTHROPIC_API_KEY,
});

export const PLAN_CLARIFY_MODEL = "claude-sonnet-4-5";
export const PLAN_CLARIFY_MAX_TOKENS = 512;
export const PLAN_GENERATE_MODEL = "claude-sonnet-4-5";
export const PLAN_GENERATE_MAX_TOKENS = 1024;

export const CLARIFY_SYSTEM_PROMPT = `You are a planning assistant for Beomz, an AI app builder.

The user has described what they want to build. Ask clarifying questions
BEFORE creating a plan. Do NOT generate plan steps yet.

Rules:
1. Ask 2–4 domain-specific questions FIRST. These must be about their
   specific product. "asset management" → asset types, depreciation, users.
   "SaaS dashboard" → data types, user roles, refresh frequency.
   "e-commerce" → product types, payments, inventory.
   Never lead with generic questions.

2. Ask 1–2 generic questions LAST (auth, database) only if relevant.
   Always include a plain-English hint in parentheses for technical options.
   Example: "Yes — login required (users need accounts to access)"

3. Each question: 2–4 short options (3–6 words max).

4. Intro: warm, one sentence, acknowledges exactly what they're building.

Output ONLY valid JSON, no markdown, no prose:
{
  "intro": "string",
  "questions": [
    {
      "id": "string",
      "text": "string",
      "options": [{ "label": "string", "hint": "string | null" }]
    }
  ]
}`;

export const GENERATE_SYSTEM_PROMPT = `You are a planning assistant for Beomz, an AI app builder.

The user answered your clarifying questions. Now generate:

1. A one-sentence summary of exactly what will be built. Be specific —
   reference the answers they gave.

2. 3–6 ordered plan steps. Each step: title + one-sentence description.
   Steps = concrete build phases, not generic categories.

Output ONLY valid JSON, no markdown, no prose:
{
  "summary": "string",
  "steps": [{ "title": "string", "description": "string" }]
}`;

export function mapPlanSessionRowToPlanSession(row: PlanSessionRow): PlanSession {
  return {
    id: row.id,
    userId: row.user_id,
    prompt: row.prompt,
    phase: row.phase,
    questions: row.questions ?? [],
    answers: row.answers ?? {},
    summary: row.summary,
    steps: row.steps ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
