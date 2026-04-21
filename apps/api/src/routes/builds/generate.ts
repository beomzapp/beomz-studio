/**
 * BEO-210: Template-first streaming build handler.
 *
 * Pattern (from Claude Code QueryEngine): AsyncGenerator yields events →
 * caller persists each event to DB → SSE polling loop in events.ts picks
 * them up and delivers to the frontend in real time.
 *
 * Flow:
 *   1. Load prebuilt template files in memory as generation context.
 *   2. Call Anthropic once: "customise this template for: {prompt}"
 *      Uses tool_use so the response is structured JSON, not markdown.
 *   3. Merge customised files → emit done
 *      HMR in WebContainer picks up the delta automatically.
 *   4. Fallback: if Anthropic fails the template is shown as-is (still a
 *      working app, not a blank scaffold).
 */

import { randomUUID } from "node:crypto";
import { basename } from "node:path";

import Anthropic from "@anthropic-ai/sdk";
import type {
  BuildIntent,
  BuilderImageIntent,
  BuilderV3Event,
  BuilderV3Operation,
  BuilderV3DoneEvent,
  BuilderV3ErrorEvent,
  BuilderV3ImageIntentEvent,
  BuilderV3NextStepsEvent,
  BuilderV3PreambleEvent,
  BuilderV3StatusEvent,
  BuilderV3TraceMetadata,
  PrebuiltTemplate,
  StudioFile,
  TemplateFile,
  TemplateId,
} from "@beomz-studio/contracts";
import { createEmptyBuilderV3TraceMetadata } from "@beomz-studio/contracts";
import type { StudioDbClient } from "@beomz-studio/studio-db";
import {
  getPrebuiltTemplate,
  listPrebuiltTemplates,
  searchPrebuiltTemplatesByTags,
} from "@beomz-studio/templates";

import { apiConfig } from "../../config.js";
import { activeBuilds } from "../../lib/activeBuilds.js";
import { generateNextStepsWithUsage, generateStagePreambleWithUsage } from "../../lib/buildNarration.js";
import { createBuildStageEmitter } from "../../lib/buildStageEvents.js";
import { classifyImageIntent } from "../../lib/classifyImageIntent.js";
import {
  CONVERSATIONAL_COST,
  NEGATIVE_FLOOR_CONST,
  calcCreditCost,
  calcCreditCostHaiku,
  isAdminEmail,
} from "../../lib/credits.js";
import { enrichPrompt } from "../../lib/enrichPrompt.js";
import { planPhases } from "../../lib/planPhases.js";
import type { Phase } from "../../lib/planPhases.js";
import {
  appendProjectChatHistory,
  buildConversationMessages,
  readProjectChatHistory,
  shouldRefreshProjectChatSummary,
  type ProjectChatHistoryEntry,
} from "../../lib/projectChat.js";
import { generateProjectChatSummary } from "../../lib/projectChatSummary.js";
import { rewriteNeonImports, sanitiseContent, sanitiseFiles } from "../../lib/sanitise.js";
import { classifyPalette } from "../../lib/slm/client.js";
import {
  getSchemaTableList,
  isAllowedMigrationStatement,
  runSql,
} from "../../lib/userDataClient.js";
import { buildAnthropicImageBlock } from "../../lib/anthropicImages.js";
import {
  buildClarifyingQuestionSystemPrompt,
  buildStructuredChatSystemPrompt,
  parseStructuredChatResponse,
  type StructuredChatResponse,
  type WebsiteContext,
} from "../../lib/chatPrompts.js";
import { classifyIntent, type Intent } from "../../lib/intentClassifier.js";
import { injectUrlContextIntoBuildPrompt, loadUrlContext } from "../../lib/webFetch.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BuildGenerateInput {
  buildId: string;
  confirmedIntent?: BuilderImageIntent;
  projectId: string;
  orgId: string;
  userId: string | null;
  userEmail: string | null;
  imageUrl?: string;
  prompt: string;
  sourcePrompt: string;
  templateId: string;
  model: string;
  requestedAt: string;
  operationId: string;
  isIteration: boolean;
  existingFiles: readonly StudioFile[];
  // BEO-371: project name + original prompt for context-aware intent detection.
  projectName?: string;
  // BEO-197: phased build context (supplied when continuing a phase)
  phaseOverride?: {
    phases: Phase[];
    currentPhase: number;
    phasesTotal: number;
  };
  // BEO-312: set by confirm-scope endpoint to skip re-classification and use
  // pre-enriched context with confirmed feature list injected into the prompt
  confirmedScope?: {
    features: string[];
    enrichedPrompt: string;
  };
  // BEO-335: set by force-simple endpoint — skips planPhases and caps max_tokens
  // to keep the build within ~6 credits for low-credit orgs.
  forcedSimple?: boolean;
}

interface CustomiseResult {
  files: Array<{ path: string; content: string }>;
  summary: string;
  appName?: string;
  migrations?: string[];
  outputTokens: number;
  inputTokens?: number;
}

interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

interface NarrationTextResult {
  message: string;
  usage: TokenUsage;
}

const ZERO_TOKEN_USAGE: TokenUsage = {
  inputTokens: 0,
  outputTokens: 0,
};

function addTokenUsage(total: TokenUsage, usage: TokenUsage): TokenUsage {
  return {
    inputTokens: total.inputTokens + usage.inputTokens,
    outputTokens: total.outputTokens + usage.outputTokens,
  };
}

function calcSonnetCostUsd(inputTokens: number, outputTokens: number): number {
  return (inputTokens * 3 + outputTokens * 15) / 1_000_000;
}

function calcHaikuCostUsd(inputTokens: number, outputTokens: number): number {
  return (inputTokens * 1 + outputTokens * 5) / 1_000_000;
}

function roundUsd(costUsd: number): number {
  return Math.round(costUsd * 10000) / 10000;
}

// ─── Anthropic tool definition ────────────────────────────────────────────────

const DELIVER_FILES_TOOL: Anthropic.Messages.Tool = {
  name: "deliver_customised_files",
  description:
    "Deliver all generated app files. "
    + "App.tsx is always required. "
    + "For multi-page apps (sidebar nav, multiple sections) also include one file per major page — "
    + "e.g. AssetsPage.tsx, WorkOrdersPage.tsx, TeamPage.tsx. "
    + "The summary must be one sentence describing the finished app.",
  input_schema: {
    type: "object",
    properties: {
      files: {
        type: "array",
        description:
          "All generated files. App.tsx (default export required) is always first. "
          + "Multi-page apps: App.tsx + one file per major page/section.",
        items: {
          type: "object",
          properties: {
            path: { type: "string", description: "Filename only, e.g. App.tsx or AssetsPage.tsx" },
            content: { type: "string", description: "Complete file content, no placeholders" },
          },
          required: ["path", "content"],
        },
      },
      summary: {
        type: "string",
        description: "One sentence describing what this app does.",
      },
      appName: {
        type: "string",
        description: "The brand name of the app you built, e.g. 'Spendr', 'AssetHub', 'TrackMate'. Short, memorable, no spaces.",
      },
      migrations: {
        type: "array",
        description:
          "SQL migration statements needed to support this iteration's changes (e.g. ALTER TABLE ... ADD COLUMN IF NOT EXISTS, CREATE TABLE IF NOT EXISTS). "
          + "Empty array if no schema changes are needed. "
          + "NEVER include DROP TABLE, DROP COLUMN, or ALTER COLUMN TYPE.",
        items: { type: "string" },
      },
    },
    required: ["files", "summary"],
    additionalProperties: false,
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ts(): string {
  return new Date().toISOString();
}

function inferFileKind(path: string): StudioFile["kind"] {
  if (/\/(routes|pages|screens|views)\//.test(path) || /App\.(tsx|jsx)$/.test(path)) return "route";
  if (/\/components\//.test(path)) return "component";
  if (/\/(styles?|css)\/|\.css$/.test(path)) return "style";
  if (/\/(config|settings)\/|\.config\.(ts|js)$/.test(path)) return "config";
  if (/\/(data|fixtures)\//.test(path)) return "data";
  if (/\.(json|md)$/.test(path)) return "content";
  return "component";
}

function inferLanguage(path: string): string {
  const ext = path.split(".").pop() ?? "";
  const map: Record<string, string> = {
    tsx: "tsx",
    ts: "typescript",
    jsx: "jsx",
    js: "javascript",
    css: "css",
    json: "json",
    md: "markdown",
  };
  return map[ext] ?? "typescript";
}

// ─── React import patcher ─────────────────────────────────────────────────────
// ─── Path mapping for prebuilt templates ──────────────────────────────────────
// The WebContainer preview shell (WORKSPACE_PREVIEW_APP_TSX in webcontainer.ts)
// globs `apps/web/src/app/generated/**/*.tsx` and reads routes from
// `apps/web/src/generated/{templateId}/app.manifest.json`.
//
// Claude returns bare filenames (App.tsx, AssetsPage.tsx) or sometimes with
// directory prefixes (src/App.tsx, components/AssetsPage.tsx). Strip all
// directory prefixes and place files flat in the generated directory so the
// glob always finds them.
function remapPrebuiltPath(originalPath: string, templateId: string): string {
  // Strip any leading path components — keep only the filename.
  // "App.tsx"                    → "apps/web/src/app/generated/workspace-task/App.tsx"
  // "src/App.tsx"                → "apps/web/src/app/generated/workspace-task/App.tsx"
  // "components/AssetsPage.tsx"  → "apps/web/src/app/generated/workspace-task/AssetsPage.tsx"
  const basename = originalPath.replace(/^.*\//, "");
  return `apps/web/src/app/generated/${templateId}/${basename}`;
}

function buildSyntheticManifest(templateId: string, mainFilePath: string): StudioFile {
  // Must satisfy isGeneratedAppManifest() in contracts/generated-surface.ts.
  // Written to apps/web/src/generated/{templateId}/app.manifest.json so that
  // readGeneratedManifestFromFiles() finds it and bypasses buildGeneratedManifest().
  const manifest = {
    version: 1 as const,
    templateId,
    shell: "none",
    entryPath: "/",
    routes: [
      {
        id: `${templateId}:app`,
        path: "/",
        label: "App",
        summary: "Main application",
        auth: "public" as const,
        inPrimaryNav: false,
        filePath: mainFilePath,
      },
    ],
  };
  return {
    path: `apps/web/src/generated/${templateId}/app.manifest.json`,
    kind: "asset-manifest" as const,
    language: "json",
    content: JSON.stringify(manifest, null, 2),
    source: "platform" as const,
    locked: false,
  };
}

function templateFilesToStudioFiles(
  files: readonly TemplateFile[],
  templateId: string,
): StudioFile[] {
  let mainFilePath = `apps/web/src/app/generated/${templateId}/App.tsx`;
  const result: StudioFile[] = [];

  for (const f of files) {
    const targetPath = remapPrebuiltPath(f.path, templateId);
    if (f.path === "App.tsx" || f.path.endsWith("/App.tsx")) {
      mainFilePath = targetPath;
    }
    result.push({
      path: targetPath,
      kind: inferFileKind(targetPath),
      language: inferLanguage(targetPath),
      content: sanitiseContent(f.content, targetPath),
      source: "platform" as const,
      locked: false,
    });
    console.log("[generate] template file remapped:", f.path, "→", targetPath);
  }

  // Synthetic manifest so buildRuntimeJson() can find the entry route.
  result.push(buildSyntheticManifest(templateId, mainFilePath));
  console.log("[generate] manifest added for templateId:", templateId, "entry:", mainFilePath);

  return result;
}

function mergeFiles(
  base: StudioFile[],
  overrides: Array<{ path: string; content: string }>,
): StudioFile[] {
  const byPath = new Map<string, StudioFile>(base.map((f) => [f.path, f]));
  for (const o of overrides) {
    byPath.set(o.path, {
      path: o.path,
      kind: inferFileKind(o.path),
      language: inferLanguage(o.path),
      content: o.content,
      source: "ai" as const,
      locked: false,
    });
  }
  return Array.from(byPath.values());
}

const BLOCKED_FILENAMES = new Set([
  "supabase.tsx",
  "supabase.ts",
  "supabase-js.tsx",
  "supabase-js.ts",
  "supabase-client.tsx",
  "supabase-client.ts",
  "supabase-helper.tsx",
  "supabase-helper.ts",
  "serverless.tsx",
  "serverless.ts",
  "ui.tsx",
  "ui.ts",
  "auth.tsx",
  "auth.ts",
  "db.tsx",
  "db.ts",
  "client.tsx",
  "client.ts",
  "neon-auth.tsx",
  "neon-auth.ts",
]);

export function isBlockedFile(filePath: string): boolean {
  return BLOCKED_FILENAMES.has(basename(filePath).toLowerCase());
}

export function filterBlockedGeneratedFiles<T extends { path: string }>(files: T[]): T[] {
  return files.filter((file) => !isBlockedFile(file.path));
}

export function isNpmPackage(importPath: string): boolean {
  // Scoped npm package: @org/package, @org/package/subpath
  if (importPath.startsWith("@")) return true;
  // Bare npm specifier: react, lucide-react, neon, etc.
  // Local imports MUST start with ./ or ../
  if (!importPath.startsWith(".") && !importPath.startsWith("/")) {
    return true;
  }
  return false;
}

// ─── BEO-309: Post-generation import validator ────────────────────────────────
// After sanitiseFiles() + mergeFiles(), scan every .tsx?/.jsx? file for imports.
// Stub injection is ONLY for local paths (./ or ../). NPM package specifiers
// are never stubbed.
// Any missing local module gets a minimal stub injected so Vite never throws
// "Failed to resolve import" errors after phase builds.
export function validateAndInjectStubs(
  files: StudioFile[],
  templateId: string,
): { files: StudioFile[]; missing: string[] } {
  // Build a lookup of all basename stems present in this build (no extensions)
  const fileStems = new Set(
    files.map((f) => f.path.replace(/^.*\//, "").replace(/\.(tsx?|jsx?)$/, "")),
  );

  const missing: string[] = [];
  const stubs: StudioFile[] = [];

  for (const file of files) {
    if (!/\.(tsx?|jsx?)$/.test(file.path)) continue;

    const importMatches = [...file.content.matchAll(/from\s+['"]([^'"]+)['"]/g)];
    for (const match of importMatches) {
      const importPath = match[1];
      if (isNpmPackage(importPath)) {
        console.warn("[validateAndInjectStubs] skipping npm package import:", importPath);
        continue;
      }

      // Flatten any subdirectory prefix (./components/Foo → Foo) and strip extension
      const stem = importPath
        .replace(/^\.\//, "")
        .replace(/^\.\.\//, "")
        .replace(/^.*\//, "")
        .replace(/\.(tsx?|jsx?)$/, "");

      if (!stem || fileStems.has(stem)) continue;

      const importingFile = file.path.replace(/^.*\//, "");
      const label = `${stem} (imported in ${importingFile})`;
      if (!missing.includes(label)) {
        missing.push(label);
        fileStems.add(stem); // prevent duplicate stubs for the same component
        stubs.push({
          path: `apps/web/src/app/generated/${templateId}/${stem}.tsx`,
          kind: "component",
          language: "tsx",
          content: `export default function ${stem}() {\n  return <div className="p-4 text-gray-500">${stem} — coming soon</div>;\n}\n`,
          source: "platform" as const,
          locked: false,
        });
      }
    }
  }

  return { files: stubs.length > 0 ? [...files, ...stubs] : files, missing };
}

export function postProcessGeneratedFiles(
  files: StudioFile[],
  templateId: string,
): { files: StudioFile[]; missing: string[] } {
  const rewrittenFiles = rewriteNeonImports(files);
  const { files: withStubs, missing } = validateAndInjectStubs(rewrittenFiles, templateId);
  const filteredFiles = filterBlockedGeneratedFiles(withStubs);
  return { files: filteredFiles, missing };
}

function readTrace(metadata: Record<string, unknown>): BuilderV3TraceMetadata {
  const t = metadata.builderTrace;
  if (typeof t === "object" && t !== null && !Array.isArray(t)) {
    const raw = t as Record<string, unknown>;
    return {
      events: Array.isArray(raw.events) ? (raw.events as BuilderV3TraceMetadata["events"]) : [],
      lastEventId: typeof raw.lastEventId === "string" ? raw.lastEventId : null,
      previewReady: raw.previewReady === true,
      fallbackUsed: raw.fallbackUsed === true,
      fallbackReason: typeof raw.fallbackReason === "string" ? raw.fallbackReason : null,
    };
  }
  return createEmptyBuilderV3TraceMetadata();
}

async function appendEventToDb(
  db: StudioDbClient,
  buildId: string,
  event: BuilderV3Event,
  extraPatch?: Partial<Parameters<StudioDbClient["updateGeneration"]>[1]>,
): Promise<void> {
  const row = await db.findGenerationById(buildId);
  if (!row) return;

  const meta = typeof row.metadata === "object" && row.metadata !== null
    ? (row.metadata as Record<string, unknown>)
    : {};

  const trace = readTrace(meta);
  const newTrace: BuilderV3TraceMetadata = {
    ...trace,
    events: [...trace.events, event],
    lastEventId: event.id,
    previewReady: trace.previewReady || event.type === "preview_ready",
  };

  await db.updateGeneration(buildId, {
    metadata: { ...meta, builderTrace: newTrace },
    ...extraPatch,
  });
}

// BEO-370: append a chat message to session_events on the generation row.
// Non-fatal — build continues if this fails.
async function appendSessionEventToDb(
  db: StudioDbClient,
  buildId: string,
  event: Record<string, unknown>,
): Promise<void> {
  try {
    const row = await db.findGenerationById(buildId);
    if (!row) return;
    const current = Array.isArray(row.session_events) ? (row.session_events as Record<string, unknown>[]) : [];
    await db.updateGeneration(buildId, {
      session_events: [...current, { ...event, timestamp: new Date().toISOString() }],
    });
  } catch (err) {
    console.warn("[generate] appendSessionEventToDb failed (non-fatal):", err instanceof Error ? err.message : String(err));
  }
}

async function persistProjectChatHistory(
  db: StudioDbClient,
  projectId: string,
  userContent: string,
  assistantContent: string,
  options: {
    existingFiles: readonly StudioFile[];
    projectName?: string;
  },
): Promise<void> {
  try {
    const project = await db.findProjectById(projectId);
    if (!project) {
      return;
    }

    const updatedHistory = appendProjectChatHistory(project.chat_history, userContent, assistantContent);
    const nextChatSummary = shouldRefreshProjectChatSummary(updatedHistory.length)
      ? await generateProjectChatSummary({
          appName: options.projectName ?? project.name,
          existingSummary: typeof project.chat_summary === "string" ? project.chat_summary : null,
          files: options.existingFiles,
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
        console.warn("[generate] chat_summary column missing — persisted chat_history only.");
      } else {
        throw error;
      }
    }
  } catch (err) {
    console.warn("[generate] persistProjectChatHistory failed (non-fatal):", err instanceof Error ? err.message : String(err));
  }
}

function buildConversationalSystemPrompt(
  projectName: string | undefined,
  existingFiles: readonly StudioFile[],
  chatSummary: string | null,
  chatHistory: readonly ProjectChatHistoryEntry[],
  websiteContext?: WebsiteContext | null,
): string {
  return buildStructuredChatSystemPrompt({
    projectName,
    existingFiles,
    chatSummary,
    chatHistory,
    websiteContext,
  });
}

function buildClarifyingSystemPrompt(
  projectName: string | undefined,
  existingFiles: readonly StudioFile[],
  chatSummary: string | null,
  chatHistory: readonly ProjectChatHistoryEntry[],
  websiteContext?: WebsiteContext | null,
  accumulatedContext?: string | null,
  nearReady?: boolean,
): string {
  return buildClarifyingQuestionSystemPrompt({
    projectName,
    existingFiles,
    chatSummary,
    chatHistory,
    websiteContext,
    accumulatedContext,
    nearReady,
  });
}

const IMAGE_INTENT_PROMPT_CONTEXT: Record<BuilderImageIntent, string> = {
  logo: "The user has attached a logo image. Use it in the app header and favicon, and preserve its branding cues.",
  reference: "The user has attached a design reference image. Match the layout, visual hierarchy, and color direction where it fits the request.",
  error: "The user has attached an error screenshot. Diagnose the likely issue shown and prioritize fixing that problem in the code.",
  theme: "The user has attached a theme or brand guide image. Apply its colors, typography cues, and overall style consistently across the app.",
  general: "The user has attached an image as supporting context. Use it only where it clearly helps fulfill the request.",
};

function buildImageIntentContext(intent: BuilderImageIntent): string {
  return IMAGE_INTENT_PROMPT_CONTEXT[intent];
}

function buildPromptWithImageIntent(
  prompt: string,
  confirmedIntent?: BuilderImageIntent,
): string {
  if (!confirmedIntent) {
    return prompt;
  }

  const imageContext = buildImageIntentContext(confirmedIntent);
  const basePrompt = prompt.trim();

  if (!basePrompt) {
    return imageContext;
  }

  return `${basePrompt}\n\nAttached image context: ${imageContext}`;
}

function buildAnthropicUserContent(
  userMessage: string,
  imageUrl?: string,
): Anthropic.MessageParam["content"] {
  if (!imageUrl) {
    return userMessage;
  }

  return [
    buildAnthropicImageBlock(imageUrl),
    { type: "text", text: userMessage },
  ];
}

async function loadWebsiteContext(message: string) {
  return loadUrlContext(message);
}

// ─── Design system detection + spec injection ─────────────────────────────────

const DESIGN_SYSTEM_PATTERNS: Array<{ id: string; patterns: RegExp }> = [
  {
    id: "material",
    patterns: /material\s*design|material\s*ui|\bmd3\b|material\s*you|\bgoogle\s*material\b/i,
  },
  {
    id: "apple-hig",
    patterns: /\bapple\s*hig\b|\bios\s*style\b|\bmacos\s*style\b|\bcupertino\b|\bapple\s*design\b/i,
  },
  {
    id: "linear",
    patterns: /\blinear\s*style\b|\blinear\s*design\b|\blinear\s*app\b|\blike\s*linear\b/i,
  },
  {
    id: "asana",
    patterns: /\basana\s*style\b|\basana\s*design\b|\blike\s*asana\b/i,
  },
  {
    id: "stripe",
    patterns: /\bstripe\s*style\b|\bstripe\s*design\b|\bstripe\s*dashboard\b|\blike\s*stripe\b/i,
  },
  {
    id: "notion",
    patterns: /\bnotion\s*style\b|\bnotion\s*design\b|\blike\s*notion\b/i,
  },
  {
    id: "vercel",
    patterns: /\bvercel\s*style\b|\bvercel\s*design\b|\blike\s*vercel\b/i,
  },
];

function detectDesignSystem(prompt: string): string | null {
  for (const { id, patterns } of DESIGN_SYSTEM_PATTERNS) {
    if (patterns.test(prompt)) {
      console.log("[generate] design system detected:", id);
      return id;
    }
  }
  return null;
}

const DESIGN_SYSTEM_SPECS: Record<string, string> = {
  "material": `
══ DESIGN SYSTEM: MATERIAL DESIGN 3 (Google) ══
Follow MD3 spec precisely. These override any other visual guidance.

TOKENS:
  Background:     #FFFBFE   Surface:        #FFFBFE   Surface variant: #E7E0EC
  On-background:  #1C1B1F   On-surface:     #1C1B1F   Outline:        #79747E
  Primary:        #6750A4   On-primary:     #FFFFFF   Primary container: #E8DEF8
  Secondary:      #625B71   Secondary ctr:  #E8DEF8   On-secondary-ctr: #1D192B
  Error:          #B3261E   Error container: #F9DEDC

TYPOGRAPHY (Roboto font stack: 'Roboto', system-ui, sans-serif):
  Display Large:   57px / 64px  weight 400
  Headline Large:  32px / 40px  weight 400
  Title Large:     22px / 28px  weight 400
  Title Medium:    16px / 24px  weight 500
  Body Large:      16px / 24px  weight 400
  Body Medium:     14px / 20px  weight 400
  Label Large:     14px / 20px  weight 500 (button text)

COMPONENTS:
  Navigation Drawer: 240–280px wide, full-height, bg #FFFBFE, border-r 1px #E7E0EC
    Nav items: pill shape (border-radius: 9999px), height 56px, padding 0 24px
    Active: bg #E8DEF8, text #21005D  Inactive: text #49454F
    Leading icon: 24×24, active color #6750A4
  
  Buttons:
    Filled: bg #6750A4, text #FFFFFF, radius 9999px, height 40px, px 24px — primary actions
    Outlined: border 1px #6750A4, text #6750A4, radius 9999px — secondary actions
    Text: text #6750A4, no border/bg — tertiary actions
    FAB: radius 16px, bg #6750A4, size 56px, shadow elevation 3
  
  Cards:
    Elevated: bg #FFFBFE, shadow 0 1px 2px rgba(0,0,0,0.08) 0 2px 8px rgba(0,0,0,0.05), radius 12px, padding 16px
    Filled: bg #E8DEF8, radius 12px, no shadow
  
  Top App Bar: height 64px, bg #FFFBFE, title 22px/weight 400
  Lists: 56px row height (48px compact), leading icon 24px, divider 1px #E7E0EC

SPACING: 4px grid. Use 4/8/12/16/24/32/48px increments.
`,

  "apple-hig": `
══ DESIGN SYSTEM: APPLE HUMAN INTERFACE GUIDELINES ══
Follow Apple HIG precisely. These override any other visual guidance.

TOKENS (Light mode):
  Background:       #F2F2F7   (system grouped background)
  Secondary bg:     #FFFFFF   (secondary system background)
  Tertiary bg:      #F2F2F7
  Label primary:    #000000   Label secondary: rgba(60,60,67,0.6)
  Label tertiary:   rgba(60,60,67,0.3)
  Separator:        rgba(60,60,67,0.29)  Fill:  rgba(120,120,128,0.2)
  System Blue:      #007AFF   System Green: #34C759  System Red:  #FF3B30
  System Orange:    #FF9500   System Purple: #AF52DE  System Teal: #5AC8FA

TYPOGRAPHY (-apple-system, 'SF Pro Display', 'SF Pro Text', system-ui, sans-serif):
  Large Title:   34px / 41px  weight 700
  Title 1:       28px / 34px  weight 700
  Title 2:       22px / 28px  weight 700
  Title 3:       20px / 25px  weight 600
  Headline:      17px / 22px  weight 600
  Body:          17px / 22px  weight 400
  Callout:       16px / 21px  weight 400
  Subhead:       15px / 20px  weight 400
  Footnote:      13px / 18px  weight 400
  Caption:       12px / 16px  weight 400

COMPONENTS:
  Sidebar (macOS/iPadOS):
    Width: 220–260px, bg #F2F2F7, border-r 1px rgba(60,60,67,0.29)
    Nav items: px 12px py 8px, rounded-lg (8px), height 32px
    Active: bg #007AFF text #FFFFFF  Hover: bg rgba(0,0,0,0.06)
    Section header: text 11px uppercase tracking-wide color rgba(60,60,67,0.6) px 12px mb 4px
  
  List rows (UIKit table-view style):
    Full width, height 44px (min), px 16px, bg #FFFFFF
    Divider: inset 16px, 1px solid #E5E5EA
    Trailing chevron: ChevronRight 14px color #C7C7CC (always on tappable rows)
    Leading avatar/icon: 32–40px rounded-full
  
  Toolbar: height 52px, bg rgba(242,242,247,0.8) blur(12px), border-b 1px rgba(60,60,67,0.29)
  
  Buttons:
    Primary: bg #007AFF text white, rounded-lg 10px, height 44px, px 16px, font-weight 600
    Secondary: border 1px #007AFF text #007AFF, rounded-lg
    Destructive: bg #FF3B30
  
  Cards: bg #FFFFFF, rounded-2xl (16px), no shadow (use bg contrast instead)
  Modal sheet: rounded-tl/tr 16px, bg #FFFFFF

SPACING: 4/8/12/16/20/24/32/44px. 44pt minimum tap target.
`,

  "linear": `
══ DESIGN SYSTEM: LINEAR APP ══
Follow Linear's design language precisely. These override any other visual guidance.

TOKENS:
  Background:       #FFFFFF   Surface:    #FAFAFA   Sidebar bg: #F7F7F7
  Border:           #E5E5E5   Divider:    #F3F4F6   
  Text primary:     #1A1A1A   Text secondary: #4B5563  Text tertiary: #9CA3AF
  Accent/primary:   #5E6AD2   (Linear indigo)
  Accent hover:     #4F5BBD
  Selection bg:     #EBEBEB   Selected text: #1A1A1A
  Priority urgent:  #E11D48   Priority high: #F97316
  Priority medium:  #EAB308   Priority low: #6B7280

TYPOGRAPHY (Inter, system-ui, sans-serif — base 13px):
  Base:    13px / 20px  weight 400  (this is the default for all body text)
  Medium:  13px / 20px  weight 500
  Label:   11px / 16px  weight 500 uppercase tracking-wide
  Large:   15px / 22px  weight 500 (headings only)
  Mono:    font-family: 'JetBrains Mono', 'Fira Code', monospace  12px (IDs, timestamps)

COMPONENTS:
  Sidebar:
    Width: 220px exactly, bg #F7F7F7, border-r 1px #E5E5E5
    Workspace header: px 12px py 8px, 5px rounded icon 20×20
    Section header: 11px uppercase tracking-wide color #9CA3AF, px 12px py 4px
    Nav item: px 12px py 6px rounded-lg, height ~28px, gap-2, icon 14px
    Active: bg #EBEBEB text #1A1A1A  Hover: bg #F0F0F0 text #1A1A1A
    Unread count: 11px text-right color #9CA3AF
  
  Issue list (the core component):
    Toolbar: height 40px, border-b 1px #E5E5E5, px 16px
    Column header row: height 32px, bg #FAFAFA, border-b #E5E5E5, 11px uppercase #9CA3AF, sticky
    Issue row: height 36px, border-b 1px #F3F4F6, px 16px, hover bg #F9F9F9
      Priority dot: 8px circle, color = priority color
      ID: font-mono 12px text-tertiary, w-16
      Title: 13px text-primary, flex-1
      Status badge: 12px text-secondary
      Assignee avatar: 24×24 rounded-full, bg #E5E7EB text 10px
  
  Buttons:
    Primary: bg #5E6AD2 text white, rounded-lg 6px, text 12px font-medium, px 10px py 6px
    Secondary: border 1px #E5E5E5 text #4B5563, rounded-lg 6px, text 12px
    Icon: 28×28, rounded-md, hover bg #EBEBEB, icon 14px
  
  Status pills: rounded-full px 8px py 2px, text 11px font-medium — inline status labels

SPACING: 4/8/12/16/24px. Tight density: most vertical rhythms are 28–36px.
DENSITY: Everything is compact. Reduce padding everywhere vs typical UI.
`,

  "asana": `
══ DESIGN SYSTEM: ASANA ══
Follow Asana's visual language precisely. These override any other visual guidance.

TOKENS:
  Background:       #FFFFFF   Sidebar bg: #F6F8F9    Surface border: #E2E8F0
  Text primary:     #1A202C   Text secondary: #4A5568  Text tertiary: #718096
  Divider:          #EDF2F7   Fill light: #F6F8F9
  Coral/primary:    #F06A6A   Coral dark: #D95B5B     Coral bg: #FFF0F0
  Blue secondary:   #4573D2   Green success: #1DA462   Yellow warn: #F2C94C
  Gray action:      #6B7280

TYPOGRAPHY (Inter, system-ui, sans-serif — base 14px):
  H1:      24px / 32px  weight 700
  H2:      20px / 28px  weight 600
  H3:      16px / 24px  weight 600
  Body:    14px / 20px  weight 400
  Small:   12px / 16px  weight 400
  Label:   12px / 16px  weight 500

COMPONENTS:
  Sidebar:
    Width: 240px, bg #F6F8F9, border-r 1px #E2E8F0, py 12px
    Brand header: 28px avatar rounded-full bg coral, font-semibold 14px, px 16px pb 8px
    Nav item: px 16px py 8px, rounded-lg 8px, gap-2, icon 16px, text 14px font-medium
    Active: bg #EAEEF5 text #1A202C  Hover: bg #EDF2F7
    Section label: 11px uppercase tracking-wide color #718096, px 16px py 8px
    Project dot: 10×10 rounded-full, each project has a distinct color
  
  Task list (core component):
    Column headers: text 11px font-semibold uppercase tracking-wide #718096, border-b 1px #EDF2F7
    Task row: min-height 40px, border-b 1px #EDF2F7, grid layout 12 cols, hover bg #FAFAFA
    Checkbox: 16px circle (Circle icon when undone, CheckCircle2 when done)
    Done task: text-decoration line-through, color #A0AEC0
    Assignee avatar: 24×24 rounded-full bg #E2E8F0, initials 10px font-medium
    Priority badge: rounded-full px 8px py 2px, text 11px font-medium, bg = color+'18' (10% opacity)
    Due date: 14px text-secondary
  
  Buttons:
    Primary: bg #F06A6A text white, rounded-lg 8px, height 36px, px 16px, font-medium 14px
    Secondary: border 1px #E2E8F0 text #4A5568, rounded-lg 8px
    Ghost: text-only #718096, hover text #1A202C
  
  Summary cards: bg #FFFFFF rounded-2xl, no heavy shadow (use border), p 16px
  Modals/panels: rounded-2xl, shadow-lg, border border-#E2E8F0

SPACING: 4/8/12/16/20/24/32/40px. Standard density — not too tight, not spacious.
INTERACTIONS: Checkbox toggles are the primary interaction. Clicking a row should open a detail view.
`,

  "stripe": `
══ DESIGN SYSTEM: STRIPE DASHBOARD ══
Follow Stripe's dashboard design language precisely. These override any other visual guidance.

TOKENS:
  Sidebar bg:       #1A1F36   (dark navy)
  Sidebar text:     #C1C9D2   Sidebar active text: #FFFFFF
  Sidebar hover:    rgba(255,255,255,0.08)  Sidebar active: rgba(255,255,255,0.1)
  Sidebar border:   rgba(255,255,255,0.08)
  Content bg:       #F6F9FC
  Card bg:          #FFFFFF   Card border: #E3E8EF   Card shadow: 0 1px 3px rgba(18,18,29,0.08)
  Text primary:     #1A1F36   Text secondary: #697386  Text tertiary: #9EA3AE
  Accent/primary:   #635BFF   (Stripe purple)
  Accent hover:     #4F48E2
  Success:          #09825D   Success bg: #ECFDF5     Success text: #065F46
  Danger:           #C0392B   Danger bg:  #FEF2F2     Danger text: #991B1B
  Warning:          #B45309   Warning bg: #FFF7ED     Warning text: #9A3412
  Processing:       #B45309   Processing bg: #FFF7ED
  Table header:     #F9FAFC   Table divider: #E3E8EF

TYPOGRAPHY (Inter, system-ui, sans-serif):
  Page title:    20px / 28px  weight 600  color #1A1F36
  Section head:  14px / 20px  weight 600  color #1A1F36
  Body:          14px / 20px  weight 400  color #1A1F36
  Label/meta:    12px / 16px  weight 400  color #697386
  Table header:  11px / 16px  weight 500 uppercase tracking-wide color #697386
  Mono:          font-family: 'SF Mono', 'Fira Code', monospace  12px — for IDs, amounts

COMPONENTS:
  Sidebar (DARK NAVY):
    Width: 224px, bg #1A1F36, full height
    Logo area: px 16px py 16px, brand mark + workspace name
    Nav item: px 12px py 10px mx 8px rounded-lg, icon 15px, text 13px font-medium, gap-2
    Active: bg rgba(255,255,255,0.1) text #FFFFFF  Inactive: text #8792A2
    Bottom profile: border-t rgba(255,255,255,0.08), avatar 28px rounded-full bg #635BFF
  
  Top bar: height 56px, bg #FFFFFF, border-b 1px #E3E8EF, px 24px
    Search: rounded-lg border #E3E8EF bg #F6F9FC, show ⌘K shortcut
  
  Metric cards:
    bg #FFFFFF, border 1px #E3E8EF, rounded-lg 8px, p 16px
    Label: 14px text-secondary  Value: 20px font-semibold text-primary
    Delta: 12px with ArrowUpRight/ArrowDownRight icon, color = green (up) or red (down)
  
  Data table:
    Container: bg #FFFFFF border 1px #E3E8EF rounded-lg overflow-hidden
    Table header row: bg #F9FAFC border-b #E3E8EF, 11px uppercase tracking-wide #697386, px 20px py 12px
    Data row: px 20px py 14px border-b #F3F4F6, hover bg #F9FAFC
    ID column: font-mono 12px text-tertiary
    Amount: 14px font-medium text-primary
    Status badge: rounded-full px 8px py 4px text 12px font-medium capitalize
  
  Buttons:
    Primary: bg #635BFF text white, rounded-md 6px, px 14px h 36px, font-medium 14px
    Secondary: border 1px #E3E8EF text #1A1F36 bg white, rounded-md 6px
    Danger: bg #C0392B text white

SPACING: 4/8/12/16/20/24/32/48px. Content area uses 24px horizontal padding.
LAYOUT: Always dark sidebar (224px) + light content area. Data tables are the core component.
`,

  "notion": `
══ DESIGN SYSTEM: NOTION ══
Follow Notion's clean, minimal design language. These override any other visual guidance.

TOKENS:
  Background:       #FFFFFF   Sidebar bg: #F7F6F3
  Hover bg:         #EFEFEF   Active bg:  #E9E9E7
  Border:           #E9E9E7
  Text primary:     #37352F   Text secondary: #787774  Text placeholder: rgba(55,53,47,0.5)
  Accent:           #2EAADC   (Notion blue)  Accent bg: #E8F5FA
  Red:              #E03E3E   Yellow: #DFAB01  Green: #0F7B6C

TYPOGRAPHY (Inter, -apple-system, system-ui, sans-serif):
  Title/H1:  40px / 50px  weight 700  color #37352F
  H2:        30px / 38px  weight 700
  H3:        24px / 30px  weight 600
  Body:      16px / 24px  weight 400  (Notion uses 16px as base)
  Small:     14px / 20px  weight 400
  Caption:   12px / 16px  weight 400

COMPONENTS:
  Sidebar: 240px, bg #F7F6F3, no hard border (subtle shadow or bg diff only)
    Page items: px 12px py 4px rounded-md, icon/emoji 16px, text 14px
    Hover: bg #EFEFEF  Active: bg #E9E9E7 text #37352F
    Section: 11px uppercase tracking-wide #787774, px 12px py 6px mb 2px
  
  Content area: max-width 900px centered, px 96px (wide page: 64px), pt 96px
    Block editor feel: each section is a "block" with top/bottom margin
  
  Tables/databases:
    Property header: 12px font-medium uppercase tracking-wide #787774
    Row: 44px min-height, border-b 1px #E9E9E7, px 8px
    Hover: bg #F7F6F3
    Cell: 14px text-primary
    Status pills: rounded-full px 8px py 2px, 12px font-medium
  
  Buttons: 
    Primary: bg #37352F text white, rounded-md 4px, px 12px h 32px text 14px font-medium
    Secondary: bg #EFEFEF text #37352F, rounded-md 4px
    Ghost: text-only, hover bg #EFEFEF
  
  Callout/info blocks: bg #F1F1EF, rounded-md, p 16px, left border none

SPACING: 4/8/12/16/24/32/48/64/96px. Generous whitespace, editorial feel.
FEEL: Wikipedia/document + database. Blocks, properties, views. Calm and minimal.
`,

  "vercel": `
══ DESIGN SYSTEM: VERCEL DASHBOARD ══
Follow Vercel's sleek, developer-focused dark design language. These override any other visual guidance.

TOKENS (dark mode — Vercel defaults to dark):
  Background:       #000000   Surface:    #111111   Elevated: #1A1A1A
  Border:           #333333   Subtle:     #222222
  Text primary:     #EDEDED   Text secondary: #888888  Text tertiary: #666666
  Accent/primary:   #FFFFFF   (white primary actions on dark)
  Blue:             #0070F3   Blue light: #3291FF     Blue dark: #0761D1
  Success:          #50E3C2   Error:      #FF0080     Warning: #F5A623
  Code bg:          #0D1117   Code text:  #79C0FF

TYPOGRAPHY ('Geist', Inter, system-ui, sans-serif):
  H1:      32px / 40px  weight 700  color #EDEDED
  H2:      24px / 32px  weight 600  color #EDEDED
  H3:      18px / 26px  weight 600  color #EDEDED
  Body:    14px / 22px  weight 400  color #EDEDED
  Small:   12px / 18px  weight 400  color #888888
  Mono:    'Geist Mono', 'JetBrains Mono', monospace  13px — for paths, IDs, code

COMPONENTS:
  Main nav (top bar):
    bg #000000, border-b 1px #333333, height 56px, px 24px
    Logo: left-aligned, white Vercel triangle/wordmark
    Nav links: 14px #888888, hover #EDEDED, px 12px
    Right: avatar, CTA button
  
  Sidebar (project nav):
    Width: 240px, bg #000000, border-r 1px #333333, py 8px
    Nav item: px 12px py 8px rounded-lg, text 14px, gap-2, icon 16px
    Active: bg #1A1A1A text #EDEDED  Inactive: text #888888 hover bg #111111
  
  Deployment cards:
    bg #111111, border 1px #333333, rounded-lg 8px, p 16px
    Domain name: 14px font-medium #EDEDED
    Status badge: rounded-full px 8px py 3px text 12px
      Success: bg #0D2818 text #50E3C2   Failed: bg #1F0A1A text #FF0080  Building: bg #1A1200 text #F5A623
  
  Data table (dark):
    Container: bg #111111 border 1px #333333 rounded-lg
    Header: bg #0A0A0A border-b #333333, 11px uppercase #666666 tracking-wide, px 20px py 12px
    Row: px 20px py 14px border-b #222222 hover bg #1A1A1A
    Cell: 14px #888888  Key cell: 14px #EDEDED font-medium
  
  Buttons:
    Primary: bg #FFFFFF text #000000, rounded-md 6px, px 14px h 36px font-medium — high contrast
    Secondary: bg transparent border 1px #333333 text #EDEDED, rounded-md 6px
    Destructive: bg #FF0080 text white
  
  Code blocks: bg #0D1117, border 1px #30363D, rounded-lg, p 16px, mono 13px

SPACING: 4/8/12/16/24/32/48px. Developer-first: data-dense, minimal decoration.
FEEL: Dark, sleek, professional. Commands attention. GitHub/VS Code aesthetic.
`,
};

function getDesignSystemSpec(designSystemId: string): string {
  return DESIGN_SYSTEM_SPECS[designSystemId] ?? "";
}

// ─── Palette → theme tokens ───────────────────────────────────────────────────
// Each palette maps to concrete hex values for the theme.ts file.
// These are injected into every build so iteration is surgical (only theme.ts
// needs to change for color requests, not every component file).

interface ThemeTokens {
  primary: string;
  primaryHover: string;
  background: string;
  surface: string;
  sidebar: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  accentHover: string;
  success: string;
  warning: string;
  error: string;
  info: string;
  borderRadius: string;
  borderRadiusLg: string;
}

const DEFAULT_THEME: ThemeTokens = {
  primary: "#3b82f6",
  primaryHover: "#2563eb",
  background: "#f8fafc",
  surface: "#ffffff",
  sidebar: "#f1f5f9",
  border: "#e2e8f0",
  textPrimary: "#111827",
  textSecondary: "#6b7280",
  textMuted: "#9ca3af",
  accent: "#6366f1",
  accentHover: "#4f46e5",
  success: "#10b981",
  warning: "#f59e0b",
  error: "#ef4444",
  info: "#3b82f6",
  borderRadius: "8px",
  borderRadiusLg: "12px",
};

const PALETTE_THEME_TOKENS: Record<string, ThemeTokens> = {
  "professional-blue": DEFAULT_THEME,

  "crypto-dark": {
    primary: "#6366f1",        primaryHover: "#4f46e5",
    background: "#0c0c1a",     surface: "#13131f",
    sidebar: "#0f0f1a",        border: "#1e1e3a",
    textPrimary: "#e2e8f0",    textSecondary: "#94a3b8",   textMuted: "#475569",
    accent: "#a855f7",         accentHover: "#9333ea",
    success: "#22c55e",        warning: "#f59e0b",         error: "#ef4444",    info: "#6366f1",
    borderRadius: "8px",       borderRadiusLg: "12px",
  },
  "law-navy": {
    primary: "#1e3a5f",        primaryHover: "#162c4a",
    background: "#f5f5f0",     surface: "#ffffff",
    sidebar: "#1e3a5f",        border: "#d1d5db",
    textPrimary: "#111827",    textSecondary: "#4b5563",   textMuted: "#9ca3af",
    accent: "#c9a84c",         accentHover: "#b8952e",
    success: "#10b981",        warning: "#f59e0b",         error: "#ef4444",    info: "#3b82f6",
    borderRadius: "4px",       borderRadiusLg: "8px",
  },
  "finance-green": {
    primary: "#16a34a",        primaryHover: "#15803d",
    background: "#f7faf8",     surface: "#ffffff",
    sidebar: "#f0f7f1",        border: "#d1fae5",
    textPrimary: "#111827",    textSecondary: "#374151",   textMuted: "#9ca3af",
    accent: "#059669",         accentHover: "#047857",
    success: "#16a34a",        warning: "#f59e0b",         error: "#ef4444",    info: "#3b82f6",
    borderRadius: "8px",       borderRadiusLg: "12px",
  },
  "medical-blue": {
    primary: "#0284c7",        primaryHover: "#0369a1",
    background: "#f0f9ff",     surface: "#ffffff",
    sidebar: "#e0f2fe",        border: "#bae6fd",
    textPrimary: "#0c4a6e",    textSecondary: "#075985",   textMuted: "#94a3b8",
    accent: "#06b6d4",         accentHover: "#0891b2",
    success: "#10b981",        warning: "#f59e0b",         error: "#ef4444",    info: "#0284c7",
    borderRadius: "8px",       borderRadiusLg: "16px",
  },
  "energy-red": {
    primary: "#dc2626",        primaryHover: "#b91c1c",
    background: "#fff5f5",     surface: "#ffffff",
    sidebar: "#1a1a1a",        border: "#e5e7eb",
    textPrimary: "#111827",    textSecondary: "#6b7280",   textMuted: "#9ca3af",
    accent: "#f97316",         accentHover: "#ea580c",
    success: "#10b981",        warning: "#f59e0b",         error: "#dc2626",    info: "#3b82f6",
    borderRadius: "8px",       borderRadiusLg: "12px",
  },
  "health-teal": {
    primary: "#0d9488",        primaryHover: "#0f766e",
    background: "#f0fdfa",     surface: "#ffffff",
    sidebar: "#f0fdfa",        border: "#ccfbf1",
    textPrimary: "#134e4a",    textSecondary: "#374151",   textMuted: "#9ca3af",
    accent: "#14b8a6",         accentHover: "#0d9488",
    success: "#10b981",        warning: "#f59e0b",         error: "#ef4444",    info: "#06b6d4",
    borderRadius: "12px",      borderRadiusLg: "16px",
  },
  "warm-amber": {
    primary: "#d97706",        primaryHover: "#b45309",
    background: "#fffbeb",     surface: "#ffffff",
    sidebar: "#fef3c7",        border: "#fde68a",
    textPrimary: "#111827",    textSecondary: "#4b5563",   textMuted: "#9ca3af",
    accent: "#f59e0b",         accentHover: "#d97706",
    success: "#10b981",        warning: "#d97706",         error: "#ef4444",    info: "#3b82f6",
    borderRadius: "8px",       borderRadiusLg: "12px",
  },
  "kids-yellow": {
    primary: "#ca8a04",        primaryHover: "#a16207",
    background: "#fefce8",     surface: "#ffffff",
    sidebar: "#fef9c3",        border: "#fde047",
    textPrimary: "#111827",    textSecondary: "#4b5563",   textMuted: "#9ca3af",
    accent: "#f97316",         accentHover: "#ea580c",
    success: "#10b981",        warning: "#ca8a04",         error: "#ef4444",    info: "#3b82f6",
    borderRadius: "12px",      borderRadiusLg: "20px",
  },
  "midnight-indigo": {
    primary: "#4f46e5",        primaryHover: "#4338ca",
    background: "#f5f3ff",     surface: "#ffffff",
    sidebar: "#f5f3ff",        border: "#e0e7ff",
    textPrimary: "#111827",    textSecondary: "#4b5563",   textMuted: "#9ca3af",
    accent: "#7c3aed",         accentHover: "#6d28d9",
    success: "#10b981",        warning: "#f59e0b",         error: "#ef4444",    info: "#4f46e5",
    borderRadius: "8px",       borderRadiusLg: "12px",
  },
  "retail-coral": {
    primary: "#e11d48",        primaryHover: "#be123c",
    background: "#fff1f2",     surface: "#ffffff",
    sidebar: "#fff1f2",        border: "#fce7f3",
    textPrimary: "#111827",    textSecondary: "#4b5563",   textMuted: "#9ca3af",
    accent: "#f97316",         accentHover: "#ea580c",
    success: "#10b981",        warning: "#f59e0b",         error: "#e11d48",    info: "#3b82f6",
    borderRadius: "8px",       borderRadiusLg: "16px",
  },
  "rose-pink": {
    primary: "#db2777",        primaryHover: "#be185d",
    background: "#fdf2f8",     surface: "#ffffff",
    sidebar: "#fce7f3",        border: "#fbcfe8",
    textPrimary: "#111827",    textSecondary: "#4b5563",   textMuted: "#9ca3af",
    accent: "#ec4899",         accentHover: "#db2777",
    success: "#10b981",        warning: "#f59e0b",         error: "#ef4444",    info: "#3b82f6",
    borderRadius: "12px",      borderRadiusLg: "20px",
  },
  "ocean-cyan": {
    primary: "#0891b2",        primaryHover: "#0e7490",
    background: "#ecfeff",     surface: "#ffffff",
    sidebar: "#cffafe",        border: "#a5f3fc",
    textPrimary: "#111827",    textSecondary: "#164e63",   textMuted: "#9ca3af",
    accent: "#06b6d4",         accentHover: "#0891b2",
    success: "#10b981",        warning: "#f59e0b",         error: "#ef4444",    info: "#0891b2",
    borderRadius: "8px",       borderRadiusLg: "16px",
  },
  "nature-emerald": {
    primary: "#059669",        primaryHover: "#047857",
    background: "#f0fdf4",     surface: "#ffffff",
    sidebar: "#dcfce7",        border: "#bbf7d0",
    textPrimary: "#111827",    textSecondary: "#374151",   textMuted: "#9ca3af",
    accent: "#16a34a",         accentHover: "#15803d",
    success: "#059669",        warning: "#f59e0b",         error: "#ef4444",    info: "#3b82f6",
    borderRadius: "8px",       borderRadiusLg: "16px",
  },
  "gaming-neon": {
    primary: "#a855f7",        primaryHover: "#9333ea",
    background: "#050505",     surface: "#111111",
    sidebar: "#0a0a0a",        border: "#1f1f1f",
    textPrimary: "#f1f5f9",    textSecondary: "#94a3b8",   textMuted: "#475569",
    accent: "#22d3ee",         accentHover: "#06b6d4",
    success: "#22c55e",        warning: "#f59e0b",         error: "#f43f5e",    info: "#a855f7",
    borderRadius: "4px",       borderRadiusLg: "8px",
  },
  "creative-purple": {
    primary: "#7c3aed",        primaryHover: "#6d28d9",
    background: "#faf5ff",     surface: "#ffffff",
    sidebar: "#f5f3ff",        border: "#ede9fe",
    textPrimary: "#111827",    textSecondary: "#4b5563",   textMuted: "#9ca3af",
    accent: "#a855f7",         accentHover: "#9333ea",
    success: "#10b981",        warning: "#f59e0b",         error: "#ef4444",    info: "#7c3aed",
    borderRadius: "12px",      borderRadiusLg: "16px",
  },
  "startup-violet": {
    primary: "#6d28d9",        primaryHover: "#5b21b6",
    background: "#f5f3ff",     surface: "#ffffff",
    sidebar: "#ede9fe",        border: "#ddd6fe",
    textPrimary: "#111827",    textSecondary: "#4b5563",   textMuted: "#9ca3af",
    accent: "#8b5cf6",         accentHover: "#7c3aed",
    success: "#10b981",        warning: "#f59e0b",         error: "#ef4444",    info: "#6d28d9",
    borderRadius: "8px",       borderRadiusLg: "12px",
  },
  "news-charcoal": {
    primary: "#1f2937",        primaryHover: "#111827",
    background: "#f9fafb",     surface: "#ffffff",
    sidebar: "#1f2937",        border: "#e5e7eb",
    textPrimary: "#111827",    textSecondary: "#4b5563",   textMuted: "#9ca3af",
    accent: "#ef4444",         accentHover: "#dc2626",
    success: "#10b981",        warning: "#f59e0b",         error: "#ef4444",    info: "#3b82f6",
    borderRadius: "4px",       borderRadiusLg: "8px",
  },
  "slate-neutral": {
    primary: "#475569",        primaryHover: "#334155",
    background: "#f8fafc",     surface: "#ffffff",
    sidebar: "#f1f5f9",        border: "#e2e8f0",
    textPrimary: "#0f172a",    textSecondary: "#475569",   textMuted: "#94a3b8",
    accent: "#0ea5e9",         accentHover: "#0284c7",
    success: "#10b981",        warning: "#f59e0b",         error: "#ef4444",    info: "#0ea5e9",
    borderRadius: "6px",       borderRadiusLg: "10px",
  },
  "warm-orange": {
    primary: "#ea580c",        primaryHover: "#c2410c",
    background: "#fff7ed",     surface: "#ffffff",
    sidebar: "#fff7ed",        border: "#fed7aa",
    textPrimary: "#111827",    textSecondary: "#4b5563",   textMuted: "#9ca3af",
    accent: "#f97316",         accentHover: "#ea580c",
    success: "#10b981",        warning: "#ea580c",         error: "#ef4444",    info: "#3b82f6",
    borderRadius: "8px",       borderRadiusLg: "12px",
  },
  "coral-sunset": {
    primary: "#f77f50",        primaryHover: "#e56b3a",
    background: "#fff8f5",     surface: "#ffffff",
    sidebar: "#fff1ea",        border: "#fddccc",
    textPrimary: "#1c1917",    textSecondary: "#57534e",   textMuted: "#a8a29e",
    accent: "#fb923c",         accentHover: "#f97316",
    success: "#10b981",        warning: "#f59e0b",         error: "#ef4444",    info: "#06b6d4",
    borderRadius: "12px",      borderRadiusLg: "20px",
  },
  "ocean-teal": {
    primary: "#0891b2",        primaryHover: "#0e7490",
    background: "#f0fdfa",     surface: "#ffffff",
    sidebar: "#e0f7fa",        border: "#b2ebf2",
    textPrimary: "#111827",    textSecondary: "#374151",   textMuted: "#9ca3af",
    accent: "#0d9488",         accentHover: "#0f766e",
    success: "#10b981",        warning: "#f59e0b",         error: "#ef4444",    info: "#0891b2",
    borderRadius: "8px",       borderRadiusLg: "12px",
  },
  "forest-green": {
    primary: "#166534",        primaryHover: "#14532d",
    background: "#f0fdf4",     surface: "#ffffff",
    sidebar: "#dcfce7",        border: "#bbf7d0",
    textPrimary: "#111827",    textSecondary: "#374151",   textMuted: "#9ca3af",
    accent: "#22c55e",         accentHover: "#16a34a",
    success: "#15803d",        warning: "#f59e0b",         error: "#ef4444",    info: "#0284c7",
    borderRadius: "8px",       borderRadiusLg: "16px",
  },
};

function buildThemeTs(paletteId: string): string {
  const t = PALETTE_THEME_TOKENS[paletteId] ?? DEFAULT_THEME;
  return [
    "export const theme = {",
    `  primary:        '${t.primary}',`,
    `  primaryHover:   '${t.primaryHover}',`,
    `  background:     '${t.background}',`,
    `  surface:        '${t.surface}',`,
    `  sidebar:        '${t.sidebar}',`,
    `  border:         '${t.border}',`,
    `  textPrimary:    '${t.textPrimary}',`,
    `  textSecondary:  '${t.textSecondary}',`,
    `  textMuted:      '${t.textMuted}',`,
    `  accent:         '${t.accent}',`,
    `  accentHover:    '${t.accentHover}',`,
    `  success:        '${t.success}',`,
    `  warning:        '${t.warning}',`,
    `  error:          '${t.error}',`,
    `  info:           '${t.info}',`,
    `  borderRadius:   '${t.borderRadius}',`,
    `  borderRadiusLg: '${t.borderRadiusLg}',`,
    "} as const;",
    "",
    "export type Theme = typeof theme;",
  ].join("\n");
}

const PREVIEW_SHELL_ICON_CONTEXT = [
  "PREVIEW SHELL CONTEXT:",
  "The generated app is rendered inside a Beomz preview shell.",
  "The shell header shows an app icon: a colored square with a lucide-react icon inside it, plus the app name as text next to it.",
  "When the user says 'logo', 'app icon', 'logo color', or 'icon color', they usually mean this preview-shell icon rather than a separate uploaded brand asset.",
  "In generated apps, the most reliable source of truth for that icon color is theme.ts.",
  "Use theme.accent as the primary icon/logo color token. For requests like 'make the logo orange', update theme.accent to '#F97316' and theme.accentHover to '#EA580C' when appropriate.",
  "Do not invent a new logo image unless the user explicitly asks for a custom graphic asset.",
].join("\n");

// ─── Phased build helpers ─────────────────────────────────────────────────────

const ROLE_INDICATORS = [
  "owner", "admin", "manager", "officer", "user", "staff",
  "customer", "employee", "tenant", "operator",
];

const DOMAIN_COMPLEXITY_KEYWORDS = [
  "scheduling", "workflow", "portal", "dashboard", "management",
  "tracking", "reporting", "billing", "inventory", "compliance",
  "admissions", "dispensing", "laboratory", "clinical", "surgical",
];

const MULTI_ENTITY_INDICATORS = [
  "patients", "staff", "doctors", "nurses", "users", "clients",
  "customers", "employees", "vendors", "suppliers", "tenants",
];

export function isComplexPrompt(prompt: string): boolean {
  const lower = prompt.toLowerCase();

  // 2+ user role words
  const roleMatches = ROLE_INDICATORS.filter((r) => lower.includes(r)).length;
  if (roleMatches >= 2) return true;

  // Prompt length > 300 chars
  if (prompt.length > 300) return true;

  // 4+ feature nouns separated by commas, "and", or newlines
  const featureTokens = lower.split(/,|\band\b|\n/).map((s) => s.trim()).filter(Boolean);
  if (featureTokens.length >= 4) return true;

  // 3+ domain complexity keywords
  const domainMatches = DOMAIN_COMPLEXITY_KEYWORDS.filter((k) => lower.includes(k)).length;
  if (domainMatches >= 3) return true;

  // 2+ multi-entity indicators
  const entityMatches = MULTI_ENTITY_INDICATORS.filter((k) => lower.includes(k)).length;
  if (entityMatches >= 2) return true;

  return false;
}

function buildPhaseContextBlock(
  currentPhase: number,
  phasesTotal: number,
  phases: Phase[],
  existingFileNames: string[],
): string {
  const phase1 = phases[0];
  const currentPhaseData = phases.find((p) => p.index === currentPhase);

  if (!phase1 || !currentPhaseData) return "";

  if (currentPhase === 1) {
    return [
      `--- BUILD PHASE 1 of ${phasesTotal}: ${phase1.title} ---`,
      `This complex app will be built in ${phasesTotal} phases.`,
      `Build ONLY Phase 1 now: ${phase1.description}`,
      `Focus: ${phase1.focus.join(", ")}`,
      "Keep it clean — subsequent phases will add to this foundation.",
      "--- END PHASE CONTEXT ---",
    ].join("\n");
  }

  const completedPhases = phases.filter((p) => p.index < currentPhase);
  const completedBlock = completedPhases
    .map((p) => `Phase ${p.index}: ${p.title}\n  Built: ${p.focus.join(", ")}`)
    .join("\n");

  return [
    "--- BUILD PHASES ---",
    `This app is being built in ${phasesTotal} phases.`,
    "",
    "COMPLETED PHASES:",
    completedBlock,
    "",
    existingFileNames.length > 0
      ? `EXISTING FILES (do not recreate, only extend):\n${existingFileNames.join(", ")}`
      : "",
    "",
    `CURRENT PHASE ${currentPhase}: ${currentPhaseData.title}`,
    `Build: ${currentPhaseData.description}`,
    `Focus on: ${currentPhaseData.focus.join(", ")}`,
    "",
    "CRITICAL: Import from existing files. Add to App.tsx routing.",
    "Do not rewrite files from previous phases unless extending them.",
    "--- END BUILD PHASES ---",
  ]
    .filter((line) => line !== undefined)
    .join("\n");
}

// ─── Shared prompt builders ───────────────────────────────────────────────────

export function buildSystemPrompt(
  paletteId: string,
  designSystemSpec?: string,
  phaseContextBlock?: string,
  imageContextBlock?: string,
): string {
  const designBlock = designSystemSpec
    ? `${designSystemSpec}\n\nThe design system spec above takes priority for all visual decisions. Apply all tokens, typography, spacing, and component patterns exactly as specified.\n\n`
    : "";
  const phaseBlock = phaseContextBlock ? `${phaseContextBlock}\n\n` : "";
  const imageBlock = imageContextBlock ? `${imageContextBlock}\n\n` : "";
  const themeTsContent = buildThemeTs(paletteId);
  const variationSeed = Math.floor(Math.random() * 9000) + 1000;
  return [
    designBlock + phaseBlock + imageBlock + "You are an expert React developer. BUILD the app the user describes — do NOT merely restyle a template.",
    "Design the architecture from scratch based on what the app actually needs.",
    "",
    `VARIATION SEED: ${variationSeed}. Every build must be unique — use different layouts, data examples, copy text, component structures, and visual arrangements even when the prompt is identical to a previous build. Never produce a cookie-cutter result.`,
    "",
    "══ STEP 1: ANALYSE THE PROMPT ══",
    "Identify these four things before writing any code:",
    "",
    "1. NAVIGATION PATTERN — pick exactly one:",
    "   sidebar  → multi-section apps: dashboards, management tools, admin panels, CRMs, trackers with 3+ independent sections",
    "   top-nav  → marketing sites, landing pages, portfolios, simple single-topic SaaS",
    "   tabs     → 2-4 tightly related views, mobile-style apps, single-feature apps with sub-views",
    "   none     → single-page tools: calculators, timers, converters, games, quizzes, generators",
    "",
    "2. THEME:",
    "   light → productivity apps, data/admin tools, business software, management systems, dashboards",
    "   dark  → creative tools, entertainment, gaming, developer tools, crypto, music apps",
    `   Palette accent: ${paletteId} — this palette's exact color tokens are in theme.ts (see STEP 4)`,
    "",
    PREVIEW_SHELL_ICON_CONTEXT,
    "",
    "3. PAGES/SECTIONS — list every distinct section the app needs.",
    "   Asset management system → Assets, Work Orders, Team, Calendar",
    "   CRM → Contacts, Deals, Pipeline, Reports",
    "   Calculator → (no pages, single-page tool)",
    "",
    "4. DATA ENTITIES — for each page, what data does it show?",
    "   Assets → { id, name, category, status, location, assignedTo, lastService }",
    "   Each entity needs 4-5 realistic sample records.",
    "",
    "══ STEP 2: BUILD THE APP ══",
    "Write complete, working, production-presentable code.",
    "",
    "SIDEBAR APPS (sidebar navigation pattern):",
    "  App.tsx — root component containing:",
    "    • Sidebar with nav items (lucide-react icons + label), active state highlighting",
    "    • Main content area that renders the active page based on useState",
    "    • Use theme.sidebar for sidebar background, theme.border for the divider",
    "  PageName.tsx — one file per major section (e.g. AssetsPage.tsx, WorkOrdersPage.tsx)",
    "    • Full page content: heading, toolbar (search/filter/add button), data table or card grid",
    "    • Realistic sample data in the file as a typed const array",
    "    • Action buttons do something (useState toggles, modals, status changes)",
    "",
    "TOP-NAV APPS:",
    "  App.tsx — root with sticky topbar + page state + sections",
    "  PageName.tsx per major section if there are 3+, otherwise inline in App.tsx",
    "",
    "TABS APPS:",
    "  App.tsx — tab bar + tab panels, all inline or split by tab if complex",
    "",
    "SINGLE-PAGE TOOLS (no nav):",
    "  App.tsx only — focused, clean, full functionality",
    "",
    "Code quality rules:",
    "  • All imports at top: import { useState, useEffect, useCallback, useMemo } from 'react'",
    "  • Icons: import { Home, Settings, Users } from 'lucide-react'  (ONLY lucide-react — no other icon lib)",
    "  • When using lucide-react icons, prefer these commonly used icons which are guaranteed to exist: Home, Settings, User, Users, Search, Plus, Minus, X, Check, ChevronRight, ChevronLeft, ChevronDown, ChevronUp, ArrowRight, ArrowLeft, Edit, Edit2, Trash, Trash2, Eye, EyeOff, Lock, Unlock, Mail, Phone, Calendar, Clock, Star, Heart, Share2, Download, Upload, File, FileText, Folder, Bell, Menu, MoreVertical, Grid, List, Layout, Kanban, BarChart2, Activity, TrendingUp, AlertCircle, Info, CheckCircle2, XCircle, Circle, Square, Loader2, RefreshCw, Link, Link2, Copy, Save, Send, Tag, Filter, Globe, MapPin, Package, ShoppingCart, CreditCard, DollarSign, Code2, Terminal, Database, Server, Cloud, Monitor, Smartphone, Shield, Key, Zap, Layers, Sliders, Sun, Moon, LogIn, LogOut, Bookmark, Flag, Award, Sparkles, Rocket, Bug, Wrench, Briefcase, Building2, ExternalLink, Hash, AtSign, Percent, Play, Pause.",
    "  • Do NOT use: LayoutKanban, KanbanSquare, LayoutDashboard, CheckSquare, BadgeCheck, StickyNote, ClipboardList, ListChecks, PackageSearch, ReceiptText, FileClock.",
    "  • Tailwind CSS for spacing/layout/typography — use theme object for ALL color values",
    "  • import { theme } from './theme' at the top of every file that uses colors",
    "  • Use style={{ backgroundColor: theme.surface, color: theme.textPrimary }} for layout sections",
    "  • Use style={{ backgroundColor: theme.primary, color: '#fff' }} for primary buttons",
    "  • Use theme.sidebar / theme.border / theme.textSecondary / theme.accent throughout",
    "  • TypeScript interfaces for every data entity",
    "  • Each file has a default export",
    "  • Imports between files: import AssetsPage from './AssetsPage'  (flat directory, no subdirs)",
    "  • NO new npm dependencies — only React, Tailwind, lucide-react are available",
    "  • NO placeholder comments like '// TODO' or '// Add content here'",
    "  • Seed every list/table with 4-5 realistic sample records",
    "  • Buttons and interactions must do something (useState, not empty onClick)",
    "  • Use correct contrast: dark text on light backgrounds, white text on colored buttons",
    "  • Never use hyphens in JavaScript/TypeScript function names, component names, or variable names. File names may use hyphens (e.g. supabase-client.ts) but the exported function or component inside must use camelCase or PascalCase (e.g. export default function SupabaseClient).",
    "",
    "RESPONSIVE DESIGN (MANDATORY):",
    "  • Every layout must work at 375px (mobile), 768px (tablet), 1280px (desktop)",
    "  • Use Tailwind responsive prefixes on all layout elements: sm: md: lg:",
    "  • Mobile-first: base styles for mobile, scale up with prefixes",
    "  • Never use fixed pixel widths on containers — use w-full, max-w-*, or %",
    "  • Navigation: collapsible hamburger menu on mobile (hidden md:flex pattern)",
    "  • Tables: horizontally scrollable on mobile (overflow-x-auto wrapper)",
    "  • Touch targets: minimum 44px height on all interactive elements",
    "  • Sidebar layouts: hidden on mobile (hidden md:block), visible md: and above",
    "  • Grid layouts: 1 col mobile → 2 cols sm: → 3+ cols lg:",
    "  • Font sizes: never smaller than text-sm on mobile",
    "",
    "══ STEP 3: COEP RULES — violations break the preview, no exceptions ══",
    "  • NO Google Fonts — no @import url('https://fonts.googleapis.com/...')",
    "  • NO external CDN — no unpkg.com, jsdelivr, cdnjs, or any https:// URL in code",
    "  • Do NOT include <script src=\"https://cdn.tailwindcss.com\"> or any cdn.tailwindcss.com link/script tag — Tailwind CSS v4 is already configured in the scaffold",
    "  • Fonts: use className='font-sans' (Tailwind) — system fonts only",
    "  • Images/avatars: colored div with initials or lucide-react icon — no <img src='https://...'>",
    "  • NO <link>, <script>, or <style> tags referencing external URLs",
    "",
    "══ STEP 4: DELIVER ══",
    "Call deliver_customised_files with:",
    "  files[0]: theme.ts — ALWAYS include this exact file first (do not alter the structure, only tweak",
    "            colors if needed to better match the app's aesthetic):",
    "",
    themeTsContent,
    "",
    "  files[1]: App.tsx",
    "  files[2..]: one file per major page for multi-page apps",
    "  summary: one sentence — 'A light-theme asset management system with sidebar navigation covering Assets, Work Orders, Team, and Calendar.'",
  ].join("\n");
}

interface PhaseScope {
  index: number;
  total: number;
  title: string;
  focus: string[];
}

function buildUserMessage(prompt: string, phaseScope?: PhaseScope): string {
  // BEO-319: Phase 1 user turn must NOT repeat the phase constraint — it's already
  // in the system prompt via buildPhaseContextBlock. Double-messaging suppresses
  // file generation (Sonnet interprets the narrow scope as "nothing to build").
  // Phases 2+ keep the full header because it names what was already built and
  // provides context that isn't present in the system prompt.
  const instruction = phaseScope && phaseScope.index > 1
    ? [
        `Build Phase ${phaseScope.index} of ${phaseScope.total} for this app.`,
        `THIS PHASE ONLY: ${phaseScope.title}`,
        `Build ONLY these features: ${phaseScope.focus.join(", ")}`,
        `Do NOT build features from other phases.`,
        ``,
        `Full app context (domain reference only — do not expand scope beyond this phase):`,
        prompt,
      ].join("\n")
    : `Build this app: ${prompt}`;

  return [
    instruction,
    "",
    "Stack available (already configured — no setup needed):",
    "  React 18 + TypeScript",
    "  Tailwind CSS v4",
    "  lucide-react icons",
    "  No router installed — use React useState to show different pages/views",
    "  Entry point is App.tsx with a default export",
  ].join("\n");
}

function parseRawToolOutput(raw: { files?: unknown; summary?: unknown; appName?: unknown; migrations?: unknown }, prompt: string): Omit<CustomiseResult, "outputTokens"> {
  const files = Array.isArray(raw.files)
    ? (raw.files as Array<{ path: string; content: string }>).filter(
        (f) => typeof f.path === "string" && typeof f.content === "string",
      )
    : [];
  const summary = typeof raw.summary === "string" ? raw.summary : `${prompt} app`;
  const appName = typeof raw.appName === "string" && raw.appName.trim().length > 0
    ? raw.appName.trim()
    : undefined;
  const migrations = Array.isArray(raw.migrations)
    ? (raw.migrations as unknown[]).filter((s): s is string => typeof s === "string")
    : undefined;
  return { files, summary, appName, migrations };
}

// ─── Anthropic provider ───────────────────────────────────────────────────────

const ANTHROPIC_HAIKU_FALLBACK = "claude-haiku-4-5-20251001";

async function callAnthropicWithMessages(
  model: string,
  systemPrompt: string,
  userMessage: Anthropic.MessageParam["content"],
  prompt: string,
  maxTokens = 64000,
  instrumentation?: { buildId: string; isIteration: boolean },
): Promise<CustomiseResult> {
  const executeCall = async (modelId: string): Promise<CustomiseResult> => {
    console.log("[generate] system prompt length:", systemPrompt.length, "chars (~" + Math.round(systemPrompt.length / 4) + " tokens)");
    const client = new Anthropic({ apiKey: apiConfig.ANTHROPIC_API_KEY });
    const stream = client.messages.stream({
      model: modelId,
      max_tokens: maxTokens, // BEO-319: raised from 32000; BEO-335: overridable for forcedSimple
      system: systemPrompt,
      tools: [DELIVER_FILES_TOOL],
      tool_choice: { type: "tool", name: "deliver_customised_files" },
      messages: [{ role: "user", content: userMessage }],
    });
    const message = await stream.finalMessage();
    const inputTokens = message.usage?.input_tokens ?? 0;
    const outputTokens = message.usage?.output_tokens ?? 0;
    console.log("[generate] Anthropic response:", { model: modelId, stop_reason: message.stop_reason, content_blocks: message.content.length, usage: message.usage });
    // BEO-319: warn when approaching the 64k ceiling so we can monitor token pressure
    if (outputTokens >= 56000) {
      console.warn("[generate] WARNING: output tokens approaching 64k limit — consider tightening phase scope:", { outputTokens, model: modelId });
    }
    const toolBlock = message.content.find(
      (b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use",
    );
    if (!toolBlock) throw new Error("Anthropic did not call the deliver_customised_files tool.");
    return { ...parseRawToolOutput(toolBlock.input as { files?: unknown; summary?: unknown; appName?: unknown }, prompt), outputTokens, inputTokens };
  };

  const runWithRetry = async (modelId: string): Promise<CustomiseResult> => {
    const result = await executeCall(modelId);
    if (result.files.length === 0) {
      // BEO-319: intermittent streaming SDK delta reassembly can silently yield
      // toolBlock.input={} / files:[] despite a valid tool_use response. One retry
      // is enough — the second call almost always reassembles correctly.
      console.warn("[generate] WARNING: empty files array — retrying once", {
        outputTokens: result.outputTokens,
        model: modelId,
      });
      const retry = await executeCall(modelId);
      console.log(JSON.stringify({
        event: "generate.outcome",
        buildId: instrumentation?.buildId ?? null,
        model: modelId,
        initialFiles: result.files.length,
        initialOutputTokens: result.outputTokens,
        retryTriggered: true,
        retryFiles: retry.files.length,
        retryOutputTokens: retry.outputTokens,
        finalOutcome: retry.files.length === 0 ? "fallback_scaffold" : "retry_succeeded",
        isIteration: instrumentation?.isIteration ?? null,
        inputTokens: result.inputTokens ?? 0,
      }));
      if (retry.files.length === 0) {
        throw new Error(`Model returned 0 files on retry (outputTokens: ${retry.outputTokens})`);
      }
      return retry;
    }
    console.log(JSON.stringify({
      event: "generate.outcome",
      buildId: instrumentation?.buildId ?? null,
      model: modelId,
      initialFiles: result.files.length,
      initialOutputTokens: result.outputTokens,
      retryTriggered: false,
      retryFiles: null,
      retryOutputTokens: null,
      finalOutcome: "real_build",
      isIteration: instrumentation?.isIteration ?? null,
      inputTokens: result.inputTokens ?? 0,
    }));
    return result;
  };

  try {
    return await runWithRetry(model);
  } catch (err) {
    if (err instanceof Anthropic.APIError && err.status === 404 && model !== ANTHROPIC_HAIKU_FALLBACK) {
      console.error(`[model] ${model} not found, falling back to haiku`);
      return await runWithRetry(ANTHROPIC_HAIKU_FALLBACK);
    }
    throw err;
  }
}

async function callAnthropicCustomise(
  prompt: string,
  model: string,
  paletteId: string,
  instrumentation?: { buildId: string; isIteration: boolean },
  designSystemSpec?: string,
  phaseContextBlock?: string,
  imageContextBlock?: string,
  imageUrl?: string,
  phaseScope?: PhaseScope,
  maxTokens?: number,
): Promise<CustomiseResult> {
  return callAnthropicWithMessages(
    model,
    buildSystemPrompt(paletteId, designSystemSpec, phaseContextBlock, imageContextBlock),
    buildAnthropicUserContent(buildUserMessage(prompt, phaseScope), imageUrl),
    prompt,
    maxTokens,
    instrumentation,
  );
}

// ─── OpenAI-compatible provider (GPT-4o and Gemini via Google's OpenAI endpoint) ─

async function callOpenAICompatibleWithMessages(
  model: string,
  apiKey: string,
  systemPrompt: string,
  userMessage: string,
  prompt: string,
  baseURL?: string,
): Promise<CustomiseResult> {
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey, ...(baseURL ? { baseURL } : {}) });

  const response = await client.chat.completions.create({
    model,
    max_tokens: model.startsWith("gemini-") ? 8192 : 16384,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    tools: [{
      type: "function",
      function: {
        name: "deliver_customised_files",
        description: DELIVER_FILES_TOOL.description,
        parameters: DELIVER_FILES_TOOL.input_schema as Record<string, unknown>,
      },
    }],
    tool_choice: { type: "function", function: { name: "deliver_customised_files" } },
  });

  const outputTokens = response.usage?.completion_tokens ?? 0;
  const toolCall = response.choices[0]?.message.tool_calls?.[0];
  if (!toolCall || toolCall.type !== "function" || toolCall.function.name !== "deliver_customised_files") {
    throw new Error(`${model} did not call the deliver_customised_files tool.`);
  }
  const raw = JSON.parse(toolCall.function.arguments) as { files?: unknown; summary?: unknown; appName?: unknown };
  return { ...parseRawToolOutput(raw, prompt), outputTokens };
}

async function callOpenAICompatibleCustomise(
  prompt: string,
  model: string,
  apiKey: string,
  paletteId: string,
  baseURL?: string,
  designSystemSpec?: string,
  phaseContextBlock?: string,
  imageContextBlock?: string,
  phaseScope?: PhaseScope,
): Promise<CustomiseResult> {
  return callOpenAICompatibleWithMessages(
    model, apiKey,
    buildSystemPrompt(paletteId, designSystemSpec, phaseContextBlock, imageContextBlock),
    buildUserMessage(prompt, phaseScope),
    prompt, baseURL,
  );
}

// ─── Model dispatch (initial build) ──────────────────────────────────────────

async function callModelCustomise(
  prompt: string,
  model: string,
  paletteId: string,
  instrumentation?: { buildId: string; isIteration: boolean },
  phaseContextBlock?: string,
  imageContextBlock?: string,
  imageUrl?: string,
  phaseScope?: PhaseScope,
  maxTokens?: number,
): Promise<CustomiseResult> {
  console.log("[generate] calling model:", model);

  const designSystemId = detectDesignSystem(prompt);
  const designSystemSpec = designSystemId ? getDesignSystemSpec(designSystemId) : undefined;
  if (designSystemId) {
    console.log("[generate] design system spec injected:", designSystemId);
  }

  if (model.startsWith("claude-")) {
    return callAnthropicCustomise(
      prompt,
      model,
      paletteId,
      instrumentation,
      designSystemSpec,
      phaseContextBlock,
      imageContextBlock,
      imageUrl,
      phaseScope,
      maxTokens,
    );
  }

  if (model.startsWith("gpt-")) {
    const apiKey = apiConfig.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY not configured on server.");
    return callOpenAICompatibleCustomise(
      prompt,
      model,
      apiKey,
      paletteId,
      undefined,
      designSystemSpec,
      phaseContextBlock,
      imageContextBlock,
      phaseScope,
    );
  }

  if (model.startsWith("gemini-")) {
    const apiKey = apiConfig.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY not configured on server.");
    return callOpenAICompatibleCustomise(
      prompt, model, apiKey, paletteId,
      "https://generativelanguage.googleapis.com/v1beta/openai/",
      designSystemSpec, phaseContextBlock, imageContextBlock, phaseScope,
    );
  }

  // Unknown model — fall back to Sonnet to preserve the BEO-197/BEO-271 generation contract.
  console.warn("[generate] Unknown model, falling back to claude-sonnet-4-6:", model);
  return callAnthropicCustomise(
    prompt,
    "claude-sonnet-4-6",
    paletteId,
    instrumentation,
    designSystemSpec,
    phaseContextBlock,
    imageContextBlock,
    imageUrl,
    phaseScope,
    maxTokens,
  );
}

// ─── Iteration prompts ────────────────────────────────────────────────────────

export function buildIterationSystemPrompt(
  schemaSummary?: string,
  imageContextBlock?: string,
  hasWiredSupabaseClient = false,
  dbProvider: string | null = null,
  neonAuthBaseUrl: string | null = null,
): string {
  const isNeonWired = hasWiredSupabaseClient && dbProvider === "neon";
  const hasNeonAuth = isNeonWired && typeof neonAuthBaseUrl === "string" && neonAuthBaseUrl.length > 0;
  const dbBlock = schemaSummary
    ? [
        "",
        "DATABASE SCHEMA (current live schema for this project):",
        schemaSummary,
        "If the requested change needs new columns or tables, include the required SQL in the migrations array:",
        "  - ALTER TABLE \"schema\".\"table\" ADD COLUMN IF NOT EXISTS col_name col_type;",
        "  - CREATE TABLE IF NOT EXISTS \"schema\".\"table_name\" (id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY, ...);",
        "NEVER include DROP TABLE, DROP COLUMN, or ALTER COLUMN TYPE.",
        "If no schema changes are needed, return an empty migrations array.",
      ].join("\n")
    : "";
  const imageBlock = imageContextBlock
    ? ["", "IMAGE CONTEXT:", imageContextBlock].join("\n")
    : "";
  const existingSupabaseClientBlock = hasWiredSupabaseClient && !isNeonWired
    ? [
        "",
        "This project already has Supabase wired. The existing code uses inline createClient() calls — do NOT create or import from a shared supabase.ts or supabase.tsx file.",
        "Do NOT generate any file named supabase.ts, supabase.tsx, supabase-js, or supabase-client.",
        "Continue the same inline createClient() pattern already present in the existing project files.",
        "Use the Supabase URL and anon key already present in the codebase.",
      ].join("\n")
    : "";
  const neonDbBlock = isNeonWired
    ? [
        "",
        "This project uses a Neon Postgres database. The connection string is available as import.meta.env.VITE_DATABASE_URL.",
        "Use @neondatabase/serverless (browser-safe HTTP) to connect:",
        "  import { neon } from '@neondatabase/serverless';",
        "  const sql = neon(import.meta.env.VITE_DATABASE_URL);",
        "  // Query example:",
        "  const tasks = await sql`SELECT * FROM tasks`;",
        "  // Insert example:",
        "  await sql`INSERT INTO tasks (title, done) VALUES (${title}, false)`;",
        "  // CREATE TABLE example:",
        "  await sql`CREATE TABLE IF NOT EXISTS tasks (",
        "    id SERIAL PRIMARY KEY,",
        "    title TEXT NOT NULL,",
        "    done BOOLEAN DEFAULT false,",
        "    created_at TIMESTAMPTZ DEFAULT NOW()",
        "  )`;",
        "Use tagged template literals: sql`...` (NOT sql('...')).",
        "All DB calls are async — use await in useEffect or event handlers.",
        "Create tables with CREATE TABLE IF NOT EXISTS at app startup (in a useEffect or init function that runs once on mount).",
        "Do NOT use @supabase/supabase-js. Do NOT use createClient().",
        "Do NOT use pg.",
      ].join("\n")
    : "";
  const neonAuthBlock = hasNeonAuth
    ? [
        "",
        "Authentication (Neon Auth — already provisioned):",
        "- Use @neondatabase/neon-js for auth",
        "- import { createAuthClient } from '@neondatabase/neon-js/auth'",
        "- import { NeonAuthUIProvider, AuthView } from '@neondatabase/neon-js/auth/react/ui'",
        "- const authClient = createAuthClient(import.meta.env.VITE_NEON_AUTH_URL)",
        "- Wrap app in <NeonAuthUIProvider authClient={authClient}>",
        "- Add sign-in page: <AuthView pathname='sign-in' />",
        "- Auth includes Google, GitHub, and email/password by default",
      ].join("\n")
    : "";
  const dbImportRules = isNeonWired
    ? [
        "8. NEON IMPORTS: Use: import { neon } from '@neondatabase/serverless' and import.meta.env.VITE_DATABASE_URL.",
        "   Use sql tagged templates (sql`...`) and CREATE TABLE IF NOT EXISTS at startup.",
        "   Do NOT use pg. Do NOT use @supabase/supabase-js. Do NOT use createClient().",
      ]
    : [
        "8. SUPABASE IMPORTS: Always use: import { createClient } from '@supabase/supabase-js'",
        "   NEVER use './supabase-js', '../supabase-js', or 'supabase-js' — these will crash the app.",
      ];
  return [
    "You are modifying an existing React application. Apply ONLY the specific change the user requests.",
    imageBlock,
    "",
    "RULES:",
    "1. Return ONLY files that actually need to change. Do NOT return unchanged files.",
    "2. Preserve all existing structure, components, navigation, and logic unless the change requires touching them.",
    "3. For feature additions: add the minimal code in the relevant file(s) only.",
    "4. For text/copy changes: update only the text content, nothing else.",
    "5. Keep all imports flat — e.g. import X from './X' (no subdirectory paths like './components/X').",
    "6. Never add external CDN links, Google Fonts, or remote URLs (WebContainer COEP policy).",
    "   Do NOT include <script src=\"https://cdn.tailwindcss.com\"> or any cdn.tailwindcss.com link/script tag. Tailwind CSS v4 is already configured in the scaffold.",
    "7. Keep all existing functionality that the user did NOT ask to change.",
    ...dbImportRules,
    "9. Never use hyphens in JavaScript/TypeScript function names, component names, or variable names. File names may use hyphens (e.g. supabase-client.ts) but the exported function or component inside must use camelCase or PascalCase (e.g. export default function SupabaseClient).",
    "10. When using lucide-react icons, prefer these commonly used icons which are guaranteed to exist: Home, Settings, User, Users, Search, Plus, Minus, X, Check, ChevronRight, ChevronLeft, ChevronDown, ChevronUp, ArrowRight, ArrowLeft, Edit, Edit2, Trash, Trash2, Eye, EyeOff, Lock, Unlock, Mail, Phone, Calendar, Clock, Star, Heart, Share2, Download, Upload, File, FileText, Folder, Bell, Menu, MoreVertical, Grid, List, Layout, Kanban, BarChart2, Activity, TrendingUp, AlertCircle, Info, CheckCircle2, XCircle, Circle, Square, Loader2, RefreshCw, Link, Link2, Copy, Save, Send, Tag, Filter, Globe, MapPin, Package, ShoppingCart, CreditCard, DollarSign, Code2, Terminal, Database, Server, Cloud, Monitor, Smartphone, Shield, Key, Zap, Layers, Sliders, Sun, Moon, LogIn, LogOut, Bookmark, Flag, Award, Sparkles, Rocket, Bug, Wrench, Briefcase, Building2, ExternalLink, Hash, AtSign, Percent, Play, Pause.",
    "11. Do NOT use: LayoutKanban, KanbanSquare, LayoutDashboard, CheckSquare, BadgeCheck, StickyNote, ClipboardList, ListChecks, PackageSearch, ReceiptText, FileClock.",
    "",
    PREVIEW_SHELL_ICON_CONTEXT,
    "",
    "COLOR CHANGES (highest priority rule):",
    "If the user asks to change colors, theme, accent, logo color, icon color, or visual style — ONLY return theme.ts.",
    "Treat short requests like 'change the logo color to orange' as a theme.ts change targeting theme.accent (and accentHover if needed).",
    "Update the relevant token values in the theme object (e.g. primary, accent, background, sidebar).",
    "Do NOT touch App.tsx or any page files — they all import from ./theme so HMR propagates automatically.",
    "Example: 'change to red' → set primary: '#dc2626', primaryHover: '#b91c1c', accent: '#ef4444'",
    "Example: 'change logo color to orange' → set accent: '#F97316', accentHover: '#EA580C'",
    "Example: 'dark mode' → set background: '#0f172a', surface: '#1e293b', sidebar: '#0f172a', textPrimary: '#f1f5f9'",
    "",
    "ADDING NEW PAGES OR COMPONENTS:",
    "When the user asks to add a new page or feature that requires a new file:",
    "  a. Create the new file (e.g. AssetDetailPage.tsx) with complete implementation.",
    "  b. ALWAYS also return an updated App.tsx that imports the new file and adds it to the navigation/routing.",
    "     App.tsx is a sidebar/tab app — add the new page to the sidebar nav items and the page-rendering switch.",
    "  c. Use flat import paths: import AssetDetailPage from './AssetDetailPage' (NOT './components/AssetDetailPage').",
    "  d. The new page file must have a default export.",
    "  e. Fill it with realistic sample data and working interactions — no placeholder content.",
    "  f. Import { theme } from './theme' in the new file and use theme tokens for all colors.",
    "",
    "FILE NAMING:",
    "Return files with filename only (e.g. App.tsx, AssetDetailPage.tsx) — no directory prefix.",
    "",
    "DELIVER: Call deliver_customised_files with the changed + new files and their complete updated content.",
    "The summary should briefly describe what changed, e.g. 'Updated theme.ts to red accent.' or 'Added AssetDetailPage with analytics.'" + dbBlock + existingSupabaseClientBlock + neonDbBlock + neonAuthBlock,
  ].join("\n");
}

function buildIterationUserMessage(
  prompt: string,
  existingFiles: readonly StudioFile[],
): string {
  // Include only source TSX/TS files as context; skip platform manifests/JSON.
  const MAX_CONTEXT_CHARS = 40_000;
  const sourceFiles = existingFiles.filter(
    (f) => /\.(tsx|ts)$/.test(f.path) && f.source !== "platform",
  );

  let contextChars = 0;
  const contextParts: string[] = [];
  for (const f of sourceFiles) {
    const piece = `// FILE: ${f.path}\n${f.content}`;
    if (contextChars + piece.length > MAX_CONTEXT_CHARS) break;
    contextParts.push(piece);
    contextChars += piece.length;
  }

  return [
    "CURRENT APP FILES:",
    "",
    contextParts.join("\n\n---\n\n"),
    "",
    "---",
    "",
    `CHANGE REQUESTED: ${prompt}`,
    "",
    "Return only the files that need to change with their complete new content.",
  ].join("\n");
}

// ─── Model dispatch (iteration) ───────────────────────────────────────────────

async function callModelIterate(
  prompt: string,
  model: string,
  existingFiles: readonly StudioFile[],
  instrumentation?: { buildId: string; isIteration: boolean },
  schemaSummary?: string,
  imageContextBlock?: string,
  imageUrl?: string,
  hasWiredSupabaseClient = false,
  dbProvider: string | null = null,
  neonAuthBaseUrl: string | null = null,
): Promise<CustomiseResult> {
  console.log("[generate] iterating with model:", model);

  const systemPrompt = buildIterationSystemPrompt(
    schemaSummary,
    imageContextBlock,
    hasWiredSupabaseClient,
    dbProvider,
    neonAuthBaseUrl,
  );
  const userMessage = buildIterationUserMessage(prompt, existingFiles);

  if (model.startsWith("claude-")) {
    return callAnthropicWithMessages(
      model,
      systemPrompt,
      buildAnthropicUserContent(userMessage, imageUrl),
      prompt,
      64000,
      instrumentation,
    );
  }

  if (model.startsWith("gpt-")) {
    const apiKey = apiConfig.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY not configured on server.");
    return callOpenAICompatibleWithMessages(model, apiKey, systemPrompt, userMessage, prompt);
  }

  if (model.startsWith("gemini-")) {
    const apiKey = apiConfig.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY not configured on server.");
    return callOpenAICompatibleWithMessages(
      model, apiKey, systemPrompt, userMessage, prompt,
      "https://generativelanguage.googleapis.com/v1beta/openai/",
    );
  }

  // Unknown model — fall back to Sonnet to preserve the BEO-197/BEO-271 generation contract.
  console.warn("[generate] Unknown model for iteration, falling back to claude-sonnet-4-6:", model);
  return callAnthropicWithMessages(
    "claude-sonnet-4-6",
    systemPrompt,
    buildAnthropicUserContent(userMessage, imageUrl),
    prompt,
  );
}

const LEGACY_TEMPLATE_TAGS: Record<string, readonly string[]> = {
  "marketing-website": ["landing", "website", "launch"],
  "saas-dashboard": ["dashboard", "analytics", "saas"],
  "workspace-task": ["kanban", "task", "todo"],
  "mobile-app": ["tracker", "habit", "personal"],
  "social-app": ["social", "community", "feed"],
  "ecommerce": ["shop", "product", "retail"],
  "portfolio": ["portfolio", "creative", "showcase"],
  "blog-cms": ["blog", "content", "reading"],
  "onboarding-flow": ["onboarding", "wizard", "survey"],
  "data-table-app": ["expense", "budget", "invoice"],
  "interactive-tool": ["calculator", "timer", "converter"],
};

// Domain keyword → template tag mappings tried before blank scaffold fallback
const DOMAIN_TAG_MAP: Array<{ keywords: readonly string[]; tags: readonly string[] }> = [
  {
    keywords: ["hospital", "medical", "clinical", "patient", "healthcare", "clinic", "ehr", "emr"],
    tags: ["medical", "healthcare", "patient", "clinical", "hospital"],
  },
  {
    keywords: ["logistics", "warehouse", "shipping", "freight", "fleet", "dispatch", "cargo"],
    tags: ["logistics", "shipping", "inventory", "warehouse", "fleet"],
  },
  {
    keywords: ["restaurant", "food", "menu", "kitchen", "dining", "cafe", "bistro"],
    tags: ["restaurant", "food", "menu"],
  },
  {
    keywords: ["real estate", "property", "realty", "lease", "landlord"],
    tags: ["real-estate", "property", "lease"],
  },
  {
    keywords: ["school", "education", "student", "teacher", "course", "university", "college"],
    tags: ["education", "learning", "school", "student"],
  },
  {
    keywords: ["construction", "contractor", "project management", "site management", "buildsite"],
    tags: ["construction", "project", "management"],
  },
  {
    keywords: ["legal", "law firm", "attorney", "case management", "contracts", "compliance"],
    tags: ["legal", "law", "compliance"],
  },
  {
    keywords: ["hr", "human resources", "recruitment", "payroll", "onboarding", "leave management"],
    tags: ["hr", "recruitment", "payroll", "employee"],
  },
];

/**
 * Minimal blank scaffold — sidebar nav + main content area, no pre-built data tables or
 * MRR dashboards. Forces Sonnet to generate entirely domain-specific content rather than
 * reusing generic SaaS patterns.
 */
function buildBlankScaffold(): PrebuiltTemplate {
  return {
    manifest: {
      id: "blank-scaffold",
      name: "Blank Scaffold",
      description: "Minimal sidebar shell — Sonnet writes all domain-specific content",
      shell: "dashboard",
      accentColor: "#3b82f6",
      tags: [],
    },
    files: [
      {
        path: "App.tsx",
        content: `import { useState } from 'react';
import { LayoutDashboard, Settings } from 'lucide-react';

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export default function App() {
  const [activeNav, setActiveNav] = useState('dashboard');

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'system-ui, sans-serif', backgroundColor: '#f8fafc' }}>
      <div style={{ width: 220, backgroundColor: '#f1f5f9', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', padding: '16px 0' }}>
        <div style={{ padding: '0 16px 16px', borderBottom: '1px solid #e2e8f0', marginBottom: 8 }}>
          <span style={{ fontWeight: 700, fontSize: 16, color: '#111827' }}>App</span>
        </div>
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveNav(id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 16px', border: 'none', cursor: 'pointer',
              backgroundColor: activeNav === id ? '#e2e8f0' : 'transparent',
              color: activeNav === id ? '#111827' : '#6b7280',
              textAlign: 'left', width: '100%', fontSize: 14,
            }}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, padding: 32, overflowY: 'auto' }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#111827', marginBottom: 8 }}>
          Welcome
        </h1>
        <p style={{ color: '#6b7280', fontSize: 14 }}>
          Select a section from the sidebar to get started.
        </p>
      </div>
    </div>
  );
}`,
      },
    ],
  };
}

function pickBestPrebuilt(
  templateId: string,
  prompt: string,
) {
  // Direct hit first (prebuilt template IDs)
  const direct = getPrebuiltTemplate(templateId);
  if (direct) return direct;

  // Keyword search on prompt tokens
  const promptTokens = prompt
    .toLowerCase()
    .match(/[a-z0-9]+/g)
    ?.filter((t) => t.length >= 4) ?? [];
  const byPrompt = searchPrebuiltTemplatesByTags(promptTokens.slice(0, 6));
  if (byPrompt.length > 0) return byPrompt[0]!;

  // Semantic mapping from legacy template category
  const fallbackTags = LEGACY_TEMPLATE_TAGS[templateId];
  if (fallbackTags) {
    const byCat = searchPrebuiltTemplatesByTags([...fallbackTags]);
    if (byCat.length > 0) return byCat[0]!;
  }

  // Domain-aware last resort: try domain tag map, then blank scaffold.
  // A domain-specific prompt that matched nothing in the registry gets a blank
  // shell rather than the generic SaaS dashboard — Sonnet writes everything fresh.
  const lowerPrompt = prompt.toLowerCase();
  for (const { keywords, tags } of DOMAIN_TAG_MAP) {
    if (keywords.some((kw) => lowerPrompt.includes(kw))) {
      const domainMatch = searchPrebuiltTemplatesByTags([...tags]);
      if (domainMatch.length > 0) {
        console.log("[generate] domain fallback matched tags:", tags, "→", domainMatch[0]!.manifest.id);
        return domainMatch[0]!;
      }
      // Domain detected but no matching template → blank scaffold
      console.log("[generate] domain detected, no template match — using blank scaffold:", keywords.find((k) => lowerPrompt.includes(k)));
      return buildBlankScaffold();
    }
  }

  // Final fallback: blank scaffold instead of generic SaaS dashboard.
  // Forces Sonnet to build domain-specific content from scratch.
  console.log("[generate] no template match — using blank scaffold");
  return buildBlankScaffold();
}

// ─── BEO-362: 4-way intent engine ────────────────────────────────────────────

function mapIntentToBuildIntent(intent: Intent, hasExistingProject: boolean): BuildIntent {
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
      return hasExistingProject ? "edit" : "build";
    case "build_new":
      return "build";
    default:
      return hasExistingProject ? "edit" : "build";
  }
}

export async function detectIntent(
  prompt: string,
  hasExistingProject: boolean,
  projectName?: string,
  originalPrompt?: string,
): Promise<BuildIntent> {
  try {
    const classified = await classifyIntent(
      projectName && originalPrompt
        ? `${prompt}\n\nProject: ${projectName}\nOriginal prompt: ${originalPrompt}`
        : prompt,
      hasExistingProject,
      false,
    );
    return mapIntentToBuildIntent(classified.intent, hasExistingProject);
  } catch (err) {
    console.warn("[detectIntent] failed, using fallback:", err instanceof Error ? err.message : String(err));
    return hasExistingProject ? "edit" : "build";
  }
}

async function generatePreBuildAck(prompt: string, intent: "edit" | "build"): Promise<NarrationTextResult> {
  const apiKey = apiConfig.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      message: intent === "edit" ? "Applying your changes..." : "Building your app...",
      usage: ZERO_TOKEN_USAGE,
    };
  }

  const systemPrompt = intent === "edit"
    ? `Generate a one-sentence acknowledgement that you're about to make the edit the user requested.
Format: "I'll [verb] the [target]..." — max 15 words, present tense, no filler.
Examples: "I'll darken the sidebar and update the icon contrast." "I'll add a delete button to the table rows."`
    : `Generate a one-sentence acknowledgement that you're about to build what the user requested.
Format: "Building your [app type]..." — max 15 words, present tense, no filler.
Do not mention HTML, CSS, or JavaScript. If you mention the stack, say React and TypeScript.
Examples: "Building your restaurant POS system." "Building your task management dashboard."`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4_000);
  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create(
      {
        model: "claude-haiku-4-5-20251001",
        max_tokens: 60,
        system: systemPrompt,
        messages: [{ role: "user", content: prompt }],
      },
      { signal: controller.signal },
    );
    return {
      message: (response.content[0] as { type: string; text?: string })?.text?.trim()
        ?? (intent === "edit" ? "Applying your changes..." : "Building your app..."),
      usage: {
        inputTokens: response.usage?.input_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
      },
    };
  } catch {
    return {
      message: intent === "edit" ? "Applying your changes..." : "Building your app...",
      usage: ZERO_TOKEN_USAGE,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function generateConversationalAnswer(
  input: {
    chatHistory: readonly ProjectChatHistoryEntry[];
    chatSummary: string | null;
    currentMessage: string;
    existingFiles: readonly StudioFile[];
    projectName?: string;
    websiteContext?: WebsiteContext | null;
  },
): Promise<StructuredChatResponse> {
  const apiKey = apiConfig.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      message: "Share the next change or question, and I'll map the fastest path.",
      readyToImplement: false,
      implementPlan: null,
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12_000);
  try {
    const client = new Anthropic({ apiKey });
    const websiteContext = input.websiteContext ?? await loadWebsiteContext(input.currentMessage);
    const response = await client.messages.create(
      {
        model: "claude-sonnet-4-6",
        max_tokens: 600,
        system: buildConversationalSystemPrompt(
          input.projectName,
          input.existingFiles,
          input.chatSummary,
          input.chatHistory,
          websiteContext,
        ),
        messages: buildConversationMessages(input.chatHistory, input.currentMessage),
      },
      { signal: controller.signal },
    );
    const rawText = (response.content[0] as { type: string; text?: string })?.text?.trim() ?? "";
    return parseStructuredChatResponse(rawText);
  } catch {
    return {
      message: "Share the next change or question, and I'll map the fastest path.",
      readyToImplement: false,
      implementPlan: null,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function generateClarifyingQuestion(input: {
  chatHistory: readonly ProjectChatHistoryEntry[];
  chatSummary: string | null;
  currentMessage: string;
  existingFiles: readonly StudioFile[];
  projectName?: string;
  // BEO-465: feed what we already know and whether we're near-ready.
  accumulatedContext?: string | null;
  nearReady?: boolean;
}): Promise<string> {
  const apiKey = apiConfig.ANTHROPIC_API_KEY;
  if (!apiKey) return "Which specific part should I change?";

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4_000);
  try {
    const client = new Anthropic({ apiKey });
    const websiteContext = await loadWebsiteContext(input.currentMessage);
    const response = await client.messages.create(
      {
        model: "claude-haiku-4-5-20251001",
        max_tokens: 80,
        system: buildClarifyingSystemPrompt(
          input.projectName,
          input.existingFiles,
          input.chatSummary,
          input.chatHistory,
          websiteContext,
          input.accumulatedContext,
          input.nearReady,
        ),
        messages: buildConversationMessages(input.chatHistory, input.currentMessage),
      },
      { signal: controller.signal },
    );
    return (response.content[0] as { type: string; text?: string })?.text?.trim()
      ?? "Which specific part should I change?";
  } catch {
    return "Which specific part should I change?";
  } finally {
    clearTimeout(timeoutId);
  }
}

async function emitBuildConfirmed(
  db: StudioDbClient,
  buildId: string,
  nextId: () => string,
  operation: BuilderV3Operation,
  message: string,
  projectId: string,
): Promise<void> {
  await appendEventToDb(db, buildId, {
    type: "build_confirmed",
    id: nextId(),
    timestamp: ts(),
    operation,
    buildId,
    projectId,
    message,
  } as unknown as BuilderV3StatusEvent);
}

async function generateBuildSummary(prompt: string, changedFiles: string[]): Promise<NarrationTextResult> {
  const fallbackMessage = `Done — changes applied across ${changedFiles.length} file${changedFiles.length === 1 ? "" : "s"}.`;
  const apiKey = apiConfig.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      message: fallbackMessage,
      usage: ZERO_TOKEN_USAGE,
    };
  }

  const fileList = changedFiles.slice(0, 5).join(", ") + (changedFiles.length > 5 ? ` and ${changedFiles.length - 5} more` : "");
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8_000);
  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create(
      {
        model: "claude-haiku-4-5-20251001",
        max_tokens: 150,
        system: `Generate a 2-3 sentence natural language summary of what was just built or changed.
Cover: what changed and why, what the user should notice, and optionally a follow-up suggestion.
Be conversational and specific. Start with "Done —". Reference the specific changes, not just file names.
Example: "Done — I've darkened the sidebar to a deeper grey and improved the icon contrast across 3 files. The navigation should feel much more defined now. Want me to adjust the hover states too?"`,
        messages: [{ role: "user", content: `User request: "${prompt}"\nFiles changed: ${fileList}` }],
      },
      { signal: controller.signal },
    );
    return {
      message: (response.content[0] as { type: string; text?: string })?.text?.trim()
        ?? fallbackMessage,
      usage: {
        inputTokens: response.usage?.input_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
      },
    };
  } catch {
    return {
      message: fallbackMessage,
      usage: ZERO_TOKEN_USAGE,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Fire-and-forget background build.  Called after start.ts returns 202.
 * Writes events directly to the generation row's builderTrace so the
 * existing events.ts SSE polling loop delivers them to the frontend.
 */
export async function runBuildInBackground(
  input: BuildGenerateInput,
  db: StudioDbClient,
  deps: {
    classifyImageIntent?: typeof classifyImageIntent;
  } = {},
): Promise<void> {
  const { buildId, projectId, prompt, templateId, model, requestedAt, userId } = input;

  activeBuilds.add(buildId);

  try {
    await _runBuildInBackground(input, db, deps);
  } finally {
    activeBuilds.delete(buildId);
  }
}

async function _runBuildInBackground(
  input: BuildGenerateInput,
  db: StudioDbClient,
  deps: {
    classifyImageIntent?: typeof classifyImageIntent;
  } = {},
): Promise<void> {
  const { buildId, projectId, orgId, userEmail, templateId, model, requestedAt, userId } = input;
  // BEO-372: use let so we can override with a combined prompt for clarification answers.
  let prompt = input.prompt;
  const imageIntentClassifier = deps.classifyImageIntent ?? classifyImageIntent;
  const op = input.isIteration ? "iteration" : ("initial_build" as const);
  let eventSeq = 10; // start at 10; start.ts already wrote event 1 (queued)
  const nextId = () => String(eventSeq++);
  // BEO-366: guard against emitting pre_build_ack more than once per build run.
  let preBuildAckEmitted = false;
  // BEO-368: record wall-clock start for duration footer in build_summary.
  const buildStartTime = Date.now();
  let narrationUsage = { ...ZERO_TOKEN_USAGE };
  const stageEvents = createBuildStageEmitter({
    operation: op,
    nextId,
    emit: (event) => appendEventToDb(db, buildId, event as unknown as BuilderV3StatusEvent),
  });
  const imageConfirmationPending = Boolean(input.imageUrl && !input.confirmedIntent);
  const imageConfirmed = Boolean(input.imageUrl && input.confirmedIntent);
  let projectChatHistory: ProjectChatHistoryEntry[] = [];
  let projectChatSummary: string | null = null;

  try {
    if (typeof db.findProjectById === "function") {
      const currentProject = await db.findProjectById(projectId);
      projectChatHistory = readProjectChatHistory(currentProject?.chat_history);
      projectChatSummary = typeof currentProject?.chat_summary === "string"
        ? currentProject.chat_summary
        : null;
    }
  } catch (err) {
    console.warn("[generate] failed to load project chat memory (non-fatal):", err instanceof Error ? err.message : String(err));
  }

  if (!input.phaseOverride && !input.confirmedScope && imageConfirmationPending && input.imageUrl) {
    await appendSessionEventToDb(db, buildId, {
      type: "user",
      content: input.sourcePrompt,
      imageUrl: input.imageUrl,
    });

    const imageIntent = await imageIntentClassifier({
      imageUrl: input.imageUrl,
      userText: input.sourcePrompt,
    });

    const imageIntentEvent: BuilderV3ImageIntentEvent = {
      type: "image_intent",
      id: nextId(),
      timestamp: ts(),
      operation: op,
      intent: imageIntent.intent,
      description: imageIntent.description,
      imageUrl: input.imageUrl,
    };

    await appendEventToDb(db, buildId, imageIntentEvent);
    await appendSessionEventToDb(db, buildId, {
      type: "image_intent",
      intent: imageIntent.intent,
      confidence: imageIntent.confidence,
      description: imageIntent.description,
      imageUrl: input.imageUrl,
    });
    await appendEventToDb(
      db,
      buildId,
      {
        type: "done",
        id: nextId(),
        timestamp: ts(),
        operation: op,
        buildId,
        projectId,
        code: "awaiting_image_confirmation",
        message: "Image intent detected — awaiting confirmation.",
        fallbackUsed: false,
        conversational: true,
      },
      {
        completed_at: ts(),
        status: "completed",
        summary: "Image intent detected — awaiting confirmation.",
      },
    );
    console.log("[generate] image intent detected — awaiting confirmation.", {
      buildId,
      intent: imageIntent.intent,
      confidence: imageIntent.confidence,
    });
    return;
  }

  // ── BEO-372: clarifying answer detection ────────────────────────────────
  // If the previous completed generation for this project ended with a
  // clarifying_question, the current message is the user's answer.
  // Combine original prompt + answer and skip detectIntent entirely.
  let forcedIntent: BuildIntent | null = null;
  if (!input.phaseOverride && !input.confirmedScope) {
    try {
      const prevGen = await db.findLatestCompletedGenerationForProject(buildId);
      if (prevGen && prevGen.id !== buildId) {
        const prevEvents = Array.isArray(prevGen.session_events)
          ? (prevGen.session_events as Record<string, unknown>[])
          : [];
        const lastEvent = prevEvents[prevEvents.length - 1];
        if (lastEvent?.type === "clarifying_question") {
          const origUserEvent = [...prevEvents].reverse().find((e) => e.type === "user");
          const originalPrompt = (origUserEvent?.content as string) || prevGen.prompt;
          prompt = `${originalPrompt}. Clarification: ${input.sourcePrompt}`;
          forcedIntent = input.isIteration ? "edit" : "build";
          console.log("[generate] clarification answer detected — combined prompt, forced intent:", forcedIntent, { buildId });
        }
      }
    } catch (err) {
      console.warn("[generate] clarification check failed (non-fatal):", err instanceof Error ? err.message : String(err));
    }
  }

  if (imageConfirmed) {
    prompt = buildPromptWithImageIntent(prompt, input.confirmedIntent);
    forcedIntent = input.isIteration ? "edit" : "build";
  }

  // ── BEO-362: 4-way intent detection ─────────────────────────────────────
  // Run for all builds except confirmed-scope resumes and phase continuations.
  // Stores the intent so pre_build_ack and build_summary can reference it later.
  let detectedIntent: BuildIntent = input.isIteration ? "edit" : "build";

  if (!input.phaseOverride && !input.confirmedScope) {
    const hasExistingProject = input.isIteration || input.existingFiles.length > 0;
    if (forcedIntent) {
      // BEO-372: skip Haiku classification — we know this is a clarification answer.
      detectedIntent = forcedIntent;
    } else {
      // BEO-371: pass project context so Haiku classifies recommendation/suggestion
      // messages as "question" rather than "build" when a project is already open.
      detectedIntent = await detectIntent(prompt, hasExistingProject, input.projectName, input.sourcePrompt);
    }
    console.log("[generate] intent detected:", detectedIntent, {
      buildId,
      forced: Boolean(forcedIntent),
      imageConfirmed,
    });

    // Emit intent_detected so the frontend can show a visual cue
    await appendEventToDb(db, buildId, {
      type: "intent_detected",
      id: nextId(),
      timestamp: ts(),
      operation: op,
      intent: detectedIntent,
    } as unknown as BuilderV3StatusEvent);

    if (detectedIntent === "question") {
      // BEO-371: deduct 1 credit for conversational Sonnet answers; gate on balance.
      if (!isAdminEmail(userEmail ?? "")) {
        let orgBalance = 0;
        try {
          const orgRow = await db.getOrgWithBalance(orgId);
          orgBalance = (orgRow?.credits ?? 0) + (orgRow?.topup_credits ?? 0);
        } catch {
          // non-fatal — skip the guard if balance check fails
        }
        if (orgBalance < CONVERSATIONAL_COST) {
          await appendEventToDb(db, buildId, {
            type: "insufficient_credits" as const,
            id: nextId(),
            timestamp: ts(),
            operation: op,
            available: orgBalance,
            required: CONVERSATIONAL_COST,
            features: [],
          } as unknown as BuilderV3StatusEvent, {
            status: "insufficient_credits",
          });
          console.log("[generate] question intent — insufficient credits for conversational answer.", { buildId, orgBalance });
          return;
        }
      }

      // BEO-370: persist user prompt before answering
      await appendSessionEventToDb(db, buildId, { type: "user", content: input.sourcePrompt });

      const answerResult = await generateConversationalAnswer({
        chatHistory: projectChatHistory,
        chatSummary: projectChatSummary,
        currentMessage: input.sourcePrompt,
        existingFiles: input.existingFiles,
        projectName: input.projectName,
      });
      const answer = answerResult.message;

      // BEO-371: deduct 1 credit (non-fatal)
      if (!isAdminEmail(userEmail ?? "")) {
        db.applyOrgUsageDeduction(orgId, CONVERSATIONAL_COST, buildId, "Conversational answer").catch((err: unknown) => {
          console.error("[generate] conversational credit deduction failed (non-fatal):", err instanceof Error ? err.message : String(err));
        });
      }

      await appendEventToDb(db, buildId, {
        type: "conversational_response" as const,
        id: nextId(),
        timestamp: ts(),
        operation: op,
        message: answer,
      } as unknown as BuilderV3StatusEvent);
      // BEO-370: persist the answer
      await appendSessionEventToDb(db, buildId, { type: "question_answer", content: answer });
      await persistProjectChatHistory(db, projectId, input.sourcePrompt, answer, {
        existingFiles: input.existingFiles,
        projectName: input.projectName,
      });
      // BEO-366: emit terminal done so the SSE relay closes cleanly and
      // buildDoneRef resets to true on the frontend (no overlay stuck).
      await appendEventToDb(db, buildId, {
        type: "done",
        id: nextId(),
        timestamp: ts(),
        operation: op,
        buildId,
        projectId,
        code: "conversational",
        message: "Question answered — no build started.",
        fallbackUsed: false,
        conversational: true,
      }, {
        status: "completed",
        completed_at: ts(),
        summary: "Question answered — no build started.",
      });
      console.log("[generate] question intent — answered conversationally, no build.");
      return;
    }

    if (detectedIntent === "ambiguous") {
      // BEO-370: persist user prompt before asking clarifying question
      await appendSessionEventToDb(db, buildId, { type: "user", content: input.sourcePrompt });
      const clarifyingQuestion = await generateClarifyingQuestion({
        chatHistory: projectChatHistory,
        chatSummary: projectChatSummary,
        currentMessage: input.sourcePrompt,
        existingFiles: input.existingFiles,
        projectName: input.projectName,
      });
      await appendEventToDb(db, buildId, {
        type: "clarifying_question" as const,
        id: nextId(),
        timestamp: ts(),
        operation: op,
        message: clarifyingQuestion,
      } as unknown as BuilderV3StatusEvent);
      // BEO-370: persist clarifying question
      await appendSessionEventToDb(db, buildId, { type: "clarifying_question", content: clarifyingQuestion });
      await persistProjectChatHistory(db, projectId, input.sourcePrompt, clarifyingQuestion, {
        existingFiles: input.existingFiles,
        projectName: input.projectName,
      });
      // BEO-366: emit terminal done so the SSE relay closes cleanly.
      await appendEventToDb(db, buildId, {
        type: "done",
        id: nextId(),
        timestamp: ts(),
        operation: op,
        buildId,
        projectId,
        code: "conversational",
        message: "Clarifying question sent — awaiting user response.",
        fallbackUsed: false,
        conversational: true,
      }, {
        status: "completed",
        completed_at: ts(),
        summary: "Clarifying question sent — awaiting user response.",
      });
      console.log("[generate] ambiguous intent — clarifying question sent, no build.");
      return;
    }

    // BEO-377: scope confirmation gate removed — frontend no longer shows the
    // confirmation UI (removed in BEO-367). Run credit check then proceed
    // straight to Sonnet build without pausing for confirmation.
    if (detectedIntent === "build" && !input.isIteration) {
      let orgBalance = 0;
      try {
        const orgRow = await db.getOrgWithBalance(orgId);
        orgBalance = (orgRow?.credits ?? 0) + (orgRow?.topup_credits ?? 0);
      } catch (err) {
        console.warn("[generate] credit check failed (non-fatal):", err instanceof Error ? err.message : String(err));
      }
      console.log("[generate] credit balance check:", { orgBalance, negativeFloor: NEGATIVE_FLOOR_CONST, buildId });

      if (!isAdminEmail(input.userEmail ?? "") && orgBalance <= NEGATIVE_FLOOR_CONST) {
        await appendEventToDb(
          db,
          buildId,
          {
            type: "insufficient_credits" as const,
            id: nextId(),
            timestamp: ts(),
            operation: op,
            available: orgBalance,
            required: 0,
            features: [],
          } as unknown as BuilderV3StatusEvent,
          { status: "insufficient_credits" },
        );
        console.log("[generate] insufficient_credits — balance already below negative floor.", { buildId, orgBalance });
        return;
      }

      if (!isAdminEmail(input.userEmail ?? "") && orgBalance <= 0) {
        await appendEventToDb(
          db,
          buildId,
          {
            type: "insufficient_credits" as const,
            id: nextId(),
            timestamp: ts(),
            operation: op,
            available: orgBalance,
            required: 0,
            features: [],
            reason: "credits_exhausted",
          } as unknown as BuilderV3StatusEvent,
          { status: "insufficient_credits" },
        );
        console.log("[generate] credits exhausted — soft-blocking new build.", { buildId, orgBalance });
        return;
      }
      // Credit check passed — fall through to build
    }
  }

  // ── URL reference grounding + domain enrichment ───────────────────────────
  // When a build prompt includes a URL, fetch Jina reader content first and
  // prepend it as grounding so both enrichPrompt() and Sonnet see the real
  // website description before any model inference happens.
  // For confirmedScope builds the workingPrompt is pre-built below.
  // Run a fast Haiku + web-search call before template selection and Sonnet
  // generation. Adds domain context for niche/regional/industry prompts.
  // Generic prompts (todo, calculator, etc.) skip this with zero delay.
  // Any failure returns the original prompt unchanged — never blocks the build.
  let workingPrompt: string;
  if (input.confirmedScope) {
    // Resume after scope confirmation — inject confirmed feature list if provided
    const featureList = input.confirmedScope.features.join(", ");
    workingPrompt = featureList
      ? `${input.confirmedScope.enrichedPrompt}\n\nBuild ONLY these confirmed features: ${featureList}\nDo not add any feature not in this list.`
      : input.confirmedScope.enrichedPrompt;
    console.log("[generate] resuming with confirmedScope:", input.confirmedScope.features.length, "features");
  } else {
    const promptWithUrlGrounding = await injectUrlContextIntoBuildPrompt(prompt);
    if (promptWithUrlGrounding !== prompt) {
      console.log("[generate] URL reference grounded into build prompt.", { buildId });
    }
    workingPrompt = input.isIteration ? promptWithUrlGrounding : await enrichPrompt(promptWithUrlGrounding);
  }
  const imageContextBlock = input.confirmedIntent
    ? buildImageIntentContext(input.confirmedIntent)
    : undefined;

  // ── Phase planning (initial builds only, non-iteration) ───────────────────
  // If the enriched prompt is complex and no phase override is supplied,
  // plan phases with Haiku. Failures here NEVER block the build.
  let activePhasesData: Phase[] | null = null;
  let activeCurrentPhase = 1;
  let activePhasesTotal = 0;

  if (!input.isIteration) {
    if (input.phaseOverride) {
      // Continuing an existing phased project
      activePhasesData = input.phaseOverride.phases;
      activeCurrentPhase = input.phaseOverride.currentPhase;
      activePhasesTotal = input.phaseOverride.phasesTotal;
      console.log("[generate] phase override supplied:", { currentPhase: activeCurrentPhase, phasesTotal: activePhasesTotal });
    } else if (isComplexPrompt(workingPrompt) && !input.forcedSimple) {
      try {
        const phases = await planPhases(workingPrompt);
        if (phases.length > 0) {
          activePhasesData = phases;
          activeCurrentPhase = 1;
          activePhasesTotal = phases.length;

          // Persist phase plan to the project
          await db.updateProject(projectId, {
            build_phases: phases as unknown,
            phases_total: activePhasesTotal,
            current_phase: 1,
            phase_mode: true,
          }).catch((e) => console.warn("[generate] phase plan save failed (non-fatal):", e instanceof Error ? e.message : String(e)));

          console.log("[generate] phases planned and saved:", activePhasesTotal, "phases");
        }
      } catch (phaseErr) {
        console.warn("[generate] planPhases threw (non-fatal):", phaseErr instanceof Error ? phaseErr.message : String(phaseErr));
      }
    }
  }

  const statusEvent = (code: string, message: string, phase: string): BuilderV3StatusEvent => ({
    type: "status",
    id: nextId(),
    timestamp: ts(),
    operation: op,
    code,
    phase,
    message,
  });

  const emitStagePreamble = async (rawPrompt: string, isIteration: boolean): Promise<void> => {
    const preamble = await generateStagePreambleWithUsage({
      prompt: rawPrompt,
      isIteration,
    });
    narrationUsage = addTokenUsage(narrationUsage, preamble.usage);

    const event: BuilderV3PreambleEvent = {
      type: "stage_preamble",
      id: nextId(),
      timestamp: ts(),
      operation: op,
      restatement: preamble.payload.restatement,
      bullets: preamble.payload.bullets,
    };

    await appendEventToDb(db, buildId, event);
  };

  // ── Best-matching prebuilt template ──────────────────────────────────────
  const prebuilt = pickBestPrebuilt(templateId, workingPrompt);

  // Remap prebuilt files to apps/web/src/app/generated/{templateId}/ and add
  // the synthetic manifest. templateId is the SLM-matched legacy ID (e.g.
  // "workspace-task") which is also stored in generationRow.template_id and
  // used as project.templateId in the frontend → must be consistent.
  const templateFiles = templateFilesToStudioFiles(prebuilt.files, templateId);

  let paletteId = "professional-blue";
  try {
    const p = await classifyPalette(workingPrompt);
    paletteId = p.palette;
    console.log("[generate] palette selected:", paletteId, { confidence: p.confidence });
  } catch {
    // non-fatal
  }

  try {
    // ── ITERATION PATH ─────────────────────────────────────────────────────────
    // For iteration (user modifying an existing project), skip template loading.
    // Pass current files as context; AI returns only changed files.
    if (input.isIteration && input.existingFiles.length > 0) {
      const existingFiles = filterBlockedGeneratedFiles([...input.existingFiles]);

      // Load DB schema for this project if database is enabled (BEO-288)
      let iterSchemaSummary: string | undefined;
      let hasWiredSupabaseClient = false;
      let iterDbProvider: string | null = null;
      let iterNeonAuthBaseUrl: string | null = null;
      let iterProject: Awaited<ReturnType<typeof db.findProjectById>> | null = null;
      try {
        iterProject = await db.findProjectById(projectId);
        hasWiredSupabaseClient = Boolean(iterProject?.db_wired);
        iterDbProvider = iterProject?.db_provider ?? null;
        if (iterDbProvider === "neon") {
          const limits = await db.getProjectDbLimits(projectId);
          iterNeonAuthBaseUrl =
            typeof limits?.neon_auth_base_url === "string" ? limits.neon_auth_base_url : null;
        }
        if (iterProject?.database_enabled && iterProject.db_schema) {
          const tables = await getSchemaTableList(iterProject.db_schema);
          if (tables.length > 0) {
            iterSchemaSummary = tables
              .map(
                (t) =>
                  `Table: ${t.table_name} (${t.columns.map((col) => `${col.name} ${col.type}`).join(", ")})`,
              )
              .join("\n");
            console.log("[generate] iteration: DB schema loaded for project", projectId, "tables:", tables.map((t) => t.table_name));
          }
        }
      } catch (schemaErr) {
        // non-fatal — iteration proceeds without schema context
        console.warn("[generate] iteration: failed to load DB schema (non-fatal):", schemaErr instanceof Error ? schemaErr.message : String(schemaErr));
      }

      await appendEventToDb(
        db, buildId,
        statusEvent("ai_iterating", "Applying changes…", "customising"),
        { status: "running" },
      );

      await appendEventToDb(
        db, buildId,
        statusEvent("ai_customising", "Applying your changes with AI…", "customising"),
      );

      // Emit pre_build_ack before Sonnet fires (BEO-362)
      if (!preBuildAckEmitted) {
        try {
          preBuildAckEmitted = true;
          const ack = await generatePreBuildAck(prompt, "edit");
          narrationUsage = addTokenUsage(narrationUsage, ack.usage);
          await emitBuildConfirmed(db, buildId, nextId, op, ack.message, projectId);
          await appendEventToDb(db, buildId, {
            type: "pre_build_ack",
            id: nextId(),
            timestamp: ts(),
            operation: op,
            message: ack.message,
          } as unknown as BuilderV3StatusEvent);
          stageEvents.markPreBuildAck();
          // BEO-374: await sequentially to prevent race condition (both reads getting [])
          await appendSessionEventToDb(db, buildId, { type: "user", content: input.sourcePrompt });
          await appendSessionEventToDb(db, buildId, { type: "pre_build_ack", content: ack.message });
        } catch {
          // non-fatal
        }
      }
      try {
        await emitStagePreamble(input.sourcePrompt, true);
      } catch {
        // non-fatal
      }
      await stageEvents.emit("enriching");
      let iterResult: CustomiseResult;
      let iterErrorReason: string | null = null;
      try {
        await stageEvents.emit("generating");
        iterResult = await callModelIterate(
          prompt,
          model,
          existingFiles,
          { buildId, isIteration: true },
          iterSchemaSummary,
          imageContextBlock,
          input.imageUrl,
          hasWiredSupabaseClient,
          iterDbProvider,
          iterNeonAuthBaseUrl,
        );
        console.log("[generate] iteration model returned files:", iterResult.files.map((f) => f.path));

        // Classify returned files as "new" (not in current build) vs "updated" (overwrite existing).
        // Both get the same transforms; the classification is purely for logging + App.tsx detection.
        const existingBasenames = new Set(existingFiles.map((f) => f.path.replace(/^.*\//, "")));

        const newFileNames: string[] = [];
        const updatedFileNames: string[] = [];
        for (const f of iterResult.files) {
          const base = f.path.replace(/^.*\//, "");
          (existingBasenames.has(base) ? updatedFileNames : newFileNames).push(base);
        }

        console.log("[generate] iteration new files from AI:", newFileNames);
        console.log("[generate] iteration existing files matched:", updatedFileNames);

        // Remap ALL returned files (new and updated alike) → flat generated directory,
        // then apply ESM-import + relative-import fixes.
        await stageEvents.emit("sanitising");
        iterResult = {
          ...iterResult,
          files: filterBlockedGeneratedFiles(sanitiseFiles(
            iterResult.files.map((f) => ({
              path: remapPrebuiltPath(f.path, templateId),
              content: f.content,
            })),
          )),
        };

        // If the AI added new page files but didn't update App.tsx, warn loudly.
        // The updated iteration system prompt instructs the AI to always include App.tsx,
        // but as a safety net we detect the gap and log it.
        const appTsxBasename = "App.tsx";
        const appTsxReturned = updatedFileNames.includes(appTsxBasename)
          || newFileNames.includes(appTsxBasename);

        if (newFileNames.length > 0 && !appTsxReturned) {
          console.warn(
            "[generate] iteration: AI added new file(s) without updating App.tsx — "
            + "new pages may not be routable until App.tsx is updated.",
            { newFileNames },
          );
        }

        console.log("[generate] iteration remapped files:", iterResult.files.map((f) => f.path));

        // Apply DB schema migrations returned by the AI (non-fatal — BEO-288)
        if (iterSchemaSummary && iterResult.migrations && iterResult.migrations.length > 0) {
          const iterProject = await db.findProjectById(projectId).catch(() => null);
          const dbSchemaName = iterProject?.db_schema ?? "";
          let migrationsApplied = 0;
          for (const stmt of iterResult.migrations) {
            const s = stmt.trim();
            if (!s) continue;
            if (!isAdminEmail(userEmail) && !isAllowedMigrationStatement(s, dbSchemaName)) {
              console.warn("[generate] iteration: migration rejected by allowlist:", s.slice(0, 100));
              continue;
            }
            try {
              await runSql(s.endsWith(";") ? s : `${s};`);
              migrationsApplied++;
            } catch (migErr) {
              console.error("[generate] iteration: migration failed (non-fatal):", migErr instanceof Error ? migErr.message : String(migErr));
            }
          }
          if (migrationsApplied > 0) {
            try {
              await runSql("NOTIFY pgrst, 'reload config'; NOTIFY pgrst, 'reload schema';");
            } catch { /* non-fatal */ }
            console.log("[generate] iteration: migrations applied:", migrationsApplied);
          }
        }
      } catch (iterErr) {
        iterErrorReason = iterErr instanceof Error ? iterErr.message : String(iterErr);
        console.warn("[generate] iteration AI call failed.", {
          buildId, prompt, model, error: iterErrorReason,
        });
        // Graceful degradation: keep existing files unchanged, surface real reason to user
        iterResult = {
          files: [],
          summary: `Could not apply changes — ${iterErrorReason}`,
          outputTokens: 0,
        };
      }

      // Merge: new files are added, updated files override existing ones
      const mergedIterFiles = mergeFiles([...existingFiles], iterResult.files);
      const { files: iterFinalFiles, missing: iterMissingImports } = postProcessGeneratedFiles(
        mergedIterFiles,
        templateId,
      );
      if (iterMissingImports.length > 0) {
        console.warn("[generate] WARNING: missing imports detected in iteration:", iterMissingImports);
        console.log("[generate] generating stub files for missing components...", { count: iterMissingImports.length });
      }

      const updatedCount = iterResult.files.filter((f) =>
        existingFiles.some((e) => e.path === f.path),
      ).length;
      const addedCount = iterResult.files.length - updatedCount;

      console.log("[generate] iteration merge result:", {
        updated: updatedCount,
        added: addedCount,
        total: iterFinalFiles.length,
      });
      const iterCompletedAt = ts();
      let iterationHistoryReply = iterResult.summary;

      await stageEvents.emit("persisting");
      await stageEvents.emit("deploying");

      // BEO-368: credit deduction runs first so iterCreditsUsed is available for the summary footer.
      // Post-deduction for successful iteration (no charge on failure)
      const iterInputTokens = iterResult.inputTokens ?? 0;
      const iterTokens = iterResult.outputTokens ?? 0;
      let iterCreditsUsed = 0;
      let iterCostUsd: number | null = null;

      // BEO-362: post-build summary via Haiku
      if (iterResult.files.length > 0) {
        try {
          const changedPaths = iterResult.files.map((f) => f.path.replace(/^.*\//, ""));
          const summaryResult = await generateBuildSummary(prompt, changedPaths);
          narrationUsage = addTokenUsage(narrationUsage, summaryResult.usage);
          if (iterTokens > 0 && !isAdminEmail(userEmail)) {
            const mainCost = calcCreditCost(iterInputTokens, iterTokens);
            const narrationCost = calcCreditCostHaiku(narrationUsage.inputTokens, narrationUsage.outputTokens);
            const totalCost = mainCost + narrationCost;
            iterCostUsd = roundUsd(
              calcSonnetCostUsd(iterInputTokens, iterTokens)
              + calcHaikuCostUsd(narrationUsage.inputTokens, narrationUsage.outputTokens),
            );
            try {
              const deduction = await db.applyOrgUsageDeduction(orgId, totalCost, buildId, "App iteration");
              iterCreditsUsed = deduction.deducted;
              console.log("[generate] iteration credits deducted:", {
                deducted: deduction.deducted,
                mainCost,
                narrationCost,
                inputTokens: iterInputTokens,
                outputTokens: iterTokens,
                narrationUsage,
                buildId,
              });
            } catch (deductErr) {
              console.error("[generate] iteration credit deduction failed (non-fatal):", deductErr instanceof Error ? deductErr.message : String(deductErr));
            }
          }
          const iterDurationMs = Date.now() - buildStartTime;
          iterationHistoryReply = summaryResult.message;
          await appendEventToDb(db, buildId, {
            type: "build_summary",
            id: nextId(),
            timestamp: ts(),
            operation: op,
            message: summaryResult.message,
            filesChanged: changedPaths,
            durationMs: iterDurationMs,
            creditsUsed: iterCreditsUsed,
          } as unknown as BuilderV3StatusEvent);
          // BEO-374: await so session_events is written before the function returns
          await appendSessionEventToDb(db, buildId, {
            type: "build_summary",
            content: summaryResult.message,
            filesChanged: changedPaths,
            durationMs: iterDurationMs,
            creditsUsed: iterCreditsUsed,
          });
        } catch {
          // non-fatal
        }
      }

      const iterDoneEvent: BuilderV3DoneEvent = {
        type: "done",
        id: nextId(),
        timestamp: iterCompletedAt,
        operation: op,
        code: "build_completed",
        message: iterResult.summary,
        buildId,
        projectId,
        fallbackUsed: iterResult.files.length === 0,
        fallbackReason: iterErrorReason ?? null,
      };
      await appendEventToDb(db, buildId, iterDoneEvent, {
        completed_at: iterCompletedAt,
        files: iterFinalFiles,
        status: "completed",
        summary: iterResult.summary,
      });

      console.log("[generate] iteration complete.", {
        buildId,
        changedFiles: iterResult.files.length,
        added: addedCount,
        updated: updatedCount,
        total: iterFinalFiles.length,
      });

      await db.upsertBuildTelemetry({
        id: buildId,
        project_id: projectId,
        user_id: userId,
        prompt: input.sourcePrompt,
        template_used: templateId,
        palette_used: "iteration",
        files_generated: iterFinalFiles.length,
        succeeded: iterResult.files.length > 0,
        fallback_reason: iterErrorReason,
        error_log: iterErrorReason ? { message: iterErrorReason } : null,
        generation_time_ms: Date.parse(iterCompletedAt) - Date.parse(requestedAt) || null,
        credits_used: iterCreditsUsed,
        output_tokens: iterTokens,
        cost_usd: iterCostUsd,
        user_iterated: true,
        iteration_count: 0,
        model_used: model,
      }).catch(() => undefined);

      await db.updateProject(projectId, { status: "ready" }).catch(() => undefined);
      await persistProjectChatHistory(db, projectId, input.sourcePrompt, iterationHistoryReply, {
        existingFiles: iterFinalFiles,
        projectName: input.projectName,
      });
      return;
    }

    // ── 1. Status: loading ──────────────────────────────────────────────────
    await appendEventToDb(
      db, buildId,
      statusEvent("template_loading", "Loading template…", "loading"),
      { status: "running" },
    );

    // ── phases_planned SSE event (if phases were just planned) ─────────────
    if (activePhasesData && activeCurrentPhase === 1 && !input.phaseOverride) {
      // Emit a friendly heads-up BEFORE the phases card
      const phaseIntroEvent = statusEvent(
        "phases_intro",
        "This is a large app — I'll build it in 5 progressive phases. Phase 1 builds the complete foundation and usually takes 5–10 minutes. Each phase adds a deeper layer on top.",
        "planning",
      );
      await appendEventToDb(db, buildId, phaseIntroEvent);

      const phasesPlannedEvent = {
        type: "phases_planned" as const,
        id: nextId(),
        timestamp: ts(),
        operation: op,
        code: "phases_planned",
        message: `Building in ${activePhasesTotal} phases. Starting Phase 1.`,
        phases: activePhasesData,
        currentPhase: 1,
      };
      await appendEventToDb(db, buildId, phasesPlannedEvent as unknown as BuilderV3StatusEvent);
    }

    // ── 2. Anthropic customisation ──────────────────────────────────────────
    await appendEventToDb(
      db, buildId,
      statusEvent("ai_customising", "Customising with AI…", "customising"),
    );

    // Emit pre_build_ack before Sonnet fires (BEO-362)
    if (!preBuildAckEmitted) {
      try {
        preBuildAckEmitted = true;
        const ackIntent = detectedIntent === "edit" ? "edit" : "build";
        const ack = await generatePreBuildAck(prompt, ackIntent);
        narrationUsage = addTokenUsage(narrationUsage, ack.usage);
        await emitBuildConfirmed(db, buildId, nextId, op, ack.message, projectId);
        await appendEventToDb(db, buildId, {
          type: "pre_build_ack",
          id: nextId(),
          timestamp: ts(),
          operation: op,
          message: ack.message,
        } as unknown as BuilderV3StatusEvent);
        stageEvents.markPreBuildAck();
        // BEO-374: await sequentially to prevent race condition (both reads getting [])
        await appendSessionEventToDb(db, buildId, { type: "user", content: input.sourcePrompt });
        await appendSessionEventToDb(db, buildId, { type: "pre_build_ack", content: ack.message });
      } catch {
        // non-fatal
      }
    }
    try {
      await emitStagePreamble(input.sourcePrompt, false);
    } catch {
      // non-fatal
    }
    await stageEvents.emit("classifying");
    await stageEvents.emit("enriching");

    let customised: CustomiseResult;
    let fallbackUsed = false;

    // Build phase context block if in phase mode
    const phaseContextBlock = activePhasesData
      ? buildPhaseContextBlock(
          activeCurrentPhase,
          activePhasesTotal,
          activePhasesData,
          input.existingFiles.map((f) => f.path.replace(/^.*\//, "")),
        )
      : undefined;

    // Scope the USER-turn instruction to this phase so Sonnet doesn't attempt
    // the full app in a single call and hit max_tokens (BEO-197 diagnosis).
    const activePhaseData = activePhasesData?.find((p) => p.index === activeCurrentPhase);
    const phaseScope: PhaseScope | undefined = activePhaseData
      ? {
          index: activeCurrentPhase,
          total: activePhasesTotal,
          title: activePhaseData.title,
          focus: activePhaseData.focus,
        }
      : undefined;
    if (phaseScope) {
      console.log("[generate] phase scope injected into user turn:", { phase: phaseScope.index, title: phaseScope.title });
    }

    try {
      await stageEvents.emit("generating");
      customised = await callModelCustomise(
        workingPrompt,
        model,
        paletteId,
        { buildId, isIteration: input.isIteration },
        phaseContextBlock,
        imageContextBlock,
        input.imageUrl,
        phaseScope,
        input.forcedSimple ? 32000 : undefined,
      );
      console.log("[generate] Model returned files:", customised.files.map((f) => f.path));
      // BEO-319: zero-file guard — catches both max_tokens truncation (incomplete
      // tool JSON → input={}) and any case where Sonnet returns files:[]. Throwing
      // here routes to the existing catch block which sets fallbackUsed:true and
      // shows the prebuilt scaffold instead of silently serving 2 template files.
      if (customised.files.length === 0) {
        throw new Error(`Model returned 0 files (stop_reason likely max_tokens or empty tool response; outputTokens: ${customised.outputTokens ?? 0})`);
      }
      // Remap paths — Claude returns bare filenames (App.tsx, AssetsPage.tsx) which
      // we flatten into the generated directory. Patch any residual CJS React globals.
      await stageEvents.emit("sanitising");
      customised = {
        ...customised,
        files: sanitiseFiles(
          customised.files.map((f) => ({
            path: remapPrebuiltPath(f.path, templateId),
            content: f.content,
          })),
        ),
      };
      console.log("[generate] Remapped files:", customised.files.map((f) => f.path));
    } catch (aiError) {
      // Graceful degradation: show pre-built template as-is (spec requirement)
      console.error("[generate] AI call failed — using scaffold fallback.", {
        buildId,
        model,
        error: aiError instanceof Error ? aiError.message : String(aiError),
        stack: aiError instanceof Error ? aiError.stack?.split("\n").slice(0, 5).join(" | ") : undefined,
      });
      await stageEvents.emit("sanitising");
      customised = {
        files: sanitiseFiles(
          prebuilt.files.map((f) => ({
            path: remapPrebuiltPath(f.path, templateId),
            content: f.content,
          })),
        ),
        summary: `${prebuilt.manifest.name} — ${prompt}`,
        outputTokens: 0,
      };
      fallbackUsed = true;
    }

    // BEO-330: accumulate all previous phases' files so each phase generation
    // contains the full app, not just its own slice. existingFiles holds the
    // prior phase's complete set; merging them between templateFiles and
    // customised.files means phase N = template + phases 1…N-1 + phase N.
    const mergedFiles = mergeFiles(
      mergeFiles(templateFiles, [...(input.existingFiles ?? [])]),
      customised.files,
    );
    const { files: finalFiles, missing: missingImports } = postProcessGeneratedFiles(
      mergedFiles,
      templateId,
    );
    if (missingImports.length > 0) {
      console.warn("[generate] WARNING: missing imports detected:", missingImports);
      console.log("[generate] generating stub files for missing components...", { count: missingImports.length });
    }
    const completedAt = ts();

    // BEO-326: per-phase file diff — only meaningful when this is a phase build
    // and the AI path succeeded (not fallback). Uses the remapped customised.files
    // (what the model generated this phase) vs input.existingFiles (prior phase
    // snapshot) to classify each path as created or modified.
    let phaseDiff: { created: string[]; modified: string[]; unchangedCount: number } | null = null;
    if (phaseScope && !fallbackUsed) {
      const prevPathSet = new Set(input.existingFiles.map((f) => f.path));
      const generatedPaths = customised.files.map((f) => f.path);
      const created = generatedPaths.filter((p) => !prevPathSet.has(p));
      const modified = generatedPaths.filter((p) => prevPathSet.has(p));
      const unchangedCount = Math.max(0, prevPathSet.size - modified.length);
      phaseDiff = { created, modified, unchangedCount };
      console.log(`[phase ${phaseScope.index}] file diff:`, {
        phase: phaseScope.title,
        created,
        modified,
        unchanged: unchangedCount,
        totalFiles: finalFiles.length,
      });
    }

    await stageEvents.emit("persisting");
    await stageEvents.emit("deploying");

    // BEO-362: post-build summary via Haiku
    // BEO-368: credit deduction runs first so creditsUsed is available for the summary footer.
    const inputTokens = customised.inputTokens ?? 0;
    const outputTokens = customised.outputTokens ?? 0;
    let creditsUsed = 0;
    let costUsd: number | null = null;

    let buildHistoryReply = customised.summary;

    if (!fallbackUsed) {
      try {
        const changedPaths = customised.files.map((f) => f.path.replace(/^.*\//, ""));
        const summaryResult = await generateBuildSummary(prompt, changedPaths);
        buildHistoryReply = summaryResult.message;
        narrationUsage = addTokenUsage(narrationUsage, summaryResult.usage);
        const nextSteps = await generateNextStepsWithUsage({
          appDescriptor: workingPrompt,
          fileList: finalFiles
            .map((file) => file.path.replace(/^.*\//, ""))
            .filter((path) => path !== "app.manifest.json"),
          isIteration: input.isIteration,
          prompt: input.sourcePrompt,
        });
        narrationUsage = addTokenUsage(narrationUsage, nextSteps.usage);
        if (outputTokens > 0 && !isAdminEmail(userEmail)) {
          const mainCost = calcCreditCost(inputTokens, outputTokens);
          const narrationCost = calcCreditCostHaiku(narrationUsage.inputTokens, narrationUsage.outputTokens);
          const totalCost = mainCost + narrationCost;
          costUsd = roundUsd(
            calcSonnetCostUsd(inputTokens, outputTokens)
            + calcHaikuCostUsd(narrationUsage.inputTokens, narrationUsage.outputTokens),
          );
          try {
            const deduction = await db.applyOrgUsageDeduction(orgId, totalCost, buildId, "App generation");
            creditsUsed = deduction.deducted;
            console.log("[generate] credits deducted:", {
              deducted: creditsUsed,
              mainCost,
              narrationCost,
              inputTokens,
              outputTokens,
              narrationUsage,
              buildId,
            });
          } catch (deductErr) {
            console.error("[generate] credit deduction failed (non-fatal):", deductErr instanceof Error ? deductErr.message : String(deductErr));
          }
        }
        const finalDurationMs = Date.now() - buildStartTime;
        await appendEventToDb(db, buildId, {
          type: "build_summary",
          id: nextId(),
          timestamp: ts(),
          operation: op,
          message: summaryResult.message,
          filesChanged: changedPaths,
          durationMs: finalDurationMs,
          creditsUsed,
        } as unknown as BuilderV3StatusEvent);
        // BEO-374: await so session_events is written before the function returns
        await appendSessionEventToDb(db, buildId, {
          type: "build_summary",
          content: summaryResult.message,
          filesChanged: changedPaths,
          durationMs: finalDurationMs,
          creditsUsed,
        });
        if (nextSteps.payload) {
          const nextStepsEvent: BuilderV3NextStepsEvent = {
            type: "next_steps",
            id: nextId(),
            timestamp: ts(),
            operation: op,
            suggestions: nextSteps.payload.suggestions,
          };
          await appendEventToDb(db, buildId, nextStepsEvent);
        }
      } catch {
        // non-fatal
      }
    }

    // ── 4. done ─────────────────────────────────────────────────────────────
    const doneEvent: BuilderV3DoneEvent = {
      type: "done",
      id: nextId(),
      timestamp: completedAt,
      operation: op,
      code: "build_completed",
      message: customised.summary,
      buildId,
      projectId,
      fallbackUsed,
      fallbackReason: fallbackUsed ? "anthropic_error" : null,
    };
    await appendEventToDb(db, buildId, doneEvent, {
      completed_at: completedAt,
      files: finalFiles,
      status: "completed",
      summary: customised.summary,
    });

    console.log("[generate] Build complete.", {
      buildId,
      filesCount: finalFiles.length,
      fallbackUsed,
    });

    await persistProjectChatHistory(db, projectId, input.sourcePrompt, buildHistoryReply, {
      existingFiles: finalFiles,
      projectName: input.projectName,
    });

    // ── 5. Telemetry (non-fatal) ───────────────────────────────────────────
    const generationMs = Date.parse(completedAt) - Date.parse(requestedAt);

    await db.upsertBuildTelemetry({
      id: buildId,
      project_id: projectId,
      user_id: userId,
      prompt: input.sourcePrompt,
      template_used: prebuilt.manifest.id,
      palette_used: paletteId,
      files_generated: finalFiles.length,
      succeeded: !fallbackUsed,
      fallback_reason: fallbackUsed ? "anthropic_error" : null,
      error_log: null,
      generation_time_ms: generationMs > 0 ? generationMs : null,
      credits_used: creditsUsed,
      output_tokens: outputTokens,
      cost_usd: costUsd,
      user_iterated: input.isIteration,
      iteration_count: 0,
      model_used: model,
      phase_file_diff: phaseDiff,
    }).catch(() => undefined);

    await db.updateProject(projectId, { status: "ready" }).catch(() => undefined);

    // BEO-265: rename project to the AI-generated brand name (initial build only)
    // BEO-330: guard against phase 2-5 overwriting the name set in phase 1
    if (customised.appName && !input.phaseOverride) {
      console.log("[generate] renaming project to AI brand name:", customised.appName);
      await db.updateProject(projectId, { name: customised.appName }).catch(() => undefined);
    }
  } catch (fatalError) {
    // ── Error path ───────────────────────────────────────────────────────────
    const errorMessage = fatalError instanceof Error ? fatalError.message : "Build failed.";
    console.error("[generate] Fatal build error.", { buildId, error: errorMessage });

    const errorEventId = nextId();
    const errorEvent: BuilderV3ErrorEvent = {
      type: "error",
      id: errorEventId,
      timestamp: ts(),
      operation: op,
      code: "build_failed",
      message: errorMessage,
      buildId,
      projectId,
    };

    await appendEventToDb(db, buildId, errorEvent, {
      completed_at: ts(),
      error: errorMessage,
      status: "failed",
    }).catch(() => undefined);

    await db.updateProject(projectId, { status: "draft" }).catch(() => undefined);
  }
}
