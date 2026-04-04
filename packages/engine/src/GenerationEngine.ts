import {
  type OperationActor,
  type OperationContract,
  type Project,
  type StudioFile,
  type TemplateDefinition,
} from "@beomz-studio/contracts";
import type { StudioDbClient } from "@beomz-studio/studio-db";
import { getTemplateDefinition } from "@beomz-studio/templates";
import { FailureReason } from "@beomz-studio/validators";
import { minimatch } from "minimatch";

import {
  CORE_ACTIONS,
  getCoreActionToolDefinitions,
  type ActionCall,
  type ActionDefinition,
  type ActionExecutionContext,
  type ActionResultEnvelope,
  type CommandRunner,
  type FinishActionOutput,
  EngineActionError,
  toActionError,
} from "./actions/index.js";
import {
  buildSystemPromptFrame,
  type AnthropicSystemTextBlock,
  type SystemPromptFrame,
} from "./systemPrompt.js";
import {
  normalizeVirtualPath,
  type VirtualFileDiffEntry,
  type VirtualFileEntry,
  type VirtualFileSystemSnapshot,
  VirtualFileSystem,
} from "./VirtualFileSystem.js";

export interface AnthropicTextBlock {
  type: "text";
  text: string;
}

export interface AnthropicToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: unknown;
}

export interface AnthropicToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export type AnthropicMessageContentBlock =
  | AnthropicTextBlock
  | AnthropicToolUseBlock
  | AnthropicToolResultBlock;

export interface AnthropicConversationMessage {
  role: "user" | "assistant";
  content: AnthropicMessageContentBlock[];
}

export interface AnthropicToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface AnthropicUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

export interface StreamingModelRequest {
  system: readonly AnthropicSystemTextBlock[];
  messages: readonly AnthropicConversationMessage[];
  tools: readonly AnthropicToolDefinition[];
  maxTokens?: number;
  temperature?: number;
}

export type ModelStreamEvent =
  | {
      type: "message_start";
    }
  | {
      type: "text_delta";
      index: number;
      text: string;
    }
  | {
      type: "tool_use";
      id: string;
      index: number;
      input: unknown;
      name: string;
      rawInputJson: string;
    }
  | {
      type: "message_delta";
      stopReason?: string | null;
      usage?: AnthropicUsage;
    }
  | {
      type: "ping";
    };

export interface StreamingModelTurnResult {
  assistantMessage: AnthropicConversationMessage;
  stopReason?: string | null;
  usage?: AnthropicUsage;
}

export interface StreamingModel {
  stream(
    request: StreamingModelRequest,
  ): AsyncGenerator<ModelStreamEvent, StreamingModelTurnResult>;
}

export interface AnthropicStreamingModelOptions {
  apiKey: string;
  baseUrl?: string;
  headers?: Record<string, string>;
  maxTokens?: number;
  model: string;
  temperature?: number;
  timeoutMs?: number;
}

export interface GenerationTurnPersistenceInput {
  generationId: string;
  turn: number;
  summary: string;
  done: boolean;
  snapshot: VirtualFileSystemSnapshot;
  files: readonly StudioFile[];
  assistantMessage: AnthropicConversationMessage;
  actionResults: readonly ActionResultEnvelope[];
  finalResult?: FinishActionOutput;
}

export interface GenerationTurnFailureInput {
  generationId: string;
  turn: number;
  reason: FailureReason;
  error: string;
  snapshot: VirtualFileSystemSnapshot;
  files: readonly StudioFile[];
}

export interface GenerationTurnPersistence {
  saveTurn(input: GenerationTurnPersistenceInput): Promise<void>;
  saveFailure?(input: GenerationTurnFailureInput): Promise<void>;
}

export interface GenerationEngineOptions {
  actor?: OperationActor;
  actions?: readonly ActionDefinition[];
  commandRunner?: CommandRunner;
  existingMessages?: readonly AnthropicConversationMessage[];
  generationId: string;
  initialFiles?: readonly VirtualFileEntry[];
  maxTokens?: number;
  maxTurns?: number;
  model: StreamingModel;
  operation: OperationContract;
  persistence?: GenerationTurnPersistence | false;
  project: Pick<
    Project,
    "id" | "name" | "orgId" | "previewEntryPath" | "status" | "templateId"
  >;
  prompt: string;
  temperature?: number;
  template?: TemplateDefinition;
  userPreferences?: Record<string, unknown>;
  vfs?: VirtualFileSystem;
}

export interface GenerationEngineResult {
  summary: string;
  deferredItems: string[];
  files: readonly StudioFile[];
  outputPaths: readonly string[];
  snapshot: VirtualFileSystemSnapshot;
  turns: number;
  messages: readonly AnthropicConversationMessage[];
}

export type GenerationEngineEvent =
  | {
      type: "llm_turn_started";
      turn: number;
      promptFrame: SystemPromptFrame;
    }
  | {
      type: "text_delta";
      turn: number;
      text: string;
    }
  | {
      type: "action_requested";
      turn: number;
      actionCallId: string;
      actionName: string;
      input: unknown;
    }
  | {
      type: "action_completed";
      turn: number;
      actionCallId: string;
      actionName: string;
      summary: string;
      output: unknown;
      changedPaths: readonly string[];
    }
  | {
      type: "action_failed";
      turn: number;
      actionCallId: string;
      actionName: string;
      reason: FailureReason;
      error: string;
    }
  | {
      type: "llm_turn_completed";
      turn: number;
      stopReason?: string | null;
      assistantMessage: AnthropicConversationMessage;
      usage?: AnthropicUsage;
    }
  | {
      type: "snapshot_saved";
      turn: number;
      generationId: string;
      snapshot: VirtualFileSystemSnapshot;
    }
  | {
      type: "generation_completed";
      result: GenerationEngineResult;
    }
  | {
      type: "generation_failed";
      turn: number;
      reason: FailureReason;
      error: string;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function matchesAnyGlob(filePath: string, globs: readonly string[]): boolean {
  return globs.some((glob) => minimatch(filePath, glob, { dot: true }));
}

function buildAssistantText(message: AnthropicConversationMessage): string {
  return message.content
    .filter((block): block is AnthropicTextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");
}

function buildToolResultPayload(result: ActionResultEnvelope): string {
  if (result.success) {
    return JSON.stringify(
      {
        changedPaths: result.changedPaths,
        ok: true,
        output: result.output,
        summary: result.summary,
      },
      null,
      2,
    );
  }

  return JSON.stringify(
    {
      error: result.output,
      ok: false,
      reason: result.reason,
      summary: result.summary,
    },
    null,
    2,
  );
}

function buildToolResultBlock(result: ActionResultEnvelope): AnthropicToolResultBlock {
  return {
    content: buildToolResultPayload(result),
    is_error: !result.success,
    tool_use_id: result.actionCallId,
    type: "tool_result",
  };
}

function toOutputPaths(files: readonly StudioFile[]): string[] {
  return files.map((file) => file.path);
}

function buildUserTextMessage(text: string): AnthropicConversationMessage {
  return {
    content: [
      {
        text,
        type: "text",
      },
    ],
    role: "user",
  };
}

export class GenerationEngineError extends Error {
  readonly reason: FailureReason;

  constructor(reason: FailureReason, message: string) {
    super(message);
    this.name = "GenerationEngineError";
    this.reason = reason;
  }
}

function toGenerationEngineError(
  error: unknown,
  fallbackReason = FailureReason.INVALID_OUTPUT,
): GenerationEngineError {
  if (error instanceof GenerationEngineError) {
    return error;
  }

  if (error instanceof EngineActionError) {
    return new GenerationEngineError(error.reason, error.message);
  }

  const message = error instanceof Error ? error.message : "Unknown generation engine error.";
  return new GenerationEngineError(fallbackReason, message);
}

type TrackedActionStatus = "queued" | "executing" | "completed" | "yielded";

interface TrackedAction {
  call: ActionCall;
  definition?: ActionDefinition;
  promise?: Promise<void>;
  result?: ActionResultEnvelope;
  status: TrackedActionStatus;
}

class ActionExecutor {
  private readonly trackedActions: TrackedAction[] = [];
  private finishResult?: FinishActionOutput;
  private readonly actionsByName = new Map<string, ActionDefinition>();

  constructor(
    actions: readonly ActionDefinition[],
    private readonly context: ActionExecutionContext,
  ) {
    for (const action of actions) {
      this.actionsByName.set(action.name, action);
    }
  }

  enqueue(call: ActionCall): void {
    const definition = this.actionsByName.get(call.name);

    if (!definition) {
      this.trackedActions.push({
        call,
        result: {
          actionCallId: call.id,
          actionName: call.name,
          changedPaths: [],
          input: call.input,
          output: {
            message: `Unknown action requested: ${call.name}.`,
          },
          reason: FailureReason.INVALID_OUTPUT,
          success: false,
          summary: `Unknown action requested: ${call.name}.`,
        },
        status: "completed",
      });
      return;
    }

    this.trackedActions.push({
      call,
      definition,
      status: "queued",
    });

    void this.processQueue();
  }

  getFinishResult(): FinishActionOutput | undefined {
    return this.finishResult;
  }

  drainCompleted(): ActionResultEnvelope[] {
    const results: ActionResultEnvelope[] = [];

    for (const trackedAction of this.trackedActions) {
      if (trackedAction.status === "yielded") {
        continue;
      }

      if (trackedAction.status === "completed" && trackedAction.result) {
        trackedAction.status = "yielded";
        results.push(trackedAction.result);
        continue;
      }

      if (
        trackedAction.status === "executing"
        && trackedAction.definition?.concurrency === "exclusive"
      ) {
        break;
      }
    }

    return results;
  }

  async drainRemaining(): Promise<ActionResultEnvelope[]> {
    const results: ActionResultEnvelope[] = [];

    while (this.hasUnfinishedActions()) {
      await this.processQueue();

      const completed = this.drainCompleted();
      if (completed.length > 0) {
        results.push(...completed);
      }

      if (!this.hasUnfinishedActions()) {
        break;
      }

      const executingPromises = this.trackedActions
        .filter((trackedAction) => trackedAction.status === "executing" && trackedAction.promise)
        .map((trackedAction) => trackedAction.promise as Promise<void>);

      if (executingPromises.length === 0) {
        break;
      }

      await Promise.race(executingPromises);
    }

    const tailResults = this.drainCompleted();
    if (tailResults.length > 0) {
      results.push(...tailResults);
    }

    return results;
  }

  private hasUnfinishedActions(): boolean {
    return this.trackedActions.some((trackedAction) => trackedAction.status !== "yielded");
  }

  private canExecute(definition: ActionDefinition): boolean {
    const executingActions = this.trackedActions.filter(
      (trackedAction) => trackedAction.status === "executing",
    );

    return (
      executingActions.length === 0
      || (
        definition.concurrency === "read"
        && executingActions.every(
          (trackedAction) => trackedAction.definition?.concurrency === "read",
        )
      )
    );
  }

  private async processQueue(): Promise<void> {
    for (const trackedAction of this.trackedActions) {
      if (trackedAction.status !== "queued" || !trackedAction.definition) {
        continue;
      }

      if (!this.canExecute(trackedAction.definition)) {
        if (trackedAction.definition.concurrency === "exclusive") {
          break;
        }

        continue;
      }

      this.executeTrackedAction(trackedAction);
    }
  }

  private executeTrackedAction(trackedAction: TrackedAction): void {
    const definition = trackedAction.definition;
    if (!definition) {
      return;
    }

    trackedAction.status = "executing";

    const execution = (async () => {
      const parsedInput = definition.schema.safeParse(trackedAction.call.input);

      if (!parsedInput?.success) {
        const actionError = toActionError(parsedInput?.error, FailureReason.INVALID_OUTPUT);
        trackedAction.result = {
          actionCallId: trackedAction.call.id,
          actionName: trackedAction.call.name,
          changedPaths: [],
          input: trackedAction.call.input,
          output: {
            message: actionError.message,
          },
          reason: actionError.reason,
          success: false,
          summary: `Action ${trackedAction.call.name} failed validation.`,
        };
        trackedAction.status = "completed";
        return;
      }

      try {
        const outcome = await definition.execute(parsedInput.data, this.context);
        trackedAction.result = {
          actionCallId: trackedAction.call.id,
          actionName: trackedAction.call.name,
          changedPaths: outcome.changedPaths ?? [],
          finish: outcome.finish,
          input: trackedAction.call.input,
          output: outcome.output,
          success: true,
          summary: outcome.summary,
          undoData: outcome.undoData,
        };

        if (outcome.finish) {
          this.finishResult = outcome.finish;
        }
      } catch (error) {
        const actionError = toActionError(error, FailureReason.INVALID_OUTPUT);
        trackedAction.result = {
          actionCallId: trackedAction.call.id,
          actionName: trackedAction.call.name,
          changedPaths: [],
          input: trackedAction.call.input,
          output: {
            message: actionError.message,
          },
          reason: actionError.reason,
          success: false,
          summary: `Action ${trackedAction.call.name} failed.`,
        };
      } finally {
        trackedAction.status = "completed";
      }
    })();

    trackedAction.promise = execution.finally(() => {
      void this.processQueue();
    });
  }
}

export class AnthropicStreamingModel implements StreamingModel {
  constructor(private readonly options: AnthropicStreamingModelOptions) {}

  async *stream(
    request: StreamingModelRequest,
  ): AsyncGenerator<ModelStreamEvent, StreamingModelTurnResult> {
    const controller = new AbortController();
    const timeoutMs = this.options.timeoutMs ?? 120_000;
    const timeoutHandle = setTimeout(() => {
      controller.abort("timeout");
    }, timeoutMs);

    try {
      const response = await fetch(
        `${(this.options.baseUrl ?? "https://api.anthropic.com").replace(/\/$/, "")}/v1/messages`,
        {
          body: JSON.stringify({
            max_tokens: request.maxTokens ?? this.options.maxTokens ?? 4_096,
            messages: request.messages,
            model: this.options.model,
            stream: true,
            system: request.system,
            temperature: request.temperature ?? this.options.temperature,
            tools: request.tools,
          }),
          headers: {
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
            "x-api-key": this.options.apiKey,
            ...this.options.headers,
          },
          method: "POST",
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        const errorBody = await response.text();
        throw new GenerationEngineError(
          FailureReason.ANTHROPIC_ERROR,
          `Anthropic returned ${response.status}: ${errorBody}`,
        );
      }

      if (!response.body) {
        throw new GenerationEngineError(
          FailureReason.ANTHROPIC_ERROR,
          "Anthropic response body was empty.",
        );
      }

      const decoder = new TextDecoder();
      const reader = response.body.getReader();
      let buffer = "";
      let stopReason: string | null | undefined;
      let usage: AnthropicUsage | undefined;

      const textBlocks = new Map<number, string>();
      const toolBlocks = new Map<
        number,
        {
          id: string;
          input: unknown;
          inputJson: string;
          name: string;
        }
      >();

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");

        while (true) {
          const separatorIndex = buffer.indexOf("\n\n");
          if (separatorIndex === -1) {
            break;
          }

          const frame = buffer.slice(0, separatorIndex);
          buffer = buffer.slice(separatorIndex + 2);

          const { data } = parseSseFrame(frame);
          if (!data || data === "[DONE]") {
            continue;
          }

          const payload = JSON.parse(data) as Record<string, unknown>;
          const eventType = typeof payload.type === "string" ? payload.type : "";

          if (eventType === "message_start") {
            yield { type: "message_start" };
            continue;
          }

          if (eventType === "ping") {
            yield { type: "ping" };
            continue;
          }

          if (eventType === "message_delta") {
            const delta = isRecord(payload.delta) ? payload.delta : {};
            const nextStopReason =
              typeof delta.stop_reason === "string" ? delta.stop_reason : stopReason;
            const nextUsage = isRecord(payload.usage) ? (payload.usage as AnthropicUsage) : usage;

            stopReason = nextStopReason;
            usage = nextUsage;
            yield {
              stopReason: nextStopReason,
              type: "message_delta",
              usage: nextUsage,
            };
            continue;
          }

          if (eventType === "content_block_start") {
            const index = typeof payload.index === "number" ? payload.index : 0;
            const contentBlock = isRecord(payload.content_block) ? payload.content_block : {};
            const blockType =
              typeof contentBlock.type === "string" ? contentBlock.type : undefined;

            if (blockType === "text") {
              textBlocks.set(index, typeof contentBlock.text === "string" ? contentBlock.text : "");
            }

            if (blockType === "tool_use") {
              toolBlocks.set(index, {
                id: typeof contentBlock.id === "string" ? contentBlock.id : `tool-${index}`,
                input: isRecord(contentBlock.input) ? contentBlock.input : {},
                inputJson: "",
                name: typeof contentBlock.name === "string" ? contentBlock.name : "unknown",
              });
            }

            continue;
          }

          if (eventType === "content_block_delta") {
            const index = typeof payload.index === "number" ? payload.index : 0;
            const delta = isRecord(payload.delta) ? payload.delta : {};
            const deltaType = typeof delta.type === "string" ? delta.type : undefined;

            if (deltaType === "text_delta") {
              const text = typeof delta.text === "string" ? delta.text : "";
              textBlocks.set(index, `${textBlocks.get(index) ?? ""}${text}`);
              yield {
                index,
                text,
                type: "text_delta",
              };
              continue;
            }

            if (deltaType === "input_json_delta") {
              const currentBlock = toolBlocks.get(index);
              if (!currentBlock) {
                continue;
              }

              currentBlock.inputJson += typeof delta.partial_json === "string"
                ? delta.partial_json
                : "";
            }

            continue;
          }

          if (eventType === "content_block_stop") {
            const index = typeof payload.index === "number" ? payload.index : 0;
            const toolBlock = toolBlocks.get(index);

            if (!toolBlock) {
              continue;
            }

            const parsedInput =
              toolBlock.inputJson.trim().length > 0
                ? JSON.parse(toolBlock.inputJson)
                : toolBlock.input;

            toolBlock.input = parsedInput;
            yield {
              id: toolBlock.id,
              index,
              input: parsedInput,
              name: toolBlock.name,
              rawInputJson: toolBlock.inputJson,
              type: "tool_use",
            };
          }
        }
      }

      const assistantContent: AnthropicMessageContentBlock[] = [];
      const blockIndexes = new Set<number>([
        ...textBlocks.keys(),
        ...toolBlocks.keys(),
      ]);

      for (const index of [...blockIndexes].sort((left, right) => left - right)) {
        const text = textBlocks.get(index);
        if (typeof text === "string" && text.length > 0) {
          assistantContent.push({
            text,
            type: "text",
          });
        }

        const toolBlock = toolBlocks.get(index);
        if (toolBlock) {
          assistantContent.push({
            id: toolBlock.id,
            input: toolBlock.input,
            name: toolBlock.name,
            type: "tool_use",
          });
        }
      }

      return {
        assistantMessage: {
          content: assistantContent,
          role: "assistant",
        },
        stopReason,
        usage,
      };
    } catch (error) {
      if (controller.signal.aborted && controller.signal.reason === "timeout") {
        throw new GenerationEngineError(
          FailureReason.GENERATION_TIMEOUT,
          `Anthropic streaming timed out after ${timeoutMs}ms.`,
        );
      }

      throw toGenerationEngineError(error, FailureReason.ANTHROPIC_ERROR);
    } finally {
      clearTimeout(timeoutHandle);
    }
  }
}

function parseSseFrame(frame: string): { event?: string; data?: string } {
  const lines = frame.split("\n");
  let event: string | undefined;
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith(":")) {
      continue;
    }

    if (line.startsWith("event:")) {
      event = line.slice("event:".length).trim();
      continue;
    }

    if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trimStart());
    }
  }

  return {
    data: dataLines.length > 0 ? dataLines.join("\n") : undefined,
    event,
  };
}

function sanitizeActionResults(actionResults: readonly ActionResultEnvelope[]) {
  return actionResults.map((result) => ({
    actionCallId: result.actionCallId,
    actionName: result.actionName,
    changedPaths: result.changedPaths,
    reason: result.reason,
    success: result.success,
    summary: result.summary,
  }));
}

export function createSupabaseTurnPersistence(input: {
  generationId: string;
  db?: StudioDbClient;
}): GenerationTurnPersistence {
  let cachedDb: StudioDbClient | undefined = input.db;

  async function resolveDb(): Promise<StudioDbClient> {
    if (cachedDb) {
      return cachedDb;
    }

    const { createStudioDbClient } = await import("@beomz-studio/studio-db");
    cachedDb = createStudioDbClient();
    return cachedDb;
  }

  async function mergeMetadata(
    generationId: string,
    buildNextMetadata: (currentMetadata: Record<string, unknown>) => Record<string, unknown>,
  ) {
    const db = await resolveDb();
    const currentGeneration = await db.findGenerationById(generationId);
    if (!currentGeneration) {
      throw new GenerationEngineError(
        FailureReason.INVALID_OUTPUT,
        `Generation ${generationId} does not exist in the studio database.`,
      );
    }

    const currentMetadata = isRecord(currentGeneration.metadata) ? currentGeneration.metadata : {};

    return {
      db,
      metadata: buildNextMetadata(currentMetadata),
      row: currentGeneration,
    };
  }

  return {
    async saveTurn(turnInput) {
      const { db, metadata, row } = await mergeMetadata(
        turnInput.generationId,
        (currentMetadata) => {
          const currentEngineMetadata = isRecord(currentMetadata.engine)
            ? currentMetadata.engine
            : {};

          return {
            ...currentMetadata,
            deferredItems:
              turnInput.finalResult?.deferredItems
              ?? currentMetadata.deferredItems
              ?? [],
            engine: {
              ...currentEngineMetadata,
              done: turnInput.done,
              lastActionResults: sanitizeActionResults(turnInput.actionResults),
              lastAssistantText: buildAssistantText(turnInput.assistantMessage),
              lastSavedAt: new Date().toISOString(),
              lastTurn: turnInput.turn,
              snapshot: turnInput.snapshot,
            },
          };
        },
      );

      await db.updateGeneration(turnInput.generationId, {
        completed_at: turnInput.done ? new Date().toISOString() : row.completed_at,
        files: turnInput.files,
        metadata,
        output_paths: toOutputPaths(turnInput.files),
        status: turnInput.done ? "completed" : "running",
        summary: turnInput.summary,
      });
    },
    async saveFailure(failureInput) {
      const { db, metadata } = await mergeMetadata(
        failureInput.generationId,
        (currentMetadata) => {
          const currentEngineMetadata = isRecord(currentMetadata.engine)
            ? currentMetadata.engine
            : {};

          return {
            ...currentMetadata,
            failureReason: failureInput.reason,
            engine: {
              ...currentEngineMetadata,
              done: false,
              failedAt: new Date().toISOString(),
              lastTurn: failureInput.turn,
              snapshot: failureInput.snapshot,
            },
          };
        },
      );

      await db.updateGeneration(failureInput.generationId, {
        completed_at: new Date().toISOString(),
        error: failureInput.error,
        files: failureInput.files,
        metadata,
        output_paths: toOutputPaths(failureInput.files),
        status: "failed",
      });
    },
  };
}

export class GenerationEngine {
  private readonly actionDefinitions: readonly ActionDefinition[];
  private readonly persistence?: GenerationTurnPersistence;
  private readonly template: TemplateDefinition;
  readonly vfs: VirtualFileSystem;

  constructor(private readonly options: GenerationEngineOptions) {
    this.actionDefinitions = options.actions ?? CORE_ACTIONS;
    this.template = this.resolveTemplate(options.project.templateId, options.template);
    this.vfs = options.vfs ?? new VirtualFileSystem(options.initialFiles ?? []);
    this.persistence =
      options.persistence === false
        ? undefined
        : options.persistence ?? createSupabaseTurnPersistence({
            generationId: options.generationId,
          });
  }

  async *run(): AsyncGenerator<GenerationEngineEvent, GenerationEngineResult> {
    let turn = 0;
    let messages: AnthropicConversationMessage[] = this.options.existingMessages
      ? [...this.options.existingMessages]
      : [buildUserTextMessage(this.options.prompt)];

    try {
      while (turn < (this.options.maxTurns ?? 12)) {
        turn += 1;

        const promptFrame = buildSystemPromptFrame({
          actor: this.options.actor,
          actionDefinitions: this.actionDefinitions,
          operation: this.options.operation,
          project: this.options.project,
          prompt: this.options.prompt,
          template: this.template,
          turn,
          userPreferences: this.options.userPreferences,
          vfs: this.vfs,
        });

        yield {
          promptFrame,
          turn,
          type: "llm_turn_started",
        };

        const actionExecutor = new ActionExecutor(
          this.actionDefinitions,
          this.buildActionContext(),
        );
        const actionResults: ActionResultEnvelope[] = [];
        let needsFollowUp = false;

        const streamIterator = this.options.model.stream({
          maxTokens: this.options.maxTokens,
          messages,
          system: promptFrame.system,
          temperature: this.options.temperature,
          tools: this.actionDefinitions.map((action) => ({
            description: action.description,
            input_schema: action.jsonSchema,
            name: action.name,
          })),
        });

        let turnResult: StreamingModelTurnResult | undefined;

        while (true) {
          const next = await streamIterator.next();
          if (next.done) {
            turnResult = next.value;
            break;
          }

          const event = next.value;

          if (event.type === "text_delta") {
            yield {
              text: event.text,
              turn,
              type: "text_delta",
            };
          }

          if (event.type === "tool_use") {
            needsFollowUp = true;
            actionExecutor.enqueue({
              id: event.id,
              input: event.input,
              name: event.name,
            });

            yield {
              actionCallId: event.id,
              actionName: event.name,
              input: event.input,
              turn,
              type: "action_requested",
            };
          }

          for (const completedAction of actionExecutor.drainCompleted()) {
            actionResults.push(completedAction);
            yield this.toActionEvent(turn, completedAction);
          }
        }

        const remainingResults = await actionExecutor.drainRemaining();
        for (const completedAction of remainingResults) {
          actionResults.push(completedAction);
          yield this.toActionEvent(turn, completedAction);
        }

        const assistantMessage =
          turnResult?.assistantMessage
          ?? {
            content: [],
            role: "assistant" as const,
          };

        yield {
          assistantMessage,
          stopReason: turnResult?.stopReason,
          turn,
          type: "llm_turn_completed",
          usage: turnResult?.usage,
        };

        const finalResult = actionExecutor.getFinishResult();
        const snapshot = this.vfs.snapshot();
        const files = this.vfs.toStudioFiles();
        const summary = finalResult?.summary
          ?? buildAssistantText(assistantMessage)
          ?? `Completed engine turn ${turn}.`;
        const nextMessages = [...messages, assistantMessage];

        if (needsFollowUp) {
          nextMessages.push({
            content: actionResults.map(buildToolResultBlock),
            role: "user",
          });
        }

        if (this.persistence) {
          await this.persistence.saveTurn({
            actionResults,
            assistantMessage,
            done: finalResult !== undefined,
            files,
            finalResult,
            generationId: this.options.generationId,
            snapshot,
            summary,
            turn,
          });
        }

        yield {
          generationId: this.options.generationId,
          snapshot,
          turn,
          type: "snapshot_saved",
        };

        if (finalResult) {
          const result: GenerationEngineResult = {
            deferredItems: finalResult.deferredItems,
            files,
            messages: nextMessages,
            outputPaths: toOutputPaths(files),
            snapshot,
            summary: finalResult.summary,
            turns: turn,
          };

          yield {
            result,
            type: "generation_completed",
          };

          return result;
        }

        if (!needsFollowUp) {
          throw new GenerationEngineError(
            FailureReason.INVALID_OUTPUT,
            "Model ended a turn without calling finish.",
          );
        }

        messages = nextMessages;
      }

      throw new GenerationEngineError(
        FailureReason.GENERATION_TIMEOUT,
        `Generation exceeded ${this.options.maxTurns ?? 12} turns without finishing.`,
      );
    } catch (error) {
      const engineError = toGenerationEngineError(error, FailureReason.INVALID_OUTPUT);
      const snapshot = this.vfs.snapshot();
      const files = this.vfs.toStudioFiles();

      if (this.persistence?.saveFailure) {
        await this.persistence.saveFailure({
          error: engineError.message,
          files,
          generationId: this.options.generationId,
          reason: engineError.reason,
          snapshot,
          turn,
        });
      }

      yield {
        error: engineError.message,
        reason: engineError.reason,
        turn,
        type: "generation_failed",
      };

      throw engineError;
    }
  }

  private buildActionContext(): ActionExecutionContext {
    return {
      assertWriteAllowed: (filePath: string) => this.assertWriteAllowed(filePath),
      commandRunner: this.options.commandRunner,
      normalizePath: (filePath: string) => normalizeVirtualPath(filePath),
      operation: this.options.operation,
      vfs: this.vfs,
    };
  }

  private assertWriteAllowed(filePath: string): string {
    const normalizedPath = normalizeVirtualPath(filePath);
    const writeScope = this.options.operation.writeScope;

    if (matchesAnyGlob(normalizedPath, writeScope.immutableGlobs)) {
      throw new EngineActionError(
        FailureReason.SHELL_VIOLATION,
        `Write blocked: ${normalizedPath} is immutable for this operation.`,
      );
    }

    if (matchesAnyGlob(normalizedPath, writeScope.deniedGlobs)) {
      throw new EngineActionError(
        FailureReason.SHELL_VIOLATION,
        `Write blocked: ${normalizedPath} matches a denied platform scope.`,
      );
    }

    if (!matchesAnyGlob(normalizedPath, writeScope.allowedGlobs)) {
      throw new EngineActionError(
        FailureReason.SHELL_VIOLATION,
        `Write blocked: ${normalizedPath} is outside the allowed write scope.`,
      );
    }

    return normalizedPath;
  }

  private resolveTemplate(
    templateId: Project["templateId"],
    explicitTemplate?: TemplateDefinition,
  ): TemplateDefinition {
    if (explicitTemplate) {
      return explicitTemplate;
    }

    if (!this.options.operation.allowedTemplates.includes(templateId)) {
      throw new GenerationEngineError(
        FailureReason.TEMPLATE_NOT_FOUND,
        `Template ${templateId} is not allowed for operation ${this.options.operation.id}.`,
      );
    }

    return getTemplateDefinition(templateId);
  }

  private toActionEvent(
    turn: number,
    actionResult: ActionResultEnvelope,
  ): GenerationEngineEvent {
    if (actionResult.success) {
      return {
        actionCallId: actionResult.actionCallId,
        actionName: actionResult.actionName,
        changedPaths: actionResult.changedPaths,
        output: actionResult.output,
        summary: actionResult.summary,
        turn,
        type: "action_completed",
      };
    }

    return {
      actionCallId: actionResult.actionCallId,
      actionName: actionResult.actionName,
      error:
        isRecord(actionResult.output) && typeof actionResult.output.message === "string"
          ? actionResult.output.message
          : actionResult.summary,
      reason: actionResult.reason ?? FailureReason.INVALID_OUTPUT,
      turn,
      type: "action_failed",
    };
  }
}
