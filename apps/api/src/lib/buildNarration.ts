import Anthropic from "@anthropic-ai/sdk";

const HAIKU_MODEL = "claude-haiku-4-5-20251001";
const PREAMBLE_TIMEOUT_MS = 3_000;
const NEXT_STEPS_TIMEOUT_MS = 5_000;

export interface StagePreamblePayload {
  restatement: string;
  bullets: string[];
}

export interface NextStepSuggestion {
  label: string;
  prompt: string;
}

export interface NextStepsPayload {
  suggestions: NextStepSuggestion[];
}

export interface HaikuUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface StagePreambleResult {
  payload: StagePreamblePayload;
  usage: HaikuUsage;
}

export interface NextStepsResult {
  payload: NextStepsPayload | null;
  usage: HaikuUsage;
}

export const PREAMBLE_FALLBACK: StagePreamblePayload = {
  restatement: "Got it — building this now.",
  bullets: [
    "Core app flow users can complete quickly",
    "Key features matching your request",
    "Visual style aligned to your direction",
  ],
};

export const NEXT_STEPS_FALLBACK: NextStepsPayload = {
  suggestions: [
    { label: "Add a feature", prompt: "Add one useful feature that fits this app" },
    { label: "Change the design", prompt: "Redesign this app with a more polished visual style" },
    { label: "Add a database", prompt: "Connect this app to a database and replace the mock data" },
  ],
};

interface HaikuTextRequest {
  maxTokens: number;
  systemPrompt: string;
  temperature: number;
  timeoutMs: number;
  userMessage: string;
}

interface HaikuTextResponse {
  text: string;
  usage: HaikuUsage;
}

export type HaikuTextInvoker = (request: HaikuTextRequest) => Promise<string | HaikuTextResponse>;

interface GenerateStagePreambleOptions {
  invokeModel?: HaikuTextInvoker;
  isIteration: boolean;
  prompt: string;
  timeoutMs?: number;
}

interface GenerateNextStepsOptions {
  appDescriptor: string;
  fileList: readonly string[];
  invokeModel?: HaikuTextInvoker;
  isIteration: boolean;
  prompt: string;
  timeoutMs?: number;
}

const PREAMBLE_FEW_SHOT_EXAMPLES = `<examples>
EXAMPLE 1 — Short, specific, casual
User: "Build a tip calculator"
Output: {
  "restatement": "Got it — a tip calculator.",
  "bullets": [
    "A clear bill amount input",
    "Tip percentage picker with common presets",
    "Split-between feature for groups",
    "Per-person breakdown that updates instantly"
  ]
}

EXAMPLE 2 — Very casual / slang
User: "gimme a pomodoro app with streaks"
Output: {
  "restatement": "Pomodoro timer with streaks — solid.",
  "bullets": [
    "25-minute focus timer, 5-minute break timer",
    "Streak counter that survives page reloads",
    "Audible cue when a session ends",
    "Simple history of completed sessions"
  ]
}

EXAMPLE 3 — Business / formal
User: "I need a CRM dashboard to track leads, deals, and pipeline health for my sales team."
Output: {
  "restatement": "A sales CRM focused on pipeline visibility.",
  "bullets": [
    "Lead list with stage, owner, and last touch",
    "Deal board grouped by pipeline stage",
    "Pipeline health summary at the top",
    "Fast path to log activity on any record"
  ]
}

EXAMPLE 4 — Vague (Haiku infers sensibly)
User: "build me a journaling app"
Output: {
  "restatement": "A journaling app — keeping it focused.",
  "bullets": [
    "Clean daily entry with date auto-filled",
    "Past entries browsable by date or mood",
    "Search across everything you've written",
    "Minimal, distraction-free writing surface"
  ]
}

EXAMPLE 5 — Feature-dense
User: "Build a kanban board with drag-and-drop, labels, due dates, team assignments, and a filter by assignee"
Output: {
  "restatement": "A kanban board with real team workflow features.",
  "bullets": [
    "Drag-and-drop between columns",
    "Labels and due dates on each card",
    "Team member assignment per card",
    "Filter the whole board by assignee"
  ]
}

EXAMPLE 6 — Niche / technical
User: "I want a tool for tracking my chess openings and win rates by color"
Output: {
  "restatement": "A chess opening tracker — interesting one.",
  "bullets": [
    "Openings logged by name (ECO code optional)",
    "Win rate broken out by white vs. black",
    "Quick entry so logging games doesn't feel like work",
    "Summary view highlighting strongest and weakest lines"
  ]
}

EXAMPLE 7 — Emotional / personal
User: "build an app to help me remember to call my mom"
Output: {
  "restatement": "A gentle reminder app for calling your mom.",
  "bullets": [
    "Pick a cadence that feels right, not nagging",
    "One-tap 'I called' to reset the timer",
    "Soft visual cue when it's been a while",
    "No guilt trips, no streak pressure"
  ]
}

EXAMPLE 8 — Ambiguous / too-broad
User: "something for my business"
Output: {
  "restatement": "Going with a simple customer dashboard — easy to change direction.",
  "bullets": [
    "Customer list with contact info",
    "Simple notes field per customer",
    "Search and filter to find anyone fast",
    "One place to add new customers"
  ]
}
</examples>`;

const PREAMBLE_SYSTEM_PROMPT = [
  "You are Beomz, reading a user's app-build request.",
  "Respond in the same language as the user's prompt.",
  "Output JSON only with this exact shape:",
  '{ "restatement": "...", "bullets": ["...", "...", "..."] }',
  "Rules:",
  "- restatement: one short sentence naming what they asked for. Peer-level tone. No servile language. Max 12 words.",
  "- bullets: max 4 items naming user-facing features only (what the app does).",
  "- No filenames, no component names, and no route/file/folder names.",
  "- No technical implementation detail or file architecture breakdowns.",
  "- Show understanding without echoing the prompt word-for-word.",
  "- No promises. No 'I will'. No buzzwords like 'clean UI'.",
  "- Do not output anything outside the JSON.",
  PREAMBLE_FEW_SHOT_EXAMPLES,
].join("\n");

const ITERATION_PREAMBLE_SYSTEM_PROMPT = [
  "You are Beomz, reading a user's change request for an existing app.",
  "Respond in the same language as the user's prompt.",
  "Output JSON only with this exact shape:",
  '{ "restatement": "...", "bullets": [] }',
  "Rules:",
  "- restatement: one short sentence restating the requested change. Peer-level tone. Max 12 words.",
  "- bullets must always be an empty array.",
  "- No promises. No 'I will'. No servile language.",
  "- Do not output anything outside the JSON.",
].join("\n");

const NEXT_STEPS_SYSTEM_PROMPT = [
  "You are Beomz. The user just built an app.",
  "Respond in the same language as the user's prompt.",
  "Output JSON only with this exact shape:",
  '{ "suggestions": [{ "label": "...", "prompt": "..." }] }',
  "Rules:",
  "- Return 3-4 suggestions.",
  "- label: short phrase for a clickable chip, max 8 words, start with an action verb.",
  "- prompt: the exact prompt Beomz would receive if they click it, max 20 words.",
  "- Suggest specific improvements this app would benefit from, not generic filler.",
  "- Avoid 'deploy' or 'publish'. Those are system actions.",
  "- Do not output anything outside the JSON.",
  "",
  "Examples:",
  'CONTEXT: User built a tip calculator with bill input, tip picker, split-between.',
  "Suggestions: [",
  '  { label: "Save tip history", prompt: "Add a history tab that remembers the last 10 tip calculations" },',
  '  { label: "Round up to the nearest dollar", prompt: "Add a \'round up\' toggle that rounds the per-person total up to the nearest dollar" },',
  '  { label: "Support multiple currencies", prompt: "Add currency selection (USD, EUR, GBP, JPY)" },',
  '  { label: "Make it mobile-friendly", prompt: "Optimize the layout for small screens" }',
  "]",
  "",
  'CONTEXT: User built a kanban board with cards, columns, drag-and-drop, labels.',
  "Suggestions: [",
  '  { label: "Add due dates with overdue highlighting", prompt: "Add due dates to each card and highlight cards that are overdue in red" },',
  '  { label: "Filter by label", prompt: "Add a filter bar that lets me show only cards with a specific label" },',
  '  { label: "Activity log per card", prompt: "Add an activity log to each card showing who moved it and when" },',
  '  { label: "Keyboard shortcuts", prompt: "Add keyboard shortcuts for creating cards and moving between columns" }',
  "]",
].join("\n");

function toTextResponse(response: Anthropic.Messages.Message): string {
  return response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

function normaliseHaikuResponse(response: string | HaikuTextResponse): HaikuTextResponse {
  if (typeof response === "string") {
    return {
      text: response,
      usage: { inputTokens: 0, outputTokens: 0 },
    };
  }

  return response;
}

async function defaultInvokeHaiku(request: HaikuTextRequest): Promise<HaikuTextResponse> {
  const { apiConfig } = await import("../config.js");

  if (!apiConfig.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY not configured.");
  }

  const client = new Anthropic({ apiKey: apiConfig.ANTHROPIC_API_KEY });
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), request.timeoutMs);

  try {
    const response = await client.messages.create(
      {
        model: HAIKU_MODEL,
        max_tokens: request.maxTokens,
        temperature: request.temperature,
        system: request.systemPrompt,
        messages: [{ role: "user", content: request.userMessage }],
      },
      { signal: controller.signal },
    );

    return {
      text: toTextResponse(response),
      usage: {
        inputTokens: response.usage?.input_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
      },
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

function parseJsonText(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("Empty model response.");
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedMatch?.[1]?.trim() ?? trimmed;
  return JSON.parse(candidate);
}

function normalisePreamble(raw: unknown, isIteration: boolean): StagePreamblePayload {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("Preamble payload was not an object.");
  }

  const record = raw as Record<string, unknown>;
  const restatement = typeof record.restatement === "string" ? record.restatement.trim() : "";
  const bullets = Array.isArray(record.bullets)
    ? record.bullets.filter((value): value is string => typeof value === "string").map((value) => value.trim()).filter(Boolean).slice(0, 4)
    : [];

  if (!restatement) {
    throw new Error("Missing preamble restatement.");
  }

  return {
    restatement,
    bullets: isIteration ? [] : bullets,
  };
}

function normaliseNextSteps(raw: unknown): NextStepsPayload {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("Next steps payload was not an object.");
  }

  const record = raw as Record<string, unknown>;
  const suggestions = Array.isArray(record.suggestions)
    ? record.suggestions
        .filter((value): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value))
        .map((value) => ({
          label: typeof value.label === "string" ? value.label.trim() : "",
          prompt: typeof value.prompt === "string" ? value.prompt.trim() : "",
        }))
        .filter((value) => value.label && value.prompt)
        .slice(0, 4)
    : [];

  if (suggestions.length === 0) {
    throw new Error("No valid next-step suggestions returned.");
  }

  return { suggestions };
}

function iterationPreambleFallback(prompt: string): StagePreamblePayload {
  const compactPrompt = prompt.trim().replace(/\s+/g, " ").slice(0, 48);
  return {
    restatement: compactPrompt ? `Got it — updating ${compactPrompt}.` : "Got it — updating this now.",
    bullets: [],
  };
}

async function runWithTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  return await new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => reject(new Error("timeout")), timeoutMs);

    work.then(
      (value) => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
}

export async function generateStagePreambleWithUsage({
  invokeModel = defaultInvokeHaiku,
  isIteration,
  prompt,
  timeoutMs = PREAMBLE_TIMEOUT_MS,
}: GenerateStagePreambleOptions): Promise<StagePreambleResult> {
  try {
    const response = normaliseHaikuResponse(await runWithTimeout(
      invokeModel({
        maxTokens: 300,
        systemPrompt: isIteration ? ITERATION_PREAMBLE_SYSTEM_PROMPT : PREAMBLE_SYSTEM_PROMPT,
        temperature: isIteration ? 0.35 : 0.4,
        timeoutMs,
        userMessage: prompt,
      }),
      timeoutMs,
    ));

    return {
      payload: normalisePreamble(parseJsonText(response.text), isIteration),
      usage: response.usage,
    };
  } catch (error) {
    console.warn("[buildNarration] preamble failed — using fallback:", error instanceof Error ? error.message : String(error));
    return {
      payload: isIteration ? iterationPreambleFallback(prompt) : PREAMBLE_FALLBACK,
      usage: { inputTokens: 0, outputTokens: 0 },
    };
  }
}

export async function generateStagePreamble(options: GenerateStagePreambleOptions): Promise<StagePreamblePayload> {
  const result = await generateStagePreambleWithUsage(options);
  return result.payload;
}

export async function generateNextStepsWithUsage({
  appDescriptor,
  fileList,
  invokeModel = defaultInvokeHaiku,
  isIteration,
  prompt,
  timeoutMs = NEXT_STEPS_TIMEOUT_MS,
}: GenerateNextStepsOptions): Promise<NextStepsResult> {
  if (isIteration) {
    return {
      payload: null,
      usage: { inputTokens: 0, outputTokens: 0 },
    };
  }

  const fileContext = fileList.length > 0 ? fileList.join(", ") : "App.tsx";
  const userMessage = [
    `Original prompt: ${prompt}`,
    `App descriptor: ${appDescriptor}`,
    `Files: ${fileContext}`,
  ].join("\n");

  try {
    const response = normaliseHaikuResponse(await runWithTimeout(
      invokeModel({
        maxTokens: 400,
        systemPrompt: NEXT_STEPS_SYSTEM_PROMPT,
        temperature: 0.6,
        timeoutMs,
        userMessage,
      }),
      timeoutMs,
    ));

    return {
      payload: normaliseNextSteps(parseJsonText(response.text)),
      usage: response.usage,
    };
  } catch (error) {
    console.warn("[buildNarration] next_steps failed — using fallback:", error instanceof Error ? error.message : String(error));
    return {
      payload: NEXT_STEPS_FALLBACK,
      usage: { inputTokens: 0, outputTokens: 0 },
    };
  }
}

export async function generateNextSteps(options: GenerateNextStepsOptions): Promise<NextStepsPayload | null> {
  const result = await generateNextStepsWithUsage(options);
  return result.payload;
}
