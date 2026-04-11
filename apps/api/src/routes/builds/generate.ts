/**
 * BEO-210: Template-first streaming build handler.
 *
 * Pattern (from Claude Code QueryEngine): AsyncGenerator yields events →
 * caller persists each event to DB → SSE polling loop in events.ts picks
 * them up and delivers to the frontend in real time.
 *
 * Flow:
 *   1. Load prebuilt template → emit scaffold_ready (preview_ready)
 *      Frontend mounts template in WebContainer immediately (~1-2s).
 *   2. Call Anthropic once: "customise this template for: {prompt}"
 *      Uses tool_use so the response is structured JSON, not markdown.
 *   3. Merge customised files → emit done
 *      HMR in WebContainer picks up the delta automatically.
 *   4. Fallback: if Anthropic fails the template is shown as-is (still a
 *      working app, not a blank scaffold).
 */

import { randomUUID } from "node:crypto";

import Anthropic from "@anthropic-ai/sdk";
import type {
  BuilderV3DoneEvent,
  BuilderV3ErrorEvent,
  BuilderV3PreviewReadyEvent,
  BuilderV3StatusEvent,
  BuilderV3TraceMetadata,
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
import { classifyPalette } from "../../lib/slm/client.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BuildGenerateInput {
  buildId: string;
  projectId: string;
  userId: string | null;
  prompt: string;
  sourcePrompt: string;
  templateId: string;
  model: string;
  requestedAt: string;
  operationId: string;
  isIteration: boolean;
  existingFiles: readonly StudioFile[];
}

interface CustomiseResult {
  files: Array<{ path: string; content: string }>;
  summary: string;
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
    },
    required: ["files", "summary"],
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
// All prebuilt templates use `const { useState, ... } = React;` (CJS/UMD style)
// designed for the inline srcDoc preview where React is injected as window.React.
// Vite inside WebContainer uses strict ESM — patch each destructure to a proper
// import statement so the component compiles without errors.
function patchReactGlobals(content: string): string {
  const allNames = new Set<string>();
  const cleaned = content.replace(
    /^const\s*\{([^}]+)\}\s*=\s*React\s*;?\r?\n?/gm,
    (_match, identifiers: string) => {
      identifiers.split(",").map((s) => s.trim()).filter(Boolean).forEach((n) => allNames.add(n));
      return "";
    },
  );
  if (allNames.size === 0) return content;
  return `import { ${Array.from(allNames).join(", ")} } from "react";\n${cleaned}`;
}

// ─── Flatten relative imports ─────────────────────────────────────────────────
// After remapPrebuiltPath() all generated files live in the same flat directory.
// If the AI generates App.tsx with `import X from './components/X'` but we
// flatten components/X.tsx → X.tsx, the import breaks and Vite returns
// index.html (text/html) instead of the module → MIME error.
//
// This function rewrites any relative import that has directory components
// to a flat `./basename` form:
//   './components/AssetsPage'  → './AssetsPage'
//   '../pages/WorkOrders'      → './WorkOrders'
//   './styles.css'             → unchanged (already flat)
function flattenRelativeImports(content: string): string {
  return content.replace(
    /(['"])(\.\.?\/(?:[^/'"]*\/)+[^/'"]+)(['"])/g,
    (_match, open, importPath, close) => {
      const basename = importPath.replace(/^.*\//, "");
      return `${open}./${basename}${close}`;
    },
  );
}

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
      content: patchReactGlobals(f.content),
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
  event: BuilderV3StatusEvent | BuilderV3PreviewReadyEvent | BuilderV3DoneEvent | BuilderV3ErrorEvent,
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

// ─── Shared prompt builders ───────────────────────────────────────────────────

function buildSystemPrompt(paletteId: string, designSystemSpec?: string): string {
  const designBlock = designSystemSpec
    ? `${designSystemSpec}\n\nThe design system spec above takes priority for all visual decisions. Apply all tokens, typography, spacing, and component patterns exactly as specified.\n\n`
    : "";
  const themeTsContent = buildThemeTs(paletteId);
  return [
    designBlock + "You are an expert React developer. BUILD the app the user describes — do NOT merely restyle a template.",
    "Design the architecture from scratch based on what the app actually needs.",
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
    "",
    "══ STEP 3: COEP RULES — violations break the preview, no exceptions ══",
    "  • NO Google Fonts — no @import url('https://fonts.googleapis.com/...')",
    "  • NO external CDN — no unpkg.com, jsdelivr, cdnjs, or any https:// URL in code",
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

function buildUserMessage(prompt: string): string {
  return [
    `Build this app: ${prompt}`,
    "",
    "Stack available (already configured — no setup needed):",
    "  React 18 + TypeScript",
    "  Tailwind CSS v4",
    "  lucide-react icons",
    "  No router installed — use React useState to show different pages/views",
    "  Entry point is App.tsx with a default export",
  ].join("\n");
}

function parseRawToolOutput(raw: { files?: unknown; summary?: unknown }, prompt: string): CustomiseResult {
  const files = Array.isArray(raw.files)
    ? (raw.files as Array<{ path: string; content: string }>).filter(
        (f) => typeof f.path === "string" && typeof f.content === "string",
      )
    : [];
  const summary = typeof raw.summary === "string" ? raw.summary : `${prompt} app`;
  return { files, summary };
}

// ─── Anthropic provider ───────────────────────────────────────────────────────

const ANTHROPIC_HAIKU_FALLBACK = "claude-haiku-4-5-20251001";

async function callAnthropicWithMessages(
  model: string,
  systemPrompt: string,
  userMessage: string,
  prompt: string,
): Promise<CustomiseResult> {
  const executeCall = async (modelId: string): Promise<CustomiseResult> => {
    console.log("[generate] system prompt length:", systemPrompt.length, "chars (~" + Math.round(systemPrompt.length / 4) + " tokens)");
    const client = new Anthropic({ apiKey: apiConfig.ANTHROPIC_API_KEY });
    const stream = client.messages.stream({
      model: modelId,
      max_tokens: 32000,
      system: systemPrompt,
      tools: [DELIVER_FILES_TOOL],
      tool_choice: { type: "tool", name: "deliver_customised_files" },
      messages: [{ role: "user", content: userMessage }],
    });
    const message = await stream.finalMessage();
    console.log("[generate] Anthropic response:", { model: modelId, stop_reason: message.stop_reason, content_blocks: message.content.length, usage: message.usage });
    const toolBlock = message.content.find(
      (b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use",
    );
    if (!toolBlock) throw new Error("Anthropic did not call the deliver_customised_files tool.");
    return parseRawToolOutput(toolBlock.input as { files?: unknown; summary?: unknown }, prompt);
  };

  try {
    return await executeCall(model);
  } catch (err) {
    if (err instanceof Anthropic.APIError && err.status === 404 && model !== ANTHROPIC_HAIKU_FALLBACK) {
      console.error(`[model] ${model} not found, falling back to haiku`);
      return await executeCall(ANTHROPIC_HAIKU_FALLBACK);
    }
    throw err;
  }
}

async function callAnthropicCustomise(
  prompt: string,
  model: string,
  paletteId: string,
  designSystemSpec?: string,
): Promise<CustomiseResult> {
  return callAnthropicWithMessages(model, buildSystemPrompt(paletteId, designSystemSpec), buildUserMessage(prompt), prompt);
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

  const toolCall = response.choices[0]?.message.tool_calls?.[0];
  if (!toolCall || toolCall.type !== "function" || toolCall.function.name !== "deliver_customised_files") {
    throw new Error(`${model} did not call the deliver_customised_files tool.`);
  }
  const raw = JSON.parse(toolCall.function.arguments) as { files?: unknown; summary?: unknown };
  return parseRawToolOutput(raw, prompt);
}

async function callOpenAICompatibleCustomise(
  prompt: string,
  model: string,
  apiKey: string,
  paletteId: string,
  baseURL?: string,
  designSystemSpec?: string,
): Promise<CustomiseResult> {
  return callOpenAICompatibleWithMessages(model, apiKey, buildSystemPrompt(paletteId, designSystemSpec), buildUserMessage(prompt), prompt, baseURL);
}

// ─── Model dispatch (initial build) ──────────────────────────────────────────

async function callModelCustomise(
  prompt: string,
  model: string,
  paletteId: string,
): Promise<CustomiseResult> {
  console.log("[generate] calling model:", model);

  const designSystemId = detectDesignSystem(prompt);
  const designSystemSpec = designSystemId ? getDesignSystemSpec(designSystemId) : undefined;
  if (designSystemId) {
    console.log("[generate] design system spec injected:", designSystemId);
  }

  if (model.startsWith("claude-")) {
    return callAnthropicCustomise(prompt, model, paletteId, designSystemSpec);
  }

  if (model.startsWith("gpt-")) {
    const apiKey = apiConfig.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY not configured on server.");
    return callOpenAICompatibleCustomise(prompt, model, apiKey, paletteId, undefined, designSystemSpec);
  }

  if (model.startsWith("gemini-")) {
    const apiKey = apiConfig.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY not configured on server.");
    return callOpenAICompatibleCustomise(
      prompt, model, apiKey, paletteId,
      "https://generativelanguage.googleapis.com/v1beta/openai/",
      designSystemSpec,
    );
  }

  // Unknown model — fall back to haiku
  console.warn("[generate] Unknown model, falling back to claude-haiku-4-5-20251001:", model);
  return callAnthropicCustomise(prompt, "claude-haiku-4-5-20251001", paletteId, designSystemSpec);
}

// ─── Iteration prompts ────────────────────────────────────────────────────────

function buildIterationSystemPrompt(): string {
  return [
    "You are modifying an existing React application. Apply ONLY the specific change the user requests.",
    "",
    "RULES:",
    "1. Return ONLY files that actually need to change. Do NOT return unchanged files.",
    "2. Preserve all existing structure, components, navigation, and logic unless the change requires touching them.",
    "3. For feature additions: add the minimal code in the relevant file(s) only.",
    "4. For text/copy changes: update only the text content, nothing else.",
    "5. Keep all imports flat — e.g. import X from './X' (no subdirectory paths like './components/X').",
    "6. Never add external CDN links, Google Fonts, or remote URLs (WebContainer COEP policy).",
    "7. Keep all existing functionality that the user did NOT ask to change.",
    "",
    "COLOR CHANGES (highest priority rule):",
    "If the user asks to change colors, theme, accent, or visual style — ONLY return theme.ts.",
    "Update the relevant token values in the theme object (e.g. primary, accent, background, sidebar).",
    "Do NOT touch App.tsx or any page files — they all import from ./theme so HMR propagates automatically.",
    "Example: 'change to red' → set primary: '#dc2626', primaryHover: '#b91c1c', accent: '#ef4444'",
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
    "The summary should briefly describe what changed, e.g. 'Updated theme.ts to red accent.' or 'Added AssetDetailPage with analytics.'",
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
): Promise<CustomiseResult> {
  console.log("[generate] iterating with model:", model);

  const systemPrompt = buildIterationSystemPrompt();
  const userMessage = buildIterationUserMessage(prompt, existingFiles);

  if (model.startsWith("claude-")) {
    return callAnthropicWithMessages(model, systemPrompt, userMessage, prompt);
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

  // Unknown model — fall back to haiku
  console.warn("[generate] Unknown model for iteration, falling back to claude-haiku-4-5-20251001:", model);
  return callAnthropicWithMessages("claude-haiku-4-5-20251001", systemPrompt, userMessage, prompt);
}

// ─── Post-generation COEP sanitiser ─────────────────────────────────────────
// Belt-and-suspenders: even if Claude ignores the system prompt rule, strip
// any external resource references before files reach WebContainer.
// WebContainer enforces COEP require-corp; resources without CORP headers
// (Google Fonts, CDN scripts, external images) trigger
// ERR_BLOCKED_BY_RESPONSE.NotSameOriginAfterDefaultedToSameOriginByCoep.

function sanitiseExternalUrls(content: string, path: string): string {
  let out = content;

  // 1. CSS @import url('https://fonts.googleapis.com/…') — entire line
  out = out.replace(/@import\s+url\(['"]https?:\/\/[^'"]+['"]\)\s*;?\s*/gi, "");
  out = out.replace(/@import\s+['"]https?:\/\/[^'"]+['"]\s*;?\s*/gi, "");

  // 2. url('https://…') inside CSS properties (backgrounds, fonts, etc.)
  //    Replace with none / transparent so the rule still applies but renders blank.
  out = out.replace(/url\(['"]https?:\/\/[^'"]*['"]\)/gi, "none");

  // 3. JSX <link href="https://fonts.googleapis.com/…" … /> or similar
  //    Strip the whole element; these break COEP and are usually font imports.
  out = out.replace(/<link[^>]+href=['"]https?:\/\/[^'"]*['"][^>]*\/?>/gi, "");

  // 4. JSX/HTML <script src="https://…"> … </script>  (CDN scripts)
  out = out.replace(/<script[^>]+src=['"]https?:\/\/[^'"]*['"][^>]*>[\s\S]*?<\/script>/gi, "");
  out = out.replace(/<script[^>]+src=['"]https?:\/\/[^'"]*['"][^>]*\/>/gi, "");

  // 5. Inline style / className strings referencing external font-family from Google
  //    e.g.  fontFamily: "'Roboto', sans-serif"  after a Google Fonts import was stripped.
  //    Leave font-family values intact — just remove the external import; the browser
  //    will fall through to sans-serif naturally.

  if (out !== content) {
    console.warn("[generate] sanitiseExternalUrls: stripped external URL(s) from", path);
  }
  return out;
}

function sanitiseFiles(
  files: Array<{ path: string; content: string }>,
): Array<{ path: string; content: string }> {
  return files.map((f) => ({ ...f, content: sanitiseExternalUrls(f.content, f.path) }));
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

  // Last resort: first in registry
  return listPrebuiltTemplates()[0]!;
}

/**
 * Fire-and-forget background build.  Called after start.ts returns 202.
 * Writes events directly to the generation row's builderTrace so the
 * existing events.ts SSE polling loop delivers them to the frontend.
 */
export async function runBuildInBackground(
  input: BuildGenerateInput,
  db: StudioDbClient,
): Promise<void> {
  const { buildId, projectId, prompt, templateId, model, requestedAt, userId } = input;
  const op = input.isIteration ? "iteration" : ("initial_build" as const);
  let eventSeq = 10; // start at 10; start.ts already wrote event 1 (queued)
  const nextId = () => String(eventSeq++);

  const statusEvent = (code: string, message: string, phase: string): BuilderV3StatusEvent => ({
    type: "status",
    id: nextId(),
    timestamp: ts(),
    operation: op,
    code,
    phase,
    message,
  });

  // ── Best-matching prebuilt template ──────────────────────────────────────
  const prebuilt = pickBestPrebuilt(templateId, prompt);

  // Remap prebuilt files to apps/web/src/app/generated/{templateId}/ and add
  // the synthetic manifest. templateId is the SLM-matched legacy ID (e.g.
  // "workspace-task") which is also stored in generationRow.template_id and
  // used as project.templateId in the frontend → must be consistent.
  const templateFiles = templateFilesToStudioFiles(prebuilt.files, templateId);
  const previewEntryPath = "/";

  let paletteId = "professional-blue";
  try {
    const p = await classifyPalette(prompt);
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
      const existingFiles = input.existingFiles;

      await appendEventToDb(
        db, buildId,
        statusEvent("ai_iterating", "Applying changes…", "customising"),
        { status: "running" },
      );

      // scaffold_ready with existing files so preview shows current app state
      // while AI applies the change in the background.
      const iterScaffoldEvent: BuilderV3PreviewReadyEvent = {
        type: "preview_ready",
        id: nextId(),
        timestamp: ts(),
        operation: op,
        code: "scaffold_ready",
        message: "Loading existing app…",
        buildId,
        projectId,
        previewEntryPath: "/",
        fallbackUsed: false,
      };
      await appendEventToDb(db, buildId, iterScaffoldEvent, {
        files: [...existingFiles],
        preview_entry_path: "/",
        template_id: templateId as TemplateId,
      });

      console.log("[generate] iteration scaffold_ready emitted.", { buildId, existingFilesCount: existingFiles.length });

      await appendEventToDb(
        db, buildId,
        statusEvent("ai_customising", "Applying your changes with AI…", "customising"),
      );

      let iterResult: CustomiseResult;
      let iterErrorReason: string | null = null;
      try {
        iterResult = await callModelIterate(prompt, model, existingFiles);
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
        iterResult = {
          ...iterResult,
          files: sanitiseFiles(
            iterResult.files.map((f) => ({
              path: remapPrebuiltPath(f.path, templateId),
              content: flattenRelativeImports(patchReactGlobals(f.content)),
            })),
          ),
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
      } catch (iterErr) {
        iterErrorReason = iterErr instanceof Error ? iterErr.message : String(iterErr);
        console.warn("[generate] iteration AI call failed.", {
          buildId, prompt, model, error: iterErrorReason,
        });
        // Graceful degradation: keep existing files unchanged, surface real reason to user
        iterResult = {
          files: [],
          summary: `Could not apply changes — ${iterErrorReason}`,
        };
      }

      // Merge: new files are added, updated files override existing ones
      const iterFinalFiles = mergeFiles([...existingFiles], iterResult.files);

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
        credits_used: 0,
        user_iterated: true,
        iteration_count: 0,
        model_used: model,
      }).catch(() => undefined);

      await db.updateProject(projectId, { status: "ready" }).catch(() => undefined);
      return;
    }

    // ── 1. Status: loading ──────────────────────────────────────────────────
    await appendEventToDb(
      db, buildId,
      statusEvent("template_loading", "Loading template…", "loading"),
      { status: "running" },
    );

    // ── 2. scaffold_ready → mount template in WebContainer immediately ──────
    const scaffoldEventId = nextId();
    const scaffoldEvent: BuilderV3PreviewReadyEvent = {
      type: "preview_ready",
      id: scaffoldEventId,
      timestamp: ts(),
      operation: op,
      code: "scaffold_ready",
      message: "Template ready. Customising for your prompt…",
      buildId,
      projectId,
      previewEntryPath,
      fallbackUsed: false,
    };
    await appendEventToDb(db, buildId, scaffoldEvent, {
      files: templateFiles,
      preview_entry_path: previewEntryPath,
      template_id: templateId as TemplateId,
    });

    console.log("[generate] scaffold_ready emitted.", { buildId, templateId: prebuilt.manifest.id });

    // ── 3. Anthropic customisation ──────────────────────────────────────────
    await appendEventToDb(
      db, buildId,
      statusEvent("ai_customising", "Customising with AI…", "customising"),
    );

    let customised: CustomiseResult;
    let fallbackUsed = false;

    try {
      customised = await callModelCustomise(prompt, model, paletteId);
      console.log("[generate] Model returned files:", customised.files.map((f) => f.path));
      // Remap paths — Claude returns bare filenames (App.tsx, AssetsPage.tsx) which
      // we flatten into the generated directory. Patch any residual CJS React globals.
      customised = {
        ...customised,
        files: sanitiseFiles(
          customised.files.map((f) => ({
            path: remapPrebuiltPath(f.path, templateId),
            // patchReactGlobals: CJS React destructure → ESM import
            // flattenRelativeImports: './components/X' → './X' (all files are flat)
            content: flattenRelativeImports(patchReactGlobals(f.content)),
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
      customised = {
        files: sanitiseFiles(
          prebuilt.files.map((f) => ({
            path: remapPrebuiltPath(f.path, templateId),
            content: patchReactGlobals(f.content),
          })),
        ),
        summary: `${prebuilt.manifest.name} — ${prompt}`,
      };
      fallbackUsed = true;
    }

    const finalFiles = mergeFiles(templateFiles, customised.files);
    const completedAt = ts();

    // ── 4. done ─────────────────────────────────────────────────────────────
    const doneEventId = nextId();
    const doneEvent: BuilderV3DoneEvent = {
      type: "done",
      id: doneEventId,
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

    // ── 5. Telemetry (non-fatal) ─────────────────────────────────────────────
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
      credits_used: 0,
      user_iterated: input.isIteration,
      iteration_count: 0,
      model_used: model,
    }).catch(() => undefined);

    await db.updateProject(projectId, { status: "ready" }).catch(() => undefined);
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
