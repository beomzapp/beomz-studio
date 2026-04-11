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
    "Return the complete set of customised app files. "
    + "Only include files that differ from the template. "
    + "The summary must be one clear sentence describing the finished app.",
  input_schema: {
    type: "object",
    properties: {
      files: {
        type: "array",
        description: "Files to create or overwrite. Omit unchanged files.",
        items: {
          type: "object",
          properties: {
            path: { type: "string", description: "File path, e.g. src/App.tsx" },
            content: { type: "string", description: "Complete file content" },
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

// ─── Path mapping for prebuilt templates ──────────────────────────────────────
// The WebContainer preview shell (WORKSPACE_PREVIEW_APP_TSX in webcontainer.ts)
// globs `apps/web/src/app/generated/**/*.tsx` and reads routes from
// `apps/web/src/generated/{templateId}/app.manifest.json`.
//
// Prebuilt templates store their component at bare `App.tsx`. We remap to the
// generated path so Vite's glob finds the file and runtime.json routes match.
function remapPrebuiltPath(originalPath: string, templateId: string): string {
  // Flatten any directory prefix — keep only the filename.
  // "App.tsx" → "apps/web/src/app/generated/workspace-task/App.tsx"
  // "components/Card.tsx" → "apps/web/src/app/generated/workspace-task/Card.tsx"
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

// ─── Anthropic customisation call ────────────────────────────────────────────

async function callAnthropicCustomise(
  prompt: string,
  templateFiles: readonly TemplateFile[],
  paletteId: string,
): Promise<CustomiseResult> {
  const client = new Anthropic({ apiKey: apiConfig.ANTHROPIC_API_KEY });

  const fileContext = templateFiles
    .slice(0, 40) // guard against token overflow
    .map((f) => `<file path="${f.path}">\n${f.content}\n</file>`)
    .join("\n\n");

  const systemPrompt = [
    "You are customising a pre-built React application template.",
    "The user wants an app tailored to their request.",
    "",
    "Rules:",
    "- Return ONLY files that need to change. Unchanged files are inherited automatically.",
    "- Keep all imports intact. Never add new npm dependencies.",
    "- Customise: text content, labels, demo data, colour values, placeholder values.",
    "- Do NOT change routing structure or top-level component names.",
    "- Do NOT import drag-and-drop libraries.",
    "- Do NOT import react-icons or @heroicons — use lucide-react only.",
    `- Accent colour hint from palette: ${paletteId} — honour it where natural.`,
    "",
    "CRITICAL — WebContainer COEP restrictions (violating these breaks the preview):",
    "- NEVER add Google Fonts or any external font. No @import url('https://fonts.googleapis.com/...')",
    "  and no <link href='https://fonts.googleapis.com/...'> or any fonts.gstatic.com URL.",
    "  Use only system fonts: font-family: system-ui, -apple-system, sans-serif",
    "  or Tailwind's default font stack (font-sans, font-mono).",
    "- NEVER load any resource from an external URL: no CDN scripts, no unpkg.com,",
    "  no jsdelivr.net, no cdnjs.cloudflare.com, no external images via https://.",
    "- NEVER add <link>, <script>, or <style> tags that reference external https:// URLs.",
    "- NEVER use url('https://...') in CSS for backgrounds, fonts, or any resource.",
    "  If an image is needed, use a solid Tailwind colour div or an inline SVG instead.",
    "",
    "- Call deliver_customised_files exactly once with the changed files and a one-sentence summary.",
  ].join("\n");

  const userMessage = `Here are the current template files:\n\n${fileContext}\n\nCustomise this app for: ${prompt}`;

  // Use streaming — required by Anthropic for long-running requests (>10 min timeout).
  // stream.finalMessage() collects all chunks and returns the same Message shape as create().
  const stream = client.messages.stream({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 32000,
    system: systemPrompt,
    tools: [DELIVER_FILES_TOOL],
    tool_choice: { type: "tool", name: "deliver_customised_files" },
    messages: [{ role: "user", content: userMessage }],
  });
  const message = await stream.finalMessage();

  const toolBlock = message.content.find(
    (b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use",
  );
  if (!toolBlock) {
    throw new Error("Anthropic did not call the deliver_customised_files tool.");
  }

  const raw = toolBlock.input as { files?: unknown; summary?: unknown };
  const files = Array.isArray(raw.files)
    ? (raw.files as Array<{ path: string; content: string }>).filter(
        (f) => typeof f.path === "string" && typeof f.content === "string",
      )
    : [];
  const summary = typeof raw.summary === "string" ? raw.summary : `${prompt} app`;

  return { files, summary };
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
  const { buildId, projectId, prompt, templateId, requestedAt, userId } = input;
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
      customised = await callAnthropicCustomise(prompt, prebuilt.files, paletteId);
      // Remap paths from the bare `App.tsx` format Claude returns → generated paths,
      // and patch any `const { } = React` globals Claude may have preserved.
      customised = {
        ...customised,
        files: sanitiseFiles(
          customised.files.map((f) => ({
            path: remapPrebuiltPath(f.path, templateId),
            content: patchReactGlobals(f.content),
          })),
        ),
      };
    } catch (aiError) {
      // Graceful degradation: show pre-built template as-is (spec requirement)
      console.warn("[generate] Anthropic failed, using template as-is.", {
        buildId,
        error: aiError instanceof Error ? aiError.message : String(aiError),
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
      model_used: "claude-haiku-4-5-20251001",
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
