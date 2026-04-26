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
  } catch {
    // non-fatal
  }

  try {
    await emitStagePreamble(sourcePrompt, false, imageConfirmed);
  } catch {
    // non-fatal
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
      dbContextBlock,
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
  const finalFiles = await injectProjectDatabaseEnv(db, projectId, postProcessedFiles);
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
    } catch {
      // non-fatal
    }
  }

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
    output_tokens: outputTokens,
    cost_usd: costUsd,
    user_iterated: input.isIteration,
    iteration_count: 0,
    model_used: model,
    phase_file_diff: phaseDiff,
  }).catch(() => undefined);

  await db.updateProject(projectId, { status: "ready" }).catch(() => undefined);

  if (customised.appName && !input.phaseOverride) {
    console.log("[generate] renaming project to AI brand name:", customised.appName);
    await db.updateProject(projectId, { name: customised.appName }).catch(() => undefined);
  }

  return narrationUsage;
}
