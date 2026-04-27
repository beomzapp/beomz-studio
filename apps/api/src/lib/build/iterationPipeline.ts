import type {
  BuilderV3DoneEvent,
  BuilderV3StatusEvent,
  StudioFile,
} from "@beomz-studio/contracts";
import type { StudioDbClient } from "@beomz-studio/studio-db";

import {
  calcCreditCostHaiku,
  calcIterationCreditCost,
  isAdminEmail,
} from "../credits.js";
import { buildPersistedAiUsage, persistGenerationAiUsage } from "./tokenUsage.js";
import { maybeSendCreditsLowEmailForUser } from "../email/service.js";
import { encryptProjectSecret } from "../projectSecrets.js";
import { saveProjectVersion, studioFilesToVersionFiles } from "../projectVersions.js";
import { readStoredSupabaseToken, runSupabaseManagementQueryWithOAuth } from "../supabaseManagement.js";
import { buildSupabaseSetupSqlFromFiles } from "../supabaseSetupSql.js";
import { isAllowedMigrationStatement, runSql } from "../userDataClient.js";

type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
};

type CustomiseResult = {
  files: Array<{ path: string; content: string }>;
  summary: string;
  migrations?: string[];
  outputTokens: number;
  inputTokens?: number;
  attachedImageAssetUrl?: string;
};

type StageEvents = {
  emit: (...args: any[]) => Promise<any>;
  markPreBuildAck: () => void;
};

type IterationPipelineArgs = {
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
    isIteration: true;
    existingFiles: readonly StudioFile[];
    projectName?: string;
    imageUrl?: string;
  };
  db: StudioDbClient;
  op: "iteration";
  prompt: string;
  buildStartTime: number;
  imageConfirmed: boolean;
  imageContextBlock?: string;
  dbContextBlock: string;
  abortSignal?: AbortSignal;
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
  filterBlockedGeneratedFiles: <T extends { path: string }>(files: T[]) => T[];
  mergeFiles: (base: StudioFile[], overrides: Array<{ path: string; content: string }>) => StudioFile[];
  postProcessGeneratedFiles: (
    files: StudioFile[],
    templateId: string,
    attachedImageAssetUrl?: string,
  ) => { files: StudioFile[]; missing: string[] };
  injectProjectDatabaseEnv: (db: StudioDbClient, projectId: string, files: StudioFile[]) => Promise<StudioFile[]>;
  callModelIterate: (...args: any[]) => Promise<CustomiseResult>;
  calcSonnetCostUsd: (inputTokens: number, outputTokens: number) => number;
  calcHaikuCostUsd: (inputTokens: number, outputTokens: number) => number;
  roundUsd: (costUsd: number) => number;
  currentProject: Awaited<ReturnType<StudioDbClient["findProjectById"]>> | null;
  hasByoSupabaseConfig: boolean;
};

function remapPrebuiltPath(originalPath: string, templateId: string): string {
  const basename = originalPath.replace(/^.*\//, "");
  return `apps/web/src/app/generated/${templateId}/${basename}`;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error
    && (error.name === "AbortError" || error.message === "The operation was aborted.");
}

export async function runIterationPipeline(args: IterationPipelineArgs): Promise<TokenUsage> {
  const {
    input,
    db,
    op,
    prompt,
    buildStartTime,
    imageConfirmed,
    imageContextBlock,
    dbContextBlock,
    abortSignal,
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
    filterBlockedGeneratedFiles,
    mergeFiles,
    postProcessGeneratedFiles,
    injectProjectDatabaseEnv,
    callModelIterate,
    calcSonnetCostUsd,
    calcHaikuCostUsd,
    roundUsd,
    currentProject,
    hasByoSupabaseConfig,
  } = args;

  const narrationUsage = { ...args.narrationUsage };
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
  } = input;

  const statusEvent = (code: string, message: string, phase: string): BuilderV3StatusEvent => ({
    type: "status",
    id: nextId(),
    timestamp: ts(),
    operation: op,
    code,
    phase,
    message,
  });

  const existingFiles = filterBlockedGeneratedFiles([...input.existingFiles]);

  let iterSchemaSummary: string | undefined;
  let hasWiredSupabaseClient = false;
  let hasByoSupabaseConfigForIteration = false;
  let iterDbProvider: string | null = null;
  let iterNeonAuthBaseUrl: string | null = null;
  let iterProject: Awaited<ReturnType<typeof db.findProjectById>> | null = null;
  try {
    const { getByoSupabaseConfig, resolveProjectDbProvider } = await import("../projectDb.js");
    const { getSchemaTableList } = await import("../userDataClient.js");
    iterProject = currentProject ?? await db.findProjectById(projectId);
    hasWiredSupabaseClient = Boolean(iterProject?.db_wired);
    hasByoSupabaseConfigForIteration = Boolean(getByoSupabaseConfig(iterProject));
    const limits = iterProject?.database_enabled
      ? await db.getProjectDbLimits(projectId).catch(() => null)
      : null;
    iterDbProvider = iterProject
      ? resolveProjectDbProvider(iterProject, limits)
      : null;
    if (iterDbProvider === "neon") {
      iterNeonAuthBaseUrl =
        typeof limits?.neon_auth_base_url === "string" ? limits.neon_auth_base_url : null;
    }
    if (iterProject?.database_enabled && iterProject.db_schema) {
      const tables = await getSchemaTableList(iterProject.db_schema);
      if (tables.length > 0) {
        iterSchemaSummary = tables
          .map((table) => `Table: ${table.table_name} (${table.columns.map((col) => `${col.name} ${col.type}`).join(", ")})`)
          .join("\n");
        console.log("[generate] iteration: DB schema loaded for project", projectId, "tables:", tables.map((table) => table.table_name));
      }
    }
  } catch (schemaErr) {
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

  try {
    const ack = await generatePreBuildAck(prompt, "edit");
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
  } catch {
    // non-fatal
  }

  try {
    await emitStagePreamble(sourcePrompt, true, imageConfirmed);
  } catch {
    // non-fatal
  }
  await stageEvents.emit("enriching");

  let iterResult: CustomiseResult;
  let iterErrorReason: string | null = null;
  try {
    await stageEvents.emit("generating");
    throwIfBuildAborted();
    if (input.imageUrl) {
      console.log("[generate] iteration source image URL:", input.imageUrl);
    } else if (imageContextBlock) {
      console.warn("[generate] iteration has image context but no image URL was provided.");
    }
    iterResult = await callModelIterate(
      prompt,
      model,
      projectId,
      existingFiles,
      { buildId, isIteration: true },
      iterSchemaSummary,
      imageContextBlock,
      input.imageUrl,
      hasWiredSupabaseClient,
      iterDbProvider,
      iterNeonAuthBaseUrl,
      hasByoSupabaseConfigForIteration,
      abortSignal,
      dbContextBlock,
    );
    throwIfBuildAborted();
    console.log("[generate] iteration model returned files:", iterResult.files.map((file) => file.path));

    const existingBasenames = new Set(existingFiles.map((file) => file.path.replace(/^.*\//, "")));
    const newFileNames: string[] = [];
    const updatedFileNames: string[] = [];
    for (const file of iterResult.files) {
      const base = file.path.replace(/^.*\//, "");
      (existingBasenames.has(base) ? updatedFileNames : newFileNames).push(base);
    }

    console.log("[generate] iteration new files from AI:", newFileNames);
    console.log("[generate] iteration existing files matched:", updatedFileNames);

    await stageEvents.emit("sanitising");
    const { sanitiseFiles } = await import("../sanitise.js");
    iterResult = {
      ...iterResult,
      files: filterBlockedGeneratedFiles(sanitiseFiles(
        iterResult.files.map((file) => ({
          path: remapPrebuiltPath(file.path, templateId),
          content: file.content,
        })),
      )),
    };

    const appTsxBasename = "App.tsx";
    const appTsxReturned = updatedFileNames.includes(appTsxBasename)
      || newFileNames.includes(appTsxBasename);

    if (newFileNames.length > 0 && !appTsxReturned) {
      console.warn(
        "[generate] iteration: AI added new file(s) without updating App.tsx — new pages may not be routable until App.tsx is updated.",
        { newFileNames },
      );
    }

    console.log("[generate] iteration remapped files:", iterResult.files.map((file) => file.path));

    if (iterSchemaSummary && iterResult.migrations && iterResult.migrations.length > 0) {
      const latestProject = await db.findProjectById(projectId).catch(() => null);
      const dbSchemaName = latestProject?.db_schema ?? "";
      let migrationsApplied = 0;
      for (const statement of iterResult.migrations) {
        const sql = statement.trim();
        if (!sql) continue;
        if (!isAdminEmail(userEmail) && !isAllowedMigrationStatement(sql, dbSchemaName)) {
          console.warn("[generate] iteration: migration rejected by allowlist:", sql.slice(0, 100));
          continue;
        }
        try {
          await runSql(sql.endsWith(";") ? sql : `${sql};`);
          migrationsApplied += 1;
        } catch (migErr) {
          console.error("[generate] iteration: migration failed (non-fatal):", migErr instanceof Error ? migErr.message : String(migErr));
        }
      }
      if (migrationsApplied > 0) {
        try {
          await runSql("NOTIFY pgrst, 'reload config'; NOTIFY pgrst, 'reload schema';");
        } catch {
          // non-fatal
        }
        console.log("[generate] iteration: migrations applied:", migrationsApplied);
      }
    }
  } catch (iterErr) {
    if (isAbortError(iterErr)) {
      throw iterErr;
    }
    iterErrorReason = iterErr instanceof Error ? iterErr.message : String(iterErr);
    console.warn("[generate] iteration AI call failed.", {
      buildId,
      prompt,
      model,
      error: iterErrorReason,
    });
    iterResult = {
      files: [],
      summary: `Could not apply changes — ${iterErrorReason}`,
      outputTokens: 0,
    };
  }

  const mergedIterFiles = mergeFiles([...existingFiles], iterResult.files);
  const { files: iterPostProcessedFiles, missing: iterMissingImports } = postProcessGeneratedFiles(
    mergedIterFiles,
    templateId,
    iterResult.attachedImageAssetUrl,
  );
  const iterFinalFiles = await injectProjectDatabaseEnv(db, projectId, iterPostProcessedFiles);
  if (iterMissingImports.length > 0) {
    console.warn("[generate] WARNING: missing imports detected in iteration:", iterMissingImports);
    console.log("[generate] generating stub files for missing components...", { count: iterMissingImports.length });
  }

  const updatedCount = iterResult.files.filter((file) =>
    existingFiles.some((existingFile) => existingFile.path === file.path),
  ).length;
  const addedCount = iterResult.files.length - updatedCount;

  console.log("[generate] iteration merge result:", {
    updated: updatedCount,
    added: addedCount,
    total: iterFinalFiles.length,
  });
  const iterCompletedAt = ts();
  let iterationHistoryReply = iterResult.summary;

  throwIfBuildAborted();
  await stageEvents.emit("persisting");
  await stageEvents.emit("deploying");

  const iterInputTokens = iterResult.inputTokens ?? 0;
  const iterTokens = iterResult.outputTokens ?? 0;
  let iterCreditsUsed = 0;
  let iterCostUsd: number | null = null;

  if (iterResult.files.length > 0) {
    throwIfBuildAborted();
    try {
      const changedPaths = iterResult.files.map((file) => file.path.replace(/^.*\//, ""));
      const summaryResult = await generateBuildSummary(prompt, changedPaths);
      const nextNarrationUsage = addTokenUsage(narrationUsage, summaryResult.usage);
      narrationUsage.inputTokens = nextNarrationUsage.inputTokens;
      narrationUsage.outputTokens = nextNarrationUsage.outputTokens;
      if (iterTokens > 0 && !isAdminEmail(userEmail)) {
        const mainCost = calcIterationCreditCost(iterInputTokens, iterTokens);
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

  const iterationMigrations = Array.isArray(iterResult.migrations)
    ? iterResult.migrations.filter((statement): statement is string => typeof statement === "string" && statement.trim().length > 0)
    : [];
  const setupSql = hasByoSupabaseConfig
    ? buildSupabaseSetupSqlFromFiles(iterFinalFiles)
    : "";
  if (iterationMigrations.length > 0 || setupSql) {
    const latestGeneration = await db.findGenerationById(buildId).catch(() => null);
    const currentMetadata = typeof latestGeneration?.metadata === "object" && latestGeneration.metadata !== null
      ? latestGeneration.metadata as Record<string, unknown>
      : {};
    await db.updateGeneration(buildId, {
      metadata: {
        ...currentMetadata,
        ...(iterationMigrations.length > 0 ? { migrations: iterationMigrations } : {}),
        ...(setupSql ? { setupSql } : {}),
      },
    }).catch(() => undefined);
  }

  console.log("[generate] iteration complete.", {
    buildId,
    changedFiles: iterResult.files.length,
    added: addedCount,
    updated: updatedCount,
    total: iterFinalFiles.length,
  });

  const completedGeneration = await db.findGenerationById(buildId).catch(() => null);
  const completedMetadata = typeof completedGeneration?.metadata === "object" && completedGeneration.metadata !== null
    ? completedGeneration.metadata as Record<string, unknown>
    : {};
  const metadataMigrations = Array.isArray(completedMetadata.migrations)
    ? completedMetadata.migrations.filter((statement): statement is string => typeof statement === "string" && statement.trim().length > 0)
    : [];

  if (metadataMigrations.length > 0) {
    const projectRow = await db.findProjectById(projectId).catch(() => null);
    const byoDbUrl = typeof projectRow?.byo_db_url === "string"
      ? projectRow.byo_db_url.trim()
      : "";
    let oauthAccessToken = readStoredSupabaseToken(projectRow?.supabase_oauth_access_token);
    let oauthRefreshToken = readStoredSupabaseToken(projectRow?.supabase_oauth_refresh_token);

    if (byoDbUrl && oauthAccessToken) {
      for (const migrationSql of metadataMigrations) {
        const sql = migrationSql.trim();
        if (!sql) continue;
        console.log("[supabase] running migration:", sql.substring(0, 80));
        const migrationResult = await runSupabaseManagementQueryWithOAuth({
          projectId,
          supabaseUrl: byoDbUrl,
          accessToken: oauthAccessToken,
          refreshToken: oauthRefreshToken,
          query: sql,
          logPrefix: "[supabase]",
          persistTokens: async (tokens) => {
            try {
              await db.updateProject(projectId, {
                supabase_oauth_access_token: encryptProjectSecret(tokens.accessToken),
                supabase_oauth_refresh_token: encryptProjectSecret(tokens.refreshToken),
              });
            } catch (error) {
              console.error(
                "[supabase] failed to persist refreshed OAuth tokens (non-fatal):",
                error instanceof Error ? error.message : String(error),
              );
            }
          },
        });

        oauthAccessToken = migrationResult.accessToken;
        oauthRefreshToken = migrationResult.refreshToken;

        if (migrationResult.ok) {
          console.log("[supabase] migration applied:", sql.slice(0, 50));
        } else {
          console.error("[supabase] migration failed (non-fatal):", migrationResult.error ?? "Unknown error");
        }
      }
    }
  }

  await persistGenerationAiUsage(
    db,
    buildId,
    buildPersistedAiUsage(iterInputTokens, iterTokens),
  ).catch((error) => {
    console.error("[generate] iteration ai_usage persistence failed (non-fatal):", error instanceof Error ? error.message : String(error));
  });

  await db.upsertBuildTelemetry({
    id: buildId,
    project_id: projectId,
    user_id: userId,
    prompt: sourcePrompt,
    template_used: templateId,
    palette_used: "iteration",
    files_generated: iterFinalFiles.length,
    succeeded: iterResult.files.length > 0,
    fallback_reason: iterErrorReason,
    error_log: iterErrorReason ? { message: iterErrorReason } : null,
    generation_time_ms: Date.parse(iterCompletedAt) - Date.parse(requestedAt) || null,
    credits_used: iterCreditsUsed,
    input_tokens: iterInputTokens,
    output_tokens: iterTokens,
    cost_usd: iterCostUsd,
    user_iterated: true,
    iteration_count: 0,
    model_used: model,
  }).catch((error) => {
    console.error("[generate] iteration build telemetry upsert failed (non-fatal):", error instanceof Error ? error.message : String(error));
  });

  await db.updateProject(projectId, { status: "ready" }).catch(() => undefined);
  await maybeSendCreditsLowEmailForUser({
    db,
    orgId,
    userId,
  }).catch((error) => {
    console.error("[email] failed to send low credits email:", error);
  });
  await persistProjectChatHistory(db, projectId, sourcePrompt, iterationHistoryReply, {
    existingFiles: iterFinalFiles,
    projectName: input.projectName,
  });
  void saveProjectVersion(
    projectId,
    sourcePrompt.slice(0, 100),
    studioFilesToVersionFiles(iterFinalFiles),
  ).catch((err) => {
    console.error("[versions] auto-save failed:", err);
  });

  return narrationUsage;
}
