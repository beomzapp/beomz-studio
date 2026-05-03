/**
 * Engine adapter (BEO-772, audit-2026-05 Sprint 4 #1).
 *
 * Drop-in replacement for `callModelCustomise` that routes builds through
 * `packages/engine`'s `GenerationEngine` instead of the legacy single-tool-call
 * `deliver_customised_files` flow.
 *
 * Why: the engine supports a multi-turn tool-use loop (`createFile`,
 * `editFile` with unified diffs, `readFile`, `finish`) which unlocks:
 *   - Surgical iterations via `editFile` instead of full-file rewrites
 *   - Anthropic prompt caching breakpoints (Sprint 4 #3)
 *   - `Anthropic retry-with-backoff` already shipped in BEO-764 (currently dormant)
 *   - 5-10× Sonnet-input cost reduction once caching is wired
 *
 * This adapter is pure addition — it is NOT yet invoked from `runBuildPipeline`.
 * Sprint 4 #2 will add the flag-gated branch at the call-site. Until then, this
 * file is dead code that compiles cleanly.
 *
 * Limitations of the first cut (intentional, to keep scope contained):
 *   - Image-attached prompts are not supported yet (engine `BuildSystemPromptInput`
 *     takes `prompt: string`, no image block plumbing). When the user has an image,
 *     call-site falls back to the legacy path.
 *   - Phase context, palette-driven theme.ts, and design-system specs (Material/
 *     Apple HIG/etc.) baked into the legacy `contextBuilder.buildSystemPrompt`
 *     are not propagated. The engine has its own app-type brief in `systemPrompt.ts`
 *     plus the operation contract — sufficient for a first cut.
 *   - `abortSignal` is observed but the engine's internal `AnthropicStreamingModel`
 *     uses its own AbortController for the timeout. External-signal plumbing is a
 *     follow-up (would extend `AnthropicStreamingModelOptions`).
 */

import type { StudioFile } from "@beomz-studio/contracts";
import {
  initialBuildOperation,
  projectIterationOperation,
} from "@beomz-studio/operations";
import { getTemplateDefinitionSafe } from "@beomz-studio/templates";
import {
  AnthropicStreamingModel,
  GenerationEngine,
  type AnthropicUsage,
  type GenerationEngineEvent,
  type GenerationEngineResult,
  type VirtualFileEntry,
} from "@beomz-studio/engine";

import { apiConfig } from "../../config.js";
import { getProviderApiKey } from "../modelConfig.js";

export interface CallEngineCustomiseArgs {
  buildId: string;
  prompt: string;
  model: string;
  templateId: string;
  /** Final brand name for the project (echoed back into result.appName when set). */
  projectName?: string;
  /** Org id propagated for the engine's `project` input. */
  orgId: string;
  /** Project UUID — engine input expects this. */
  projectId: string;
  /** Existing files in the project (StudioFile[]). Becomes the engine's initial VFS. */
  existingFiles: readonly StudioFile[];
  /** Initial-build template files (only for fresh builds). Merged before engine starts. */
  templateFiles?: readonly StudioFile[];
  /** Selected when the upstream chat captured a design directive (silent system instruction). */
  designDirective?: string;
  /** True when this is an iteration (existing project), false for a fresh build. */
  isIteration: boolean;
  /** User-preference bag. Forwarded to the engine prompt frame. */
  userPreferences?: Record<string, unknown>;
  abortSignal?: AbortSignal;
  /** Optional max output tokens override per engine turn. */
  maxTokens?: number;
  /** Optional explicit temperature. */
  temperature?: number;
  /** Optional cap on engine turns. Defaults to engine internal (30). */
  maxTurns?: number;
}

/**
 * Subset of the legacy `CustomiseResult` shape that the engine adapter populates.
 * `runBuildPipeline` only consumes these fields, so we mirror them exactly.
 */
export interface EngineCustomiseResult {
  files: Array<{ path: string; content: string }>;
  summary: string;
  appName?: string;
  migrations?: string[];
  outputTokens: number;
  inputTokens?: number;
}

const DEFAULT_TIMEOUT_MS = 120_000;

// BEO-779: Sonnet 4.6 supports up to 64k output tokens per turn. The engine's
// streaming model defaults to 4_096, which truncates `createFile`/`editFile`
// tool calls mid-stream on any non-trivial file, leaving `needsFollowUp`
// stuck false (the parser only flips it on `content_block_stop`, which
// never arrives for a truncated tool block) and the engine then throws
// "Model ended a turn without calling finish." 16k is a conservative
// ceiling that fits any single file the model will realistically emit.
const ENGINE_MAX_TOKENS = 16_000;

function toVirtualFileEntries(
  templateFiles: readonly StudioFile[] | undefined,
  existingFiles: readonly StudioFile[],
): VirtualFileEntry[] {
  // Existing files take precedence over template files (same path → existing wins).
  // This matches the legacy `mergeFiles(templateFiles, existingFiles)` semantics.
  const merged = new Map<string, string>();
  for (const file of templateFiles ?? []) {
    merged.set(file.path, file.content);
  }
  for (const file of existingFiles) {
    merged.set(file.path, file.content);
  }

  return [...merged.entries()].map(([path, content]) => ({ path, content }));
}

function sumUsage(running: AnthropicUsage, addition: AnthropicUsage | undefined): AnthropicUsage {
  if (!addition) return running;
  return {
    input_tokens: (running.input_tokens ?? 0) + (addition.input_tokens ?? 0),
    output_tokens: (running.output_tokens ?? 0) + (addition.output_tokens ?? 0),
    cache_creation_input_tokens:
      (running.cache_creation_input_tokens ?? 0) + (addition.cache_creation_input_tokens ?? 0),
    cache_read_input_tokens:
      (running.cache_read_input_tokens ?? 0) + (addition.cache_read_input_tokens ?? 0),
  };
}

/**
 * Build (or iterate) an app via the GenerationEngine instead of the legacy
 * single-tool-call flow. Returns a `CustomiseResult`-shaped object so the
 * caller can drop this in alongside `callModelCustomise` behind a feature flag.
 *
 * Signal-handling: aborts on the supplied signal will throw `AbortError`-like
 * errors that the build pipeline already understands (see `isAbortError`).
 *
 * Errors: any engine failure (Anthropic 5xx, validation, etc.) is wrapped in
 * the engine's own `GenerationEngineError`. The build pipeline's catch-block
 * (BEO-766's `isTransientAiError`) recognizes these by `.status` / message
 * pattern when `STRICT_AI_ERROR_HANDLING="true"`.
 */
export async function callEngineCustomise(
  args: CallEngineCustomiseArgs,
): Promise<EngineCustomiseResult> {
  if (args.abortSignal?.aborted) {
    throw new DOMException("Engine call aborted before start.", "AbortError");
  }

  const apiKey = (await getProviderApiKey("anthropic")) ?? apiConfig.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("Anthropic API key not configured for engine adapter.");
  }

  const template = getTemplateDefinitionSafe(args.templateId);

  const operation = args.isIteration
    ? projectIterationOperation
    : initialBuildOperation;

  const initialFiles = toVirtualFileEntries(args.templateFiles, args.existingFiles);

  const model = new AnthropicStreamingModel({
    apiKey,
    model: args.model,
    maxTokens: args.maxTokens ?? ENGINE_MAX_TOKENS,
    temperature: args.temperature,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    // BEO-764 retry defaults apply automatically.
  });

  const engine = new GenerationEngine({
    generationId: args.buildId,
    model,
    operation,
    project: {
      id: args.projectId,
      name: args.projectName ?? "Untitled project",
      orgId: args.orgId,
      previewEntryPath: template.previewEntryPath,
      status: "building",
      templateId: template.id,
    },
    prompt: args.prompt,
    template,
    initialFiles,
    userPreferences: args.userPreferences,
    promptPolicy: undefined, // engine resolves default per-template
    maxTokens: args.maxTokens ?? ENGINE_MAX_TOKENS,
    maxTurns: args.maxTurns,
    temperature: args.temperature,
    // Disable Supabase persistence — `runBuildPipeline` already persists the
    // generation row through its existing path. We don't want double-writes.
    persistence: false,
  });

  let aggregatedUsage: AnthropicUsage = {
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
  };
  let lastResult: GenerationEngineResult | undefined;

  // Stream events from the engine. Today we discard most of them — first cut.
  // Sprint 4 #2 wires this loop to emit `appendEventToDb` status events so the
  // user sees streaming progress instead of the existing single-stage spinner.
  const iterator = engine.run();
  while (true) {
    if (args.abortSignal?.aborted) {
      throw new DOMException("Engine call aborted mid-run.", "AbortError");
    }
    const next = await iterator.next();
    if (next.done) {
      lastResult = next.value;
      break;
    }
    const event: GenerationEngineEvent = next.value;
    if (event.type === "llm_turn_completed") {
      // BEO-780: per-turn cache stats so we can measure prompt-cache
      // effectiveness in production. Mirrors legacy `[generate] cache stats:`
      // in routes/builds/generate.ts:2150. Logged BEFORE aggregation so the
      // values are per-turn deltas, not running totals.
      console.log("[engine] turn cache stats:", {
        buildId: args.buildId,
        turn: event.turn,
        stopReason: event.stopReason,
        input_tokens: event.usage?.input_tokens ?? 0,
        cache_creation_input_tokens: event.usage?.cache_creation_input_tokens ?? 0,
        cache_read_input_tokens: event.usage?.cache_read_input_tokens ?? 0,
        output_tokens: event.usage?.output_tokens ?? 0,
      });
      aggregatedUsage = sumUsage(aggregatedUsage, event.usage);
    }
    // Other event types intentionally ignored in the first cut.
    // text_delta, action_requested, action_completed, etc. become user-visible
    // SSE events in Sprint 4 #2.
  }

  if (!lastResult) {
    throw new Error("Engine completed without producing a result.");
  }

  return {
    files: lastResult.files.map((file) => ({
      path: file.path,
      content: file.content,
    })),
    summary: lastResult.summary,
    // appName is not surfaced by the engine yet — leave undefined; legacy
    // callModelCustomise sometimes returned an AI-suggested rebrand. We can
    // teach the engine's `finish` action to return it later.
    appName: undefined,
    // migrations are an iteration-pipeline concept the engine doesn't model
    // directly. The user's app source can still write `*.sql` files via
    // `createFile`, and the iteration pipeline picks them up. So we leave
    // this empty for now.
    migrations: [],
    inputTokens: aggregatedUsage.input_tokens ?? 0,
    outputTokens: aggregatedUsage.output_tokens ?? 0,
  };
}
