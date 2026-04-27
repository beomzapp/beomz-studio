import { setTimeout as delay } from "node:timers/promises";

import type {
  BuilderV3DoneEvent,
  BuilderV3Event,
  BuilderV3Operation,
  BuilderV3PreambleEvent,
  BuilderV3PreBuildAckEvent,
  StudioFile,
} from "@beomz-studio/contracts";
import type { StudioDbClient } from "@beomz-studio/studio-db";

import { saveProjectVersion, studioFilesToVersionFiles } from "../projectVersions.js";

const MOCK_FIRST_EVENT_DELAY_MS = 200;
const MOCK_STAGE_PREAMBLE_AT_MS = 800;
const MOCK_FILES_AT_MS = 1_500;
const MOCK_TOTAL_STREAM_DURATION_MS = 2_000;

interface MockFilesEvent extends Record<string, unknown> {
  type: "files";
  id: string;
  timestamp: string;
  operation: BuilderV3Operation;
  files: Array<{ path: string; content: string }>;
  totalFiles: number;
}

interface MockBuildInput {
  buildId: string;
  existingFiles: readonly StudioFile[];
  isIteration: boolean;
  orgId: string;
  projectId: string;
  requestedAt: string;
  sourcePrompt: string;
  templateId: string;
  userId: string | null;
}

interface RunMockBuildPipelineArgs {
  input: MockBuildInput;
  db: StudioDbClient;
  operation: BuilderV3Operation;
  nextId: () => string;
  ts: () => string;
  abortSignal?: AbortSignal;
  appendEventToDb: (
    db: StudioDbClient,
    buildId: string,
    event: BuilderV3Event,
    extraPatch?: Partial<Parameters<StudioDbClient["updateGeneration"]>[1]>,
  ) => Promise<void>;
  appendSessionEventToDb: (
    db: StudioDbClient,
    buildId: string,
    event: Record<string, unknown>,
  ) => Promise<void>;
}

function createAbortError(): Error {
  const error = new Error("The operation was aborted.");
  error.name = "AbortError";
  return error;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw createAbortError();
  }
}

async function waitForTargetOffset(startedAt: number, targetOffsetMs: number, signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal);
  const remainingMs = Math.max(0, targetOffsetMs - (Date.now() - startedAt));
  if (remainingMs === 0) {
    return;
  }

  try {
    await delay(remainingMs, undefined, signal ? { signal } : undefined);
  } catch (error) {
    if (signal?.aborted) {
      throw createAbortError();
    }
    throw error;
  }
}

function buildSyntheticManifest(templateId: string, mainFilePath: string): StudioFile {
  const manifest = {
    id: templateId,
    name: "Mock Hello World App",
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
    kind: "asset-manifest",
    language: "json",
    content: JSON.stringify(manifest, null, 2),
    source: "platform",
    locked: false,
  };
}

function buildMockFileOverrides(templateId: string): StudioFile[] {
  const appPath = `apps/web/src/app/generated/${templateId}/App.tsx`;
  const stylesPath = `apps/web/src/app/generated/${templateId}/styles.css`;

  return [
    {
      path: appPath,
      kind: "route",
      language: "tsx",
      source: "ai",
      locked: false,
      content: [
        "import \"./styles.css\";",
        "",
        "export default function App() {",
        "  return (",
        "    <main className=\"mock-app-shell\">",
        "      <div className=\"mock-app-card\">",
        "        <span className=\"mock-app-kicker\">Beomz Mock Build</span>",
        "        <h1>Hello World</h1>",
        "        <p>This build was generated with MOCK_ANTHROPIC=true for load testing.</p>",
        "      </div>",
        "    </main>",
        "  );",
        "}",
        "",
      ].join("\n"),
    },
    {
      path: stylesPath,
      kind: "style",
      language: "css",
      source: "ai",
      locked: false,
      content: [
        ":root {",
        "  color-scheme: dark;",
        "  font-family: Inter, system-ui, sans-serif;",
        "}",
        "",
        "body {",
        "  margin: 0;",
        "  min-height: 100vh;",
        "  background: radial-gradient(circle at top, rgba(249, 115, 22, 0.18), transparent 45%), #0f172a;",
        "  color: #e2e8f0;",
        "}",
        "",
        ".mock-app-shell {",
        "  min-height: 100vh;",
        "  display: grid;",
        "  place-items: center;",
        "  padding: 24px;",
        "}",
        "",
        ".mock-app-card {",
        "  width: min(100%, 480px);",
        "  border-radius: 24px;",
        "  padding: 32px;",
        "  background: rgba(15, 23, 42, 0.88);",
        "  border: 1px solid rgba(249, 115, 22, 0.22);",
        "  box-shadow: 0 24px 80px rgba(15, 23, 42, 0.45);",
        "}",
        "",
        ".mock-app-kicker {",
        "  display: inline-flex;",
        "  margin-bottom: 16px;",
        "  font-size: 12px;",
        "  font-weight: 700;",
        "  letter-spacing: 0.12em;",
        "  text-transform: uppercase;",
        "  color: #fb923c;",
        "}",
        "",
        "h1 {",
        "  margin: 0 0 12px;",
        "  font-size: clamp(2rem, 4vw, 3rem);",
        "}",
        "",
        "p {",
        "  margin: 0;",
        "  line-height: 1.6;",
        "  color: #cbd5e1;",
        "}",
        "",
      ].join("\n"),
    },
    buildSyntheticManifest(templateId, appPath),
  ];
}

function mergeFiles(baseFiles: readonly StudioFile[], overrides: readonly StudioFile[]): StudioFile[] {
  const byPath = new Map<string, StudioFile>(baseFiles.map((file) => [file.path, { ...file }]));

  for (const override of overrides) {
    byPath.set(override.path, { ...override });
  }

  return Array.from(byPath.values());
}

export async function runMockBuildPipeline({
  input,
  db,
  operation,
  nextId,
  ts,
  abortSignal,
  appendEventToDb,
  appendSessionEventToDb,
}: RunMockBuildPipelineArgs): Promise<void> {
  const startedAt = Date.now();
  const preBuildAckMessage = input.isIteration
    ? "Applying your mock changes..."
    : "Building your mock React app...";
  const completedMessage = input.isIteration
    ? "Mock iteration completed with a Hello World React app."
    : "Mock build completed with a Hello World React app.";

  const mockFiles = mergeFiles(
    input.existingFiles,
    buildMockFileOverrides(input.templateId),
  );

  await waitForTargetOffset(startedAt, MOCK_FIRST_EVENT_DELAY_MS, abortSignal);

  const preBuildAckEvent: BuilderV3PreBuildAckEvent = {
    type: "pre_build_ack",
    id: nextId(),
    timestamp: ts(),
    operation,
    message: preBuildAckMessage,
  };

  await appendEventToDb(db, input.buildId, preBuildAckEvent, { status: "running" });
  await appendSessionEventToDb(db, input.buildId, { type: "user", content: input.sourcePrompt });
  await appendSessionEventToDb(db, input.buildId, { type: "pre_build_ack", content: preBuildAckMessage });

  await waitForTargetOffset(startedAt, MOCK_STAGE_PREAMBLE_AT_MS, abortSignal);

  const preambleEvent: BuilderV3PreambleEvent = {
    type: "stage_preamble",
    id: nextId(),
    timestamp: ts(),
    operation,
    restatement: input.isIteration
      ? "Applying a mock iteration to your existing app."
      : "Building a mock Hello World React app for load testing.",
    bullets: input.isIteration
      ? [
          "Updating the main app route with deterministic mock content.",
          "Skipping Anthropic and exercising the same persisted event flow.",
          "Finishing with a stable done event for the SSE client.",
        ]
      : [
          "Creating a tiny React hello-world route.",
          "Skipping Anthropic entirely while keeping SSE + DB writes realistic.",
          "Completing on a fixed 2 second mock timeline.",
        ],
  };

  await appendEventToDb(db, input.buildId, preambleEvent);

  await waitForTargetOffset(startedAt, MOCK_FILES_AT_MS, abortSignal);

  const filesEvent: MockFilesEvent = {
    type: "files",
    id: nextId(),
    timestamp: ts(),
    operation,
    files: mockFiles.map((file) => ({ path: file.path, content: file.content })),
    totalFiles: mockFiles.length,
  };

  await appendEventToDb(
    db,
    input.buildId,
    filesEvent as unknown as BuilderV3Event,
    {
      files: mockFiles,
      preview_entry_path: "/",
    },
  );

  await waitForTargetOffset(startedAt, MOCK_TOTAL_STREAM_DURATION_MS, abortSignal);
  throwIfAborted(abortSignal);

  const completedAt = ts();
  const doneEvent: BuilderV3DoneEvent = {
    type: "done",
    id: nextId(),
    timestamp: completedAt,
    operation,
    code: "build_completed",
    message: completedMessage,
    buildId: input.buildId,
    projectId: input.projectId,
    fallbackUsed: false,
    fallbackReason: null,
    payload: {
      source: "mock",
      totalFiles: mockFiles.length,
    },
  };

  await appendEventToDb(db, input.buildId, doneEvent, {
    completed_at: completedAt,
    files: mockFiles,
    preview_entry_path: "/",
    status: "completed",
    summary: completedMessage,
  });

  const generationTimeMs = Date.parse(completedAt) - Date.parse(input.requestedAt);

  await db.upsertBuildTelemetry({
    id: input.buildId,
    project_id: input.projectId,
    user_id: input.userId,
    prompt: input.sourcePrompt,
    template_used: input.templateId,
    palette_used: "mock",
    files_generated: mockFiles.length,
    succeeded: true,
    fallback_reason: null,
    error_log: null,
    generation_time_ms: generationTimeMs > 0 ? generationTimeMs : null,
    credits_used: 0,
    input_tokens: 0,
    output_tokens: 0,
    cost_usd: 0,
    user_iterated: input.isIteration,
    iteration_count: input.isIteration ? 1 : 0,
    model_used: "mock-anthropic",
    phase_file_diff: null,
  }).catch((error) => {
    console.error("[generate] mock build telemetry upsert failed (non-fatal):", error instanceof Error ? error.message : String(error));
  });

  await db.updateProject(input.projectId, { status: "ready" }).catch(() => undefined);
  void saveProjectVersion(
    input.projectId,
    input.sourcePrompt.slice(0, 100),
    studioFilesToVersionFiles(mockFiles),
  ).catch((error) => {
    console.error("[versions] mock auto-save failed:", error);
  });
}
