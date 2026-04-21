import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { StudioFile } from "@beomz-studio/contracts";

import { apiConfig } from "../config.js";
import {
  buildProjectMemoryPrompt,
  type ProjectChatHistoryEntry,
} from "./projectChat.js";

export interface WebsiteContext {
  content: string | null;
  fetchFailed: boolean;
  label: string;
  sourceType: "search" | "url";
  url?: string;
}

export interface StructuredChatResponse {
  implementPlan: string | null;
  message: string;
  readyToImplement: boolean;
}

const PLAN_SUMMARY_TIMEOUT_MS = 4_000;
const STRICT_URL_CLARIFYING_RULE = `The website content has been fetched and provided to you as context.
You MUST NOT ask about anything that can be clearly determined from this content — including industry, sector, purpose, target audience, or type of application. Only ask about implementation decisions the user must make that cannot be inferred from the URL content, such as:
which specific features to include/exclude, whether users need to sign up/log in, and whether to keep or change the visual style.`;

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
  // BEO-465: when true, we have ~0.7–0.79 confidence and only need one last
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
  "11. NEVER say phrases like \"Building now\", \"I'm building this\", \"Creating now\", or \"On it, building\" in conversational responses or plan summaries.",
  'CRITICAL: These messages must never trigger a build under any circumstances: "hi", "hello", "hey", "thanks", "ok", "okay", "sure", "yes", "no", greetings in any language, and messages under 5 characters.',
  "For those messages: reply conversationally only. readyToImplement=false. implementPlan=null.",
].join("\n");

const RESPONSE_RULES = [
  "Intent handling:",
  "- Greeting when there are no files yet (brand-new project): reply with exactly \"Hey! 👋 Ready to build something awesome? What's the idea?\"",
  "- Greeting when files exist (real app in context): reference the app naturally by its real name in 1-2 sentences, e.g. \"Hey! PettyCash is looking good — what are we working on?\"",
  "- App question: answer directly from the files in context. Use bullets for feature lists.",
  "- Clear build or change request in chat mode: explain exactly what you'll change in 1-2 sentences. Set readyToImplement=true and provide a concrete implementPlan. For readyToImplement replies, start with \"Here's what I'll do:\" and use bullets. Never imply the build has already started.",
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
      websiteContext.label,
      "Website content:",
      websiteContext.content,
    ].join("\n");
  }

  if (websiteContext.fetchFailed) {
    if (websiteContext.sourceType === "search") {
      return [
        "## Website context",
        websiteContext.label,
        "Web search returned no usable content.",
        "If the user wants research anyway, answer with what you can infer and say the search results were limited.",
      ].join("\n");
    }

    return [
      "## Website context",
      websiteContext.label,
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
  const hasUrlGrounding = Boolean(
    input.websiteContext
      && input.websiteContext.sourceType === "url"
      && input.websiteContext.content
      && input.websiteContext.content.trim().length > 0,
  );

  const accumulated = input.accumulatedContext?.trim();
  const accumulatedBlock = accumulated && accumulated.length > 0
    ? [
        "## What you already know",
        accumulated,
        "Do NOT repeat these facts back as a question. Build on them.",
      ].join("\n")
    : "";

  // BEO-465: priority for choosing the single missing piece to ask about.
  const questionPriority = hasUrlGrounding
    ? [
        "## Question priority (URL already provides context — ask about the FIRST unknown in this list)",
        "1. Keep vs change: what should stay the same from the reference, and what should differ?",
        "2. Access model: should users sign up/log in, or is it public-only?",
        "3. Feature scope: specific features or flows to add/remove from the reference?",
        "4. Visual direction: keep the same palette/style or change it?",
      ].join("\n")
    : [
        "## Question priority (ask about the FIRST unknown in this list)",
        "1. App type / category (if unknown)",
        "2. Key features (if type is known but features are not)",
        "3. Design style / vibe (if features are known but style is not)",
        "4. Final confirmation (if style is known) — state the plan in one line and ask \"sound right?\"",
      ].join("\n");

  const urlGroundingRule = hasUrlGrounding
    ? [
        "A reference URL was fetched successfully.",
        "Treat the website context as known facts, not unknowns.",
        "Do NOT ask what the website's purpose, industry, or basic type is if the fetched content already shows it.",
      ].join(" ")
    : "";

  const nearReadyHint = input.nearReady
    ? [
        "You are almost ready to build — one more answer will unlock it.",
        "Ask the single most important remaining detail (usually style or a critical missing feature).",
        "Keep it tight and optimistic — the user knows they are close.",
      ].join(" ")
    : "";
  const strictUrlClarifyingRule = hasUrlGrounding
    ? STRICT_URL_CLARIFYING_RULE
    : "";

  return [
    "You are Beomz, a senior developer teammate gathering information to build an app.",
    "Ask exactly ONE short, natural question to gather the most important missing information.",
    "Ask ONE question at a time. Maximum one sentence.",
    "Do NOT use bullet points. Do NOT ask multiple questions. Do NOT repeat what the user already told you.",
    "Keep it under 20 words. Conversational tone. No filler. No apologies. No preamble.",
    "No preamble. Never start with 'I can see...', 'Based on...', or any context explanation. Ask the question directly.",
    "Never wrap your question in parentheses.",
    "Never explain what you already know before asking.",
    "Never ask setup questions when an app already exists.",
    "If a website fetch failed, ask for the key feature or flow to replicate.",
    urlGroundingRule,
    strictUrlClarifyingRule,
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

function buildPlanSummaryFallback(accumulatedContext: string, projectName?: string | null): string {
  const brief = accumulatedContext
    .replace(/\s+/g, " ")
    .trim();
  const isTechnicalDetail = (part: string): boolean => /(\b[\w-]+\.(?:tsx?|jsx?|css|scss|json|md)\b|\/|\\|\b(component|components|file|files|folder|folders|directory|architecture|implementation)\b)/i.test(part);
  const featureHints = brief
    .split(/[,.]| with | and /i)
    .map((part) => part.trim())
    .filter((part) => part.length >= 4)
    .filter((part) => !isTechnicalDetail(part))
    .slice(0, 4)
    .map((part) => `- ${part.replace(/\.$/, "")}`);

  const appName = projectName?.trim() || "Your app";
  const bullets = featureHints.length > 0
    ? featureHints.join("\n")
    : "- Focused core flow\n- Clear user actions\n- Polished visual direction\n- Practical feature set";

  return [
    "Here's what I'll do:",
    `**${appName}**`,
    bullets,
    "",
    "Ready when you are — or type any changes first.",
  ].join("\n");
}

export async function generatePlanSummary(
  accumulatedContext: string,
  projectName?: string | null,
): Promise<string> {
  const brief = accumulatedContext.trim();
  if (!brief) {
    return buildPlanSummaryFallback(accumulatedContext, projectName);
  }

  const apiKey = apiConfig.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return buildPlanSummaryFallback(brief, projectName);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PLAN_SUMMARY_TIMEOUT_MS);

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create(
      {
        model: "claude-haiku-4-5-20251001",
        max_tokens: 140,
        system: [
          "Based on this build brief, write a short friendly plan summary.",
          "Keep it under 60 words. Be specific. Use markdown.",
          "Do not mention HTML, CSS, or JavaScript.",
          "If you must mention the stack, say React and TypeScript.",
          "Start with \"Here's what I'll do:\".",
          "Use short bullet points after the title. Use at most 4 bullet points.",
          "Bullets must be user-facing features only (what the app does).",
          "No filenames, no component names, no route names, and no file architecture breakdowns.",
          "No technical implementation details.",
          "Never say the build has already started or use phrases like \"Building now\".",
          'Format:',
          '"Here\'s what I\'ll do:',
          '[Suggested app name]',
          '',
          '[Feature 1]',
          '[Feature 2]',
          '[Feature 3]',
          '[Design style]',
          '',
          'Ready when you are — or type any changes first."',
          'No intro phrases like "Sure!" or "Great!". Just the plan.',
        ].join("\n"),
        messages: [
          {
            role: "user",
            content: [
              `Project name: ${projectName?.trim() || "Infer from the brief."}`,
              `Brief: ${brief}`,
            ].join("\n"),
          },
        ],
      },
      { signal: controller.signal },
    );

    const text = response.content
      .filter((block): block is Anthropic.Messages.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    return text || buildPlanSummaryFallback(brief, projectName);
  } catch {
    return buildPlanSummaryFallback(brief, projectName);
  } finally {
    clearTimeout(timeoutId);
  }
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
