import { z } from "zod";
import type { StudioFile } from "@beomz-studio/contracts";

import {
  buildProjectMemoryPrompt,
  type ProjectChatHistoryEntry,
} from "./projectChat.js";

export interface WebsiteContext {
  content: string | null;
  fetchFailed: boolean;
  url: string;
}

export interface StructuredChatResponse {
  implementPlan: string | null;
  message: string;
  readyToImplement: boolean;
}

interface BuildChatPromptInput {
  chatHistory: readonly ProjectChatHistoryEntry[];
  chatSummary: string | null;
  existingFiles: readonly StudioFile[];
  projectName?: string | null;
  websiteContext?: WebsiteContext | null;
  // BEO-465: when present, already-known build context (app type, features,
  // style, …) accumulated across the chat. Feed it back into the prompt so
  // the AI doesn't re-ask what the user already answered.
  accumulatedContext?: string | null;
  // BEO-465: when true, we have ~0.7–0.89 confidence and only need one last
  // nudge. The AI should summarise what it knows and ask a final confirmation.
  nearReady?: boolean;
}

const structuredChatResponseSchema = z.object({
  implementPlan: z.string().trim().min(1).nullable().optional(),
  message: z.string().trim().min(1),
  readyToImplement: z.boolean().optional().default(false),
});

const SENIOR_COLLEAGUE_RULES = [
  "You are Beomz, the AI teammate inside the app builder.",
  "Voice: senior developer colleague. Smart. Direct. Helpful. Never robotic.",
  "Follow these rules exactly:",
  "1. Never say \"I can't\" or \"I don't have the ability to\". Say what you can do next.",
  "2. Every reply must use markdown inside the message field. Use **bold**, `code`, numbered steps, and fenced code blocks when useful.",
  "3. When commands or snippets help, make them copy-paste ready.",
  "4. No apologies. No filler like \"certainly\", \"of course\", or \"I'd be happy to\".",
  "5. Use short sentences. Get to the point fast.",
  "6. Proactively include the adjacent detail the user will likely need next.",
  "7. If an app already exists, never ask setup questions about users, industry, or purpose.",
  "8. For deployment or publishing questions, give real step-by-step guidance with concrete commands and destinations.",
  "9. For a clear request, state exactly what you will do. Do not ask questions.",
  "10. For an ambiguous request, ask exactly one targeted question. Nothing more.",
  'CRITICAL: These messages must never trigger a build under any circumstances: "hi", "hello", "hey", "thanks", "ok", "okay", "sure", "yes", "no", greetings in any language, and messages under 5 characters.',
  "For those messages: reply conversationally only. readyToImplement=false. implementPlan=null.",
].join("\n");

const RESPONSE_RULES = [
  "Intent handling:",
  "- Greeting: 1-2 warm sentences. If an app exists, reference the real app by name or its current features.",
  "- App question: answer directly from the files in context. Use bullets for feature lists.",
  "- Clear build or change request in chat mode: explain exactly what you'll change in 1-2 sentences. Set readyToImplement=true and provide a concrete implementPlan.",
  "- Research request: if website content is available, summarise what it does and what is worth borrowing. If website fetch failed, say you can build from the user's description and ask for the key features to replicate.",
  "- Deployment or publishing question: use numbered steps and fenced bash or ts blocks when relevant.",
  "- Ambiguous request: ask one specific question that unlocks the next step.",
].join("\n");

const JSON_OUTPUT_RULES = [
  "Return valid JSON only. No preface. No code fence.",
  "Use this exact shape:",
  "{\"message\":\"markdown string\",\"readyToImplement\":false,\"implementPlan\":null}",
  "Rules for the JSON fields:",
  "- message: the user-facing markdown reply.",
  "- readyToImplement: true only when you have a concrete plan that can be executed right now.",
  "- implementPlan: null unless readyToImplement is true.",
  "- When implementPlan is set, keep it to 1-3 sentences. Name likely files and concrete changes when you can infer them from context.",
].join("\n");

function buildWebsiteContextBlock(websiteContext?: WebsiteContext | null): string {
  if (!websiteContext) {
    return "";
  }

  if (websiteContext.content) {
    return [
      "## Website context",
      `Source URL: ${websiteContext.url}`,
      "Fetched page content:",
      websiteContext.content,
    ].join("\n");
  }

  if (websiteContext.fetchFailed) {
    return [
      "## Website context",
      `A website or product reference was mentioned: ${websiteContext.url}`,
      "Jina fetch was unavailable or returned no usable content.",
      "If the user wants something similar, ask for the key features or flows to replicate.",
    ].join("\n");
  }

  return "";
}

export function buildStructuredChatSystemPrompt(input: BuildChatPromptInput): string {
  const memoryBlock = buildProjectMemoryPrompt({
    appName: input.projectName,
    chatSummary: input.chatSummary,
    files: input.existingFiles,
    history: input.chatHistory,
  });
  const websiteBlock = buildWebsiteContextBlock(input.websiteContext);

  return [
    SENIOR_COLLEAGUE_RULES,
    "",
    RESPONSE_RULES,
    "",
    JSON_OUTPUT_RULES,
    "",
    memoryBlock,
    websiteBlock,
  ]
    .filter((section) => section.trim().length > 0)
    .join("\n\n");
}

export function buildClarifyingQuestionSystemPrompt(input: BuildChatPromptInput): string {
  const memoryBlock = buildProjectMemoryPrompt({
    appName: input.projectName,
    chatSummary: input.chatSummary,
    files: input.existingFiles,
    history: input.chatHistory,
  });
  const websiteBlock = buildWebsiteContextBlock(input.websiteContext);

  const accumulated = input.accumulatedContext?.trim();
  const accumulatedBlock = accumulated && accumulated.length > 0
    ? [
        "## What you already know",
        accumulated,
        "Do NOT repeat these facts back as a question. Build on them.",
      ].join("\n")
    : "";

  // BEO-465: priority for choosing the single missing piece to ask about.
  const questionPriority = [
    "## Question priority (ask about the FIRST unknown in this list)",
    "1. App type / category (if unknown)",
    "2. Key features (if type is known but features are not)",
    "3. Design style / vibe (if features are known but style is not)",
    "4. Final confirmation (if style is known) — state the plan in one line and ask \"sound right?\"",
  ].join("\n");

  const nearReadyHint = input.nearReady
    ? [
        "You are almost ready to build — one more answer will unlock it.",
        "Ask the single most important remaining detail (usually style or a critical missing feature).",
        "Keep it tight and optimistic — the user knows they are close.",
      ].join(" ")
    : "";

  return [
    "You are Beomz, a senior developer teammate gathering information to build an app.",
    "Ask exactly ONE short, natural question to gather the most important missing information.",
    "Do NOT use bullet points. Do NOT ask multiple questions. Do NOT repeat what the user already told you.",
    "Keep it under 20 words. Conversational tone. No filler. No apologies. No preamble.",
    "Never ask setup questions when an app already exists.",
    "If a website fetch failed, ask for the key feature or flow to replicate.",
    nearReadyHint,
    "",
    questionPriority,
    "",
    accumulatedBlock,
    memoryBlock,
    websiteBlock,
  ]
    .filter((section) => section.trim().length > 0)
    .join("\n\n");
}

function extractJsonCandidate(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  return trimmed;
}

export function parseStructuredChatResponse(raw: string): StructuredChatResponse {
  const fallbackMessage = raw.trim();
  const candidate = extractJsonCandidate(raw);

  if (!candidate) {
    return {
      message: "Share the next change or question, and I'll map the fastest path.",
      readyToImplement: false,
      implementPlan: null,
    };
  }

  try {
    const parsed = structuredChatResponseSchema.parse(JSON.parse(candidate));
    const readyToImplement = parsed.readyToImplement && Boolean(parsed.implementPlan);

    return {
      message: parsed.message,
      readyToImplement,
      implementPlan: readyToImplement ? parsed.implementPlan ?? null : null,
    };
  } catch {
    return {
      message: fallbackMessage || "Share the next change or question, and I'll map the fastest path.",
      readyToImplement: false,
      implementPlan: null,
    };
  }
}
