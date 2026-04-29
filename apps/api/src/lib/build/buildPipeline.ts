import type {
  BuilderV3DoneEvent,
  BuilderV3NextStepsEvent,
  BuilderV3PreambleEvent,
  BuilderV3StatusEvent,
  StudioFile,
} from "@beomz-studio/contracts";
import type { StudioDbClient } from "@beomz-studio/studio-db";

import { generateNextStepsWithUsage } from "../buildNarration.js";
import {
  calcCreditCost,
  calcCreditCostHaiku,
  isAdminEmail,
} from "../credits.js";
import { buildPersistedAiUsage, persistGenerationAiUsage } from "./tokenUsage.js";
import { maybeSendCreditsLowEmailForUser } from "../email/service.js";
import { saveProjectVersion, studioFilesToVersionFiles } from "../projectVersions.js";

type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
};

type Phase = {
  index: number;
  description: string;
  title: string;
  focus: string[];
};

type CustomiseResult = {
  files: Array<{ path: string; content: string }>;
  summary: string;
  appName?: string;
  migrations?: string[];
  outputTokens: number;
  inputTokens?: number;
};

type PrebuiltTemplate = {
  manifest: { id: string; name: string };
  files: Array<{ path: string; content: string }>;
};

type StageEvents = {
  emit: (...args: any[]) => Promise<any>;
  markPreBuildAck: () => void;
};

function remapPrebuiltPath(originalPath: string, templateId: string): string {
  const basename = originalPath.replace(/^.*\//, "");
  return `apps/web/src/app/generated/${templateId}/${basename}`;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error
    && (error.name === "AbortError" || error.message === "The operation was aborted.");
}

function buildRequestedDataContext(
  withDatabase?: boolean,
  withAuth?: boolean,
): string {
  const blocks: string[] = [];

  if (withDatabase) {
    blocks.push([
      "REQUESTED DATABASE CONTEXT:",
      "A Neon Postgres database is connected. VITE_DATABASE_URL is available.",
      "Use @neondatabase/serverless for ALL data operations.",
      "Design an appropriate schema with CREATE TABLE IF NOT EXISTS in App.tsx on startup.",
      "Never use mock or in-memory data.",
    ].join("\n"));
  }

  if (withAuth) {
    blocks.push([
      "REQUESTED AUTH CONTEXT:",
      "Include full user authentication: login page, signup page, JWT tokens stored in localStorage, and protected routes.",
      "Create a users table with id, email, password_hash, and created_at.",
      "Assume password hashing is handled server-side by the Beomz auth proxy; do not import bcrypt or jsonwebtoken in frontend code.",
      "Use the connected database for real auth data — never fall back to mock auth when auth is requested.",
    ].join("\n"));
  }

  return blocks.join("\n\n");
}

function generatedFilesUseNeonDatabase(files: readonly StudioFile[]): boolean {
  return files.some((file) =>
    /\.(tsx?|jsx?)$/i.test(file.path)
    && file.content.includes("@neondatabase/serverless")
    && file.content.includes("VITE_DATABASE_URL")
    && /sql`|CREATE TABLE IF NOT EXISTS/i.test(file.content),
  );
}

function isTodoTaskPrompt(prompt: string): boolean {
  return /\b(todo|task)(?:s| list| management)?\b/i.test(prompt);
}

function buildDatabaseTaskAppSource(): string {
  return [
    'import { type FormEvent, useEffect, useMemo, useState } from "react";',
    'import { neon } from "@neondatabase/serverless";',
    'import { Check, Circle, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";',
    "",
    "type TodoRow = {",
    "  id: number;",
    "  title: string;",
    "  done: boolean;",
    "  created_at: string;",
    "};",
    "",
    'const databaseUrl = import.meta.env.VITE_DATABASE_URL;',
    "",
    "if (!databaseUrl) {",
    '  throw new Error("Missing VITE_DATABASE_URL.");',
    "}",
    "",
    "const sql = neon(databaseUrl);",
    "",
    "async function ensureTasksTable(): Promise<void> {",
    "  await sql`",
    "    CREATE TABLE IF NOT EXISTS tasks (",
    "      id SERIAL PRIMARY KEY,",
    "      title TEXT NOT NULL,",
    "      done BOOLEAN DEFAULT false,",
    "      created_at TIMESTAMPTZ DEFAULT NOW()",
    "    )",
    "  `;",
    "}",
    "",
    "async function loadTasks(): Promise<TodoRow[]> {",
    "  await ensureTasksTable();",
    "  return await sql`",
    "    SELECT id, title, done, created_at",
    "    FROM tasks",
    "    ORDER BY created_at DESC, id DESC",
    "  ` as TodoRow[];",
    "}",
    "",
    "function formatError(error: unknown): string {",
    "  return error instanceof Error ? error.message : \"Something went wrong.\";",
    "}",
    "",
    "function filterButtonClass(isActive: boolean): string {",
    '  return "rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-all "',
    '    + (isActive ? "bg-indigo-600 text-white" : "text-zinc-500 hover:text-zinc-300");',
    "}",
    "",
    "function todoTextClass(done: boolean): string {",
    '  return "flex-1 text-sm " + (done ? "text-zinc-600 line-through" : "text-white");',
    "}",
    "",
    "export function App() {",
    "  const [todos, setTodos] = useState<TodoRow[]>([]);",
    '  const [text, setText] = useState("");',
    '  const [filter, setFilter] = useState<"all" | "active" | "completed">("all");',
    "  const [isLoading, setIsLoading] = useState(true);",
    "  const [isMutating, setIsMutating] = useState(false);",
    "  const [error, setError] = useState<string | null>(null);",
    "",
    "  const refreshTodos = async (showSpinner = true): Promise<void> => {",
    "    try {",
    "      if (showSpinner) {",
    "        setIsLoading(true);",
    "      }",
    "      setError(null);",
    "      const rows = await loadTasks();",
    "      setTodos(rows);",
    "    } catch (loadError) {",
    "      setError(formatError(loadError));",
    "    } finally {",
    "      if (showSpinner) {",
    "        setIsLoading(false);",
    "      }",
    "    }",
    "  };",
    "",
    "  useEffect(() => {",
    "    void refreshTodos();",
    "  }, []);",
    "",
    "  const filteredTodos = useMemo(() => {",
    '    if (filter === "active") {',
    "      return todos.filter((todo) => !todo.done);",
    "    }",
    '    if (filter === "completed") {',
    "      return todos.filter((todo) => todo.done);",
    "    }",
    "    return todos;",
    "  }, [filter, todos]);",
    "",
    "  const remainingCount = useMemo(",
    "    () => todos.filter((todo) => !todo.done).length,",
    "    [todos],",
    "  );",
    "",
    "  const createTodo = async (event: FormEvent<HTMLFormElement>): Promise<void> => {",
    "    event.preventDefault();",
    "    const title = text.trim();",
    "    if (!title) {",
    "      return;",
    "    }",
    "",
    "    try {",
    "      setIsMutating(true);",
    "      setError(null);",
    "      await ensureTasksTable();",
    "      await sql`INSERT INTO tasks (title, done) VALUES (${title}, false)`;",
    '      setText("");',
    "      await refreshTodos(false);",
    "    } catch (createError) {",
    "      setError(formatError(createError));",
    "    } finally {",
    "      setIsMutating(false);",
    "    }",
    "  };",
    "",
    "  const toggleTodo = async (todo: TodoRow): Promise<void> => {",
    "    try {",
    "      setIsMutating(true);",
    "      setError(null);",
    "      await sql`UPDATE tasks SET done = ${!todo.done} WHERE id = ${todo.id}`;",
    "      await refreshTodos(false);",
    "    } catch (toggleError) {",
    "      setError(formatError(toggleError));",
    "    } finally {",
    "      setIsMutating(false);",
    "    }",
    "  };",
    "",
    "  const deleteTodo = async (id: number): Promise<void> => {",
    "    try {",
    "      setIsMutating(true);",
    "      setError(null);",
    "      await sql`DELETE FROM tasks WHERE id = ${id}`;",
    "      await refreshTodos(false);",
    "    } catch (deleteError) {",
    "      setError(formatError(deleteError));",
    "    } finally {",
    "      setIsMutating(false);",
    "    }",
    "  };",
    "",
    "  return (",
    '    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">',
    '      <div className="w-full max-w-md">',
    '        <div className="rounded-3xl bg-zinc-900 p-6 shadow-2xl border border-white/5">',
    '          <div className="mb-5 flex items-center justify-between gap-3">',
    '            <div>',
    '              <h1 className="text-xl font-semibold text-white">Todo List</h1>',
    '              <p className="mt-1 text-sm text-zinc-500">Persisted with Neon Postgres.</p>',
    '            </div>',
    '            <button',
    '              type="button"',
    '              onClick={() => { void refreshTodos(); }}',
    '              className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 text-zinc-300 transition-all hover:border-white/20 hover:text-white"',
    '              aria-label="Refresh tasks"',
    "            >",
    '              <RefreshCw size={16} className={isLoading ? "animate-spin" : ""} />',
    "            </button>",
    "          </div>",
    "",
    '          <form onSubmit={(event) => { void createTodo(event); }} className="mb-5 flex gap-2">',
    '            <input',
    '              type="text"',
    "              value={text}",
    '              onChange={(event) => setText(event.target.value)}',
    '              placeholder="What needs to be done?"',
    "              disabled={isMutating}",
    '              className="flex-1 rounded-xl bg-zinc-800 border border-white/5 px-4 py-2.5 text-white placeholder-zinc-600 outline-none focus:border-indigo-500/40 text-sm disabled:opacity-60"',
    "            />",
    '            <button',
    '              type="submit"',
    "              disabled={isMutating || text.trim().length === 0}",
    '              className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white transition-all hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"',
    "            >",
    "              {isMutating ? <Loader2 size={18} className=\"animate-spin\" /> : <Plus size={18} />}",
    "            </button>",
    "          </form>",
    "",
    "          {error ? (",
    '            <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">',
    "              {error}",
    "            </div>",
    "          ) : null}",
    "",
    '          <div className="mb-4 flex gap-1">',
    '            {(["all", "active", "completed"] as const).map((value) => (',
    '              <button',
    "                key={value}",
    '                type="button"',
    "                onClick={() => setFilter(value)}",
    "                className={filterButtonClass(filter === value)}",
    "              >",
    "                {value}",
    "              </button>",
    "            ))}",
    "          </div>",
    "",
    '          <div className="mb-4 max-h-80 space-y-1.5 overflow-y-auto">',
    "            {isLoading ? (",
    '              <div className="flex items-center justify-center py-8 text-sm text-zinc-500">',
    '                <Loader2 size={16} className="mr-2 animate-spin" />',
    "                Loading tasks...",
    "              </div>",
    "            ) : null}",
    "",
    "            {!isLoading && filteredTodos.length === 0 ? (",
    '              <p className="py-6 text-center text-sm text-zinc-600">',
    '                {filter === "all" ? "Add your first task above" : "No matching tasks yet"}',
    "              </p>",
    "            ) : null}",
    "",
    "            {filteredTodos.map((todo) => (",
    '              <div',
    "                key={todo.id}",
    '                className="group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-zinc-800/60"',
    "              >",
    '                <button type="button" onClick={() => { void toggleTodo(todo); }} className="flex-shrink-0">',
    "                  {todo.done",
    '                    ? <Check size={18} className="text-indigo-400" />',
    '                    : <Circle size={18} className="text-zinc-600" />}',
    "                </button>",
    '                <span className={todoTextClass(todo.done)}>{todo.title}</span>',
    '                <button',
    '                  type="button"',
    "                  onClick={() => { void deleteTodo(todo.id); }}",
    '                  className="flex-shrink-0 text-zinc-700 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"',
    "                >",
    "                  <Trash2 size={15} />",
    "                </button>",
    "              </div>",
    "            ))}",
    "          </div>",
    "",
    '          <div className="flex items-center justify-between text-xs text-zinc-600">',
    '            <span>{remainingCount} remaining</span>',
    '            <span>{todos.length} total</span>',
    "          </div>",
    "        </div>",
    "      </div>",
    "    </div>",
    "  );",
    "}",
    "",
  ].join("\n");
}

export function ensureRequestedDatabaseApp(args: {
  files: StudioFile[];
  prompt: string;
  sourcePrompt: string;
  templateId: string;
  withDatabase?: boolean;
  withAuth?: boolean;
}): { files: StudioFile[]; appliedFallback: boolean } {
  const requiresDatabaseApp = args.withDatabase === true || args.withAuth === true;
  if (!requiresDatabaseApp || generatedFilesUseNeonDatabase(args.files)) {
    return { files: args.files, appliedFallback: false };
  }

  const appPath = remapPrebuiltPath("App.tsx", args.templateId);
  const promptText = `${args.prompt}\n${args.sourcePrompt}`;
  const shouldApplyTaskFallback = args.templateId === "workspace-task" || isTodoTaskPrompt(promptText);
  if (!shouldApplyTaskFallback) {
    return { files: args.files, appliedFallback: false };
  }

  const replacementContent = buildDatabaseTaskAppSource();
  let didReplace = false;
  const nextFiles = args.files.map((file) => {
    if (file.path !== appPath) {
      return file;
    }

    didReplace = true;
    return {
      ...file,
      content: replacementContent,
      source: "platform" as const,
    };
  });

  if (didReplace) {
    return { files: nextFiles, appliedFallback: true };
  }

  return {
    files: [
      ...args.files,
      {
        path: appPath,
        kind: "route",
        language: "tsx",
        content: replacementContent,
        source: "platform",
        locked: false,
      },
    ],
    appliedFallback: true,
  };
}

type BuildPipelineArgs = {
  input: {
    buildId: string;
    projectId: string;
    orgId: string;
    userId: string | null;
    userEmail: string | null;
    sourcePrompt: string;
    templateId: string;
    model: string;
    requestedAt: string;
    isIteration: boolean;
    existingFiles: readonly StudioFile[];
    projectName?: string;
    phaseOverride?: unknown;
    forcedSimple?: boolean;
    imageUrl?: string;
    withDatabase?: boolean;
    withAuth?: boolean;
  };
  db: StudioDbClient;
  op: "initial_build";
  prompt: string;
  workingPrompt: string;
  buildStartTime: number;
  templateFiles: StudioFile[];
  prebuilt: PrebuiltTemplate;
  paletteId: string;
  imageConfirmed: boolean;
  imageContextBlock?: string;
  hasByoSupabaseConfig: boolean;
  dbContextBlock: string;
  activePhasesData: Phase[] | null;
  activeCurrentPhase: number;
  activePhasesTotal: number;
  abortSignal?: AbortSignal;
  detectedIntent: string;
  narrationUsage: TokenUsage;
  stageEvents: StageEvents;
  nextId: () => string;
  ts: () => string;
  throwIfBuildAborted: () => void;
  appendEventToDb: (...args: any[]) => Promise<void>;
  appendSessionEventToDb: (...args: any[]) => Promise<void>;
  persistProjectChatHistory: (...args: any[]) => Promise<void>;
  emitBuildConfirmed: (...args: any[]) => Promise<void>;
  generatePreBuildAck: (...args: any[]) => Promise<{ message: string; usage: TokenUsage }>;
  generateBuildSummary: (...args: any[]) => Promise<{ message: string; usage: TokenUsage }>;
  emitStagePreamble: (...args: any[]) => Promise<void>;
  addTokenUsage: (total: TokenUsage, usage: TokenUsage) => TokenUsage;
  callModelCustomise: (...args: any[]) => Promise<CustomiseResult>;
  mergeFiles: (base: StudioFile[], overrides: Array<{ path: string; content: string }>) => StudioFile[];
  postProcessGeneratedFiles: (
    files: StudioFile[],
    templateId: string,
    attachedImageAssetUrl?: string,
  ) => { files: StudioFile[]; missing: string[] };
  injectProjectDatabaseEnv: (db: StudioDbClient, projectId: string, files: StudioFile[]) => Promise<StudioFile[]>;
  calcSonnetCostUsd: (inputTokens: number, outputTokens: number) => number;
  calcHaikuCostUsd: (inputTokens: number, outputTokens: number) => number;
  roundUsd: (costUsd: number) => number;
};

export async function runBuildPipeline(args: BuildPipelineArgs): Promise<TokenUsage> {
  const {
    input,
    db,
    op,
    prompt,
    workingPrompt,
    buildStartTime,
    templateFiles,
    prebuilt,
    paletteId,
    imageConfirmed,
    imageContextBlock,
    hasByoSupabaseConfig,
    dbContextBlock,
    activePhasesData,
    activeCurrentPhase,
    activePhasesTotal,
    abortSignal,
    detectedIntent,
    stageEvents,
    nextId,
    ts,
    throwIfBuildAborted,
    appendEventToDb,
    appendSessionEventToDb,
    persistProjectChatHistory,
    emitBuildConfirmed,
    generatePreBuildAck,
    generateBuildSummary,
    emitStagePreamble,
    addTokenUsage,
    callModelCustomise,
    mergeFiles,
    postProcessGeneratedFiles,
    injectProjectDatabaseEnv,
    calcSonnetCostUsd,
    calcHaikuCostUsd,
    roundUsd,
  } = args;

  const {
    buildId,
    projectId,
    orgId,
    userId,
    userEmail,
    sourcePrompt,
    templateId,
    model,
    requestedAt,
    existingFiles,
  } = input;

  const narrationUsage = { ...args.narrationUsage };
  const statusEvent = (code: string, message: string, phase: string): BuilderV3StatusEvent => ({
    type: "status",
    id: nextId(),
    timestamp: ts(),
    operation: op,
    code,
    phase,
    message,
  });

  console.log("[build/state]", { buildId, from: "queued", to: "running" });
  await appendEventToDb(
    db, buildId,
    statusEvent("template_loading", "Loading template…", "loading"),
    { status: "running" },
  );

  if (activePhasesData && activeCurrentPhase === 1 && !input.phaseOverride) {
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

  await appendEventToDb(
    db, buildId,
    statusEvent("ai_customising", "Customising with AI…", "customising"),
  );

  try {
    const ackIntent = detectedIntent === "edit" ? "edit" : "build";
    const ack = await generatePreBuildAck(prompt, ackIntent);
    const nextNarrationUsage = addTokenUsage(narrationUsage, ack.usage);
    narrationUsage.inputTokens = nextNarrationUsage.inputTokens;
    narrationUsage.outputTokens = nextNarrationUsage.outputTokens;
    await emitBuildConfirmed(db, buildId, nextId, op, ack.message, projectId);
    await appendEventToDb(db, buildId, {
      type: "pre_build_ack",
      id: nextId(),
      timestamp: ts(),
      operation: op,
      message: ack.message,
    } as unknown as BuilderV3StatusEvent);
    stageEvents.markPreBuildAck();
    await appendSessionEventToDb(db, buildId, { type: "user", content: sourcePrompt });
    await appendSessionEventToDb(db, buildId, { type: "pre_build_ack", content: ack.message });
  } catch (ackErr) {
    console.warn("[build/warn] pre_build_ack failed (non-fatal):", ackErr instanceof Error ? ackErr.message : String(ackErr));
  }

  try {
    await emitStagePreamble(sourcePrompt, false, imageConfirmed);
  } catch (preambleErr) {
    console.warn("[build/warn] stage preamble failed (non-fatal):", preambleErr instanceof Error ? preambleErr.message : String(preambleErr));
  }

  await stageEvents.emit("classifying");
  await stageEvents.emit("enriching");

  let customised: CustomiseResult;
  let fallbackUsed = false;

  const { buildPhaseContextBlock } = await import("./contextBuilder.js");

  const phaseContextBlock = activePhasesData
    ? buildPhaseContextBlock(
        activeCurrentPhase,
        activePhasesTotal,
        activePhasesData,
        existingFiles.map((file) => file.path.replace(/^.*\//, "")),
      )
    : undefined;

  const activePhaseData = activePhasesData?.find((phase) => phase.index === activeCurrentPhase);
  const requestedDataContextBlock = buildRequestedDataContext(
    input.withDatabase,
    input.withAuth,
  );
  const modelDbContextBlock = [dbContextBlock, requestedDataContextBlock]
    .filter((block) => typeof block === "string" && block.trim().length > 0)
    .join("\n\n");
  const phaseScope = activePhaseData
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
    throwIfBuildAborted();
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
      hasByoSupabaseConfig,
      modelDbContextBlock,
      abortSignal,
    );
    throwIfBuildAborted();
    console.log("[generate] Model returned files:", customised.files.map((file) => file.path));
    if (customised.files.length === 0) {
      throw new Error(`Model returned 0 files (stop_reason likely max_tokens or empty tool response; outputTokens: ${customised.outputTokens ?? 0})`);
    }
    await stageEvents.emit("sanitising");
    const { sanitiseFiles } = await import("../sanitise.js");
    customised = {
      ...customised,
      files: sanitiseFiles(
        customised.files.map((file) => ({
          path: remapPrebuiltPath(file.path, templateId),
          content: file.content,
        })),
      ),
    };
    console.log("[generate] Remapped files:", customised.files.map((file) => file.path));
  } catch (aiError) {
    if (isAbortError(aiError)) {
      throw aiError;
    }
    console.error("[generate] AI call failed — using scaffold fallback.", {
      buildId,
      model,
      error: aiError instanceof Error ? aiError.message : String(aiError),
      stack: aiError instanceof Error ? aiError.stack?.split("\n").slice(0, 5).join(" | ") : undefined,
    });
    await stageEvents.emit("sanitising");
    const { sanitiseFiles } = await import("../sanitise.js");
    customised = {
      files: sanitiseFiles(
        prebuilt.files.map((file) => ({
          path: remapPrebuiltPath(file.path, templateId),
          content: file.content,
        })),
      ),
      summary: `${prebuilt.manifest.name} — ${prompt}`,
      outputTokens: 0,
    };
    fallbackUsed = true;
  }

  const mergedFiles = mergeFiles(
    mergeFiles(templateFiles, [...existingFiles]),
    customised.files,
  );
  const { files: postProcessedFiles, missing: missingImports } = postProcessGeneratedFiles(
    mergedFiles,
    templateId,
  );
  const databaseEnforced = ensureRequestedDatabaseApp({
    files: postProcessedFiles,
    prompt,
    sourcePrompt,
    templateId,
    withDatabase: input.withDatabase,
    withAuth: input.withAuth,
  });
  if (databaseEnforced.appliedFallback) {
    console.warn("[generate] requested database build returned no Neon usage; applied task database scaffold fallback.", {
      buildId,
      projectId,
      templateId,
    });
  } else if ((input.withDatabase === true || input.withAuth === true) && !generatedFilesUseNeonDatabase(postProcessedFiles)) {
    console.warn("[generate] requested database build still has no detectable Neon usage after model output.", {
      buildId,
      projectId,
      templateId,
    });
  }
  const finalFiles = await injectProjectDatabaseEnv(db, projectId, databaseEnforced.files);
  if (missingImports.length > 0) {
    console.warn("[generate] WARNING: missing imports detected:", missingImports);
    console.log("[generate] generating stub files for missing components...", { count: missingImports.length });
  }
  const completedAt = ts();

  let phaseDiff: { created: string[]; modified: string[]; unchangedCount: number } | null = null;
  if (phaseScope && !fallbackUsed) {
    const prevPathSet = new Set(existingFiles.map((file) => file.path));
    const generatedPaths = customised.files.map((file) => file.path);
    const created = generatedPaths.filter((path) => !prevPathSet.has(path));
    const modified = generatedPaths.filter((path) => prevPathSet.has(path));
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

  throwIfBuildAborted();
  await stageEvents.emit("persisting");
  await stageEvents.emit("deploying");

  const inputTokens = customised.inputTokens ?? 0;
  const outputTokens = customised.outputTokens ?? 0;
  let creditsUsed = 0;
  let costUsd: number | null = null;
  let buildHistoryReply = customised.summary;

  if (!fallbackUsed) {
    throwIfBuildAborted();
    try {
      const changedPaths = customised.files.map((file) => file.path.replace(/^.*\//, ""));
      const summaryResult = await generateBuildSummary(prompt, changedPaths);
      buildHistoryReply = summaryResult.message;
      const nextNarrationUsage = addTokenUsage(narrationUsage, summaryResult.usage);
      narrationUsage.inputTokens = nextNarrationUsage.inputTokens;
      narrationUsage.outputTokens = nextNarrationUsage.outputTokens;
      const nextSteps = await generateNextStepsWithUsage({
        appDescriptor: workingPrompt,
        fileList: finalFiles
          .map((file) => file.path.replace(/^.*\//, ""))
          .filter((path) => path !== "app.manifest.json"),
        isIteration: input.isIteration,
        prompt: sourcePrompt,
      });
      const nextNarrationUsageWithSteps = addTokenUsage(narrationUsage, nextSteps.usage);
      narrationUsage.inputTokens = nextNarrationUsageWithSteps.inputTokens;
      narrationUsage.outputTokens = nextNarrationUsageWithSteps.outputTokens;
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
    } catch (summaryErr) {
      console.warn("[build/warn] build summary/next-steps failed (non-fatal):", summaryErr instanceof Error ? summaryErr.message : String(summaryErr));
    }
  }

  console.log("[build/state]", { buildId, from: "running", to: "completed" });
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

  await persistGenerationAiUsage(
    db,
    buildId,
    buildPersistedAiUsage(inputTokens, outputTokens),
  ).catch((error) => {
    console.error("[generate] generation ai_usage persistence failed (non-fatal):", error instanceof Error ? error.message : String(error));
  });

  console.log("[generate] Build complete.", {
    buildId,
    filesCount: finalFiles.length,
    fallbackUsed,
  });

  await persistProjectChatHistory(db, projectId, sourcePrompt, buildHistoryReply, {
    existingFiles: finalFiles,
    projectName: input.projectName,
  });
  void saveProjectVersion(
    projectId,
    sourcePrompt.slice(0, 100),
    studioFilesToVersionFiles(finalFiles),
  ).catch((err) => {
    console.error("[versions] auto-save failed:", err);
  });

  const generationMs = Date.parse(completedAt) - Date.parse(requestedAt);

  await db.upsertBuildTelemetry({
    id: buildId,
    project_id: projectId,
    user_id: userId,
    prompt: sourcePrompt,
    template_used: prebuilt.manifest.id,
    palette_used: paletteId,
    files_generated: finalFiles.length,
    succeeded: !fallbackUsed,
    fallback_reason: fallbackUsed ? "anthropic_error" : null,
    error_log: null,
    generation_time_ms: generationMs > 0 ? generationMs : null,
    credits_used: creditsUsed,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cost_usd: costUsd,
    user_iterated: input.isIteration,
    iteration_count: 0,
    model_used: model,
    phase_file_diff: phaseDiff,
  }).catch((error) => {
    console.error("[generate] build telemetry upsert failed (non-fatal):", error instanceof Error ? error.message : String(error));
  });

  await db.updateProject(projectId, { status: "ready" }).catch(() => undefined);
  await maybeSendCreditsLowEmailForUser({
    db,
    orgId,
    userId,
  }).catch((error) => {
    console.error("[email] failed to send low credits email:", error);
  });

  if (customised.appName && !input.phaseOverride) {
    console.log("[generate] renaming project to AI brand name:", customised.appName);
    await db.updateProject(projectId, { name: customised.appName }).catch(() => undefined);
  }

  return narrationUsage;
}
