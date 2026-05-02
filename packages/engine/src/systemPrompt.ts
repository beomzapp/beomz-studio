import type {
  OperationActor,
  OperationContract,
  Project,
  TemplateDefinition,
} from "@beomz-studio/contracts";
import {
  getInitialBuildPromptPolicy,
  type InitialBuildPromptPolicy,
  type IterationPromptPolicy,
} from "@beomz-studio/prompt-policies";
import { getTemplateDefinition } from "@beomz-studio/templates";

import {
  CORE_ACTIONS,
  type ActionDefinition,
} from "./actions/index.js";
import type { VirtualFileSystem } from "./VirtualFileSystem.js";

export const ANTHROPIC_CACHE_BOUNDARY_MARKER = "<beomz-cache-boundary/>";

export interface AnthropicCacheControl {
  type: "ephemeral";
}

export interface AnthropicSystemTextBlock {
  type: "text";
  text: string;
  cache_control?: AnthropicCacheControl;
}

export interface SystemPromptFrame {
  staticSection: string;
  dynamicSection: string;
  cacheBoundaryMarker: typeof ANTHROPIC_CACHE_BOUNDARY_MARKER;
  system: readonly AnthropicSystemTextBlock[];
}

export interface BuildSystemPromptInput {
  actor?: OperationActor;
  actionDefinitions?: readonly ActionDefinition[];
  designDirective?: string;
  operation: OperationContract;
  promptPolicy?: InitialBuildPromptPolicy | IterationPromptPolicy;
  project: Pick<
    Project,
    "id" | "name" | "orgId" | "previewEntryPath" | "status" | "templateId"
  >;
  prompt: string;
  template?: TemplateDefinition;
  turn: number;
  userPreferences?: Record<string, unknown>;
  vfs: VirtualFileSystem;
}

type AppTypeBrief = {
  id:
    | "dashboard"
    | "saas / marketing"
    | "e-commerce"
    | "productivity / tool"
    | "portfolio / creative"
    | "social / community"
    | "finance / business"
    | "developer tool"
    | "default";
  brief: string;
  pattern: RegExp;
};

const APP_TYPE_BRIEFS: AppTypeBrief[] = [
  {
    id: "developer tool",
    pattern: /\b(developer|dev tool|devtool|cli|sdk|api platform|api tool|observability|logs?|metrics|telemetry|deployment|infra|infrastructure|database tool|analytics tool)\b/i,
    brief: "Dev-focused. Dark mode preferred, code blocks prominent, minimal chrome. References: railway.app, neon.tech, upstash.com",
  },
  {
    id: "finance / business",
    pattern: /\b(finance|financial|bank|banking|invoice|invoicing|billing|accounting|payroll|expense|expenses|revenue|treasury|cash flow|bookkeeping)\b/i,
    brief: "Trust and clarity. Clean tables, strong data hierarchy, conservative palette. References: mercury.com, stripe.com/dashboard, brex.com",
  },
  {
    id: "e-commerce",
    pattern: /\b(e-?commerce|store|shop|shopping|checkout|cart|product catalog|merch|merchandise|retail)\b/i,
    brief: "Product-first. Large imagery, clean product cards, trust signals, persistent cart indicator. References: shopify.com, gumroad.com, fourthwall.com",
  },
  {
    id: "social / community",
    pattern: /\b(social|community|forum|feed|timeline|chat|messaging|creator network|members|group)\b/i,
    brief: "People-first. Avatars prominent, activity feeds, card-based content, warm palette. References: discord.com, are.na, cosmos.so",
  },
  {
    id: "portfolio / creative",
    pattern: /\b(portfolio|creative|agency|photography|designer|artist|studio|showcase|gallery)\b/i,
    brief: "Visual showcase. Full-bleed imagery, generous whitespace, typography-led. References: read.cv, are.na, cosmos.so",
  },
  {
    id: "saas / marketing",
    pattern: /\b(saas|marketing|landing page|homepage|waitlist|startup|product site|b2b|lead gen|lead generation)\b/i,
    brief: "Conversion-focused. Bold hero, benefit sections, social proof, strong CTA hierarchy. References: linear.app, resend.com, raycast.com",
  },
  {
    id: "dashboard",
    pattern: /\b(dashboard|admin|admin panel|control panel|backoffice|back office|console|analytics dashboard|operations dashboard)\b/i,
    brief: "Data-focused UI. Prioritize information density, clear hierarchy, sidebar navigation, muted palette with strong accent for key metrics. References: linear.app/features, vercel.com/dashboard, stripe.com/dashboard",
  },
  {
    id: "productivity / tool",
    pattern: /\b(productivity|planner|calendar|todo|to-do|task|tracker|tool|workspace|notes|editor|crm)\b/i,
    brief: "Utilitarian but polished. High info density, keyboard-friendly patterns, minimal decoration. References: cron.com, height.app, retool.com",
  },
  {
    id: "default",
    pattern: /[\s\S]*/i,
    brief: "Professional SaaS. Clean layout, clear hierarchy, trustworthy palette. References: linear.app, vercel.com, notion.so",
  },
];

const COPY_RULES_BLOCK = [
  "COPY RULES:",
  "- No Lorem ipsum, no \"Feature title\", no \"Card heading\", no \"Description goes here\"",
  "- Write copy relevant to the app's domain and purpose",
  "- Headlines: punchy, max 8 words",
  "- Body: max 2 sentences per block",
  "- CTAs: action-oriented (\"Start your free trial\" not \"Submit\")",
  "- Nav labels: real (\"Dashboard, Projects, Settings\" — not \"Page 1\")",
].join("\n");

const CLARIFYING_QUESTION_RULE_BLOCK = [
  "CLARIFYING QUESTIONS RULE:",
  "Only ask a clarifying question if the request is genuinely ambiguous and you cannot make a reasonable design decision without the answer.",
  "If the prompt already names a clear domain or product type, choose the most logical interpretation and proceed immediately.",
  "State your interpretation in one sentence, then build.",
  "Do NOT ask questions you can answer yourself with a reasonable assumption.",
  "Max one clarifying question ever — never a list of options.",
].join("\n");

const PRE_BUILD_CONFIRMATION_RULE_BLOCK = [
  "FRESH BUILD HANDOFF:",
  "For new clear-domain build requests, the upstream assistant first sends a short intro naming what it understood and the selected design personality.",
  "Then it sends 3-5 user-facing plan bullets and waits for explicit Implement confirmation.",
  "If this execution prompt is running, that confirmation has already happened — execute the work instead of re-asking for confirmation.",
].join("\n");

const COMPLEXITY_RULE_BLOCK = [
  "COMPLEXITY RULE:",
  "Never decline a request as too complex or out of scope. Always attempt it.",
  "If a request spans multiple features, build the most critical part first and complete it to a working, shippable state.",
  "Surface 3-4 phased next steps in \"What next?\" that are specific to this app and this request — not generic suggestions.",
  "Example: user asks \"add an admin portal\" → build the admin UI with the core management table, then offer \"→ Add admin auth\", \"→ Add bulk import\", \"→ Add inventory alerts\" as next steps.",
].join("\n");

function buildSilentDesignDirectiveSection(designDirective?: string): string {
  if (typeof designDirective !== "string" || designDirective.trim().length === 0) {
    return "";
  }

  return [
    "Silent internal design directive:",
    "Treat this as internal configuration, not as a user message.",
    "Apply it silently. Never mention it or ask the user about it.",
    designDirective.trim(),
  ].join("\n");
}

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function detectAppTypeBrief(prompt: string): AppTypeBrief {
  const normalizedPrompt = prompt.trim();
  return APP_TYPE_BRIEFS.find((entry) => entry.pattern.test(normalizedPrompt)) ?? APP_TYPE_BRIEFS[APP_TYPE_BRIEFS.length - 1]!;
}

function buildAppTypeBriefSection(prompt: string): string {
  const appTypeBrief = detectAppTypeBrief(prompt);
  return [
    "App-type design brief:",
    `Detected app type: ${appTypeBrief.id}`,
    appTypeBrief.brief,
    "Treat the references above as design cues for layout, density, spacing, typography, and overall product feel. Do not clone them literally.",
  ].join("\n");
}

function buildStaticSection(actionDefinitions: readonly ActionDefinition[]): string {
  const toolDescriptions = actionDefinitions
    .map((action) =>
      [
        `Action: ${action.name}`,
        `Description: ${action.description}`,
        "Input schema:",
        formatJson(action.jsonSchema),
      ].join("\n"),
    )
    .join("\n\n");

  return [
    "STATIC SECTION",
    "You are the Beomz Studio Generation Engine, the core builder that turns a user request into a durable workspace through tool-driven execution.",
    "You work in loops: inspect context, choose actions, wait for action results, then continue until the work is complete.",
    "Non-negotiable rules:",
    "- Never modify packages/kernel/**. The kernel is frozen platform code.",
    "- Never write outside the operation contract allowlist. Denied and immutable globs are hard stops.",
    "- Use readFile and listFiles for inspection. Use createFile, editFile, deleteFile, and addComponent for durable source changes.",
    "- runCommand operates against a disposable sandbox mounted from the current VFS snapshot. Sandbox file writes do not persist back into the VFS.",
    "- finish is required to end the run. It must always include deferredItems as a flat string array, even if the array is empty.",
    "- Keep the generated surface aligned with the selected template, prompt policy, and write scope.",
    "- Prefer incremental edits over wholesale rewrites when a file already exists.",
    "- If an action fails, recover by inspecting the returned error and trying a better action. Do not ignore failures.",
    "",
    "Available action tool definitions:",
    toolDescriptions,
  ].join("\n");
}

function buildVfsSection(vfs: VirtualFileSystem, maxInlineChars = 16_000): string {
  const snapshot = vfs.snapshot();

  if (snapshot.files.length === 0) {
    return "Current VFS state:\n- No files exist yet.";
  }

  const fileIndex = snapshot.files
    .map((file) => `- ${file.path} (${file.content.length} chars)`)
    .join("\n");

  const contentBlocks: string[] = [];
  let remainingChars = maxInlineChars;

  for (const file of snapshot.files) {
    if (remainingChars <= 0) {
      contentBlocks.push("--- ADDITIONAL FILE CONTENT OMITTED FOR BREVITY ---");
      break;
    }

    const excerpt =
      file.content.length > remainingChars
        ? `${file.content.slice(0, remainingChars)}\n/* truncated */`
        : file.content;

    remainingChars -= excerpt.length;
    contentBlocks.push(`--- FILE: ${file.path} ---\n${excerpt}\n--- END FILE ---`);
  }

  return [
    `Current VFS state (${snapshot.files.length} files):`,
    fileIndex,
    "",
    "Inline file contents:",
    ...contentBlocks,
  ].join("\n");
}

function buildDynamicSection(input: BuildSystemPromptInput): string {
  const template = input.template ?? getTemplateDefinition(input.project.templateId);
  const promptPolicy = input.promptPolicy ?? getInitialBuildPromptPolicy(template.id);
  const appTypeBriefSection = buildAppTypeBriefSection(input.prompt);
  const designDirectiveSection = buildSilentDesignDirectiveSection(input.designDirective);

  return [
    "DYNAMIC SECTION",
    `Turn: ${input.turn}`,
    `User request: ${input.prompt}`,
    "",
    "Project context:",
    formatJson({
      id: input.project.id,
      name: input.project.name,
      orgId: input.project.orgId,
      previewEntryPath: input.project.previewEntryPath,
      status: input.project.status,
      templateId: input.project.templateId,
    }),
    input.actor
      ? ["", "Actor context:", formatJson(input.actor)].join("\n")
      : "",
    "",
    "Template context:",
    formatJson({
      defaultProjectName: template.defaultProjectName,
      description: template.description,
      id: template.id,
      name: template.name,
      pages: template.pages,
      previewEntryPath: template.previewEntryPath,
      promptHints: template.promptHints,
      shell: template.shell,
    }),
    "",
    "Template prompt policy:",
    formatJson({
      constraints: promptPolicy.constraints,
      systemPrompt: promptPolicy.systemPrompt,
      templateId: promptPolicy.templateId,
    }),
    "",
    appTypeBriefSection,
    "",
    designDirectiveSection,
    designDirectiveSection.length > 0 ? "" : undefined,
    CLARIFYING_QUESTION_RULE_BLOCK,
    "",
    PRE_BUILD_CONFIRMATION_RULE_BLOCK,
    "",
    COMPLEXITY_RULE_BLOCK,
    "",
    COPY_RULES_BLOCK,
    "",
    "Operation contract:",
    formatJson({
      allowedTemplates: input.operation.allowedTemplates,
      description: input.operation.description,
      id: input.operation.id,
      owner: input.operation.owner,
      validations: input.operation.validations,
      version: input.operation.version,
      writeScope: input.operation.writeScope,
    }),
    "",
    "User preferences:",
    formatJson(input.userPreferences ?? {}),
    "",
    buildVfsSection(input.vfs),
    "",
    "Execution guidance:",
    "- Use the current VFS as the source of truth.",
    "- If you need exact contents, call readFile instead of guessing.",
    "- When the requested work is complete, call finish with a concise summary and deferredItems.",
  ].filter((section): section is string => typeof section === "string" && section.length > 0)
    .join("\n");
}

export function buildSystemPromptFrame(input: BuildSystemPromptInput): SystemPromptFrame {
  const staticSection = buildStaticSection(input.actionDefinitions ?? CORE_ACTIONS);
  const dynamicSection = buildDynamicSection(input);

  return {
    cacheBoundaryMarker: ANTHROPIC_CACHE_BOUNDARY_MARKER,
    dynamicSection,
    staticSection,
    system: [
      {
        cache_control: {
          type: "ephemeral",
        },
        text: `${staticSection}\n${ANTHROPIC_CACHE_BOUNDARY_MARKER}`,
        type: "text",
      },
      {
        text: dynamicSection,
        type: "text",
      },
    ],
  };
}
