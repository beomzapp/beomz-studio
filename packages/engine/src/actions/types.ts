import type { OperationContract } from "@beomz-studio/contracts";
import { FailureReason } from "@beomz-studio/validators";
import { z } from "zod";

import type {
  VirtualFileSystem,
  VirtualFileSystemSnapshot,
} from "../VirtualFileSystem.js";

export type ActionConcurrency = "read" | "exclusive";

export interface JsonSchemaDefinition extends Record<string, unknown> {}

export interface FinishActionOutput {
  summary: string;
  deferredItems: string[];
}

export interface CommandRunnerInput {
  command: string;
  cwd?: string;
  timeoutMs?: number;
  snapshot: VirtualFileSystemSnapshot;
}

export interface CommandRunnerResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs?: number;
}

export interface CommandRunner {
  run(input: CommandRunnerInput): Promise<CommandRunnerResult>;
}

export interface ActionExecutionContext {
  readonly vfs: VirtualFileSystem;
  readonly operation: OperationContract;
  readonly commandRunner?: CommandRunner;
  normalizePath(filePath: string): string;
  assertWriteAllowed(filePath: string): string;
}

export interface ActionExecutionOutcome<TOutput = unknown, TUndoData = unknown> {
  output: TOutput;
  summary: string;
  changedPaths?: readonly string[];
  undoData?: TUndoData;
  finish?: FinishActionOutput;
}

export interface ActionDefinition<
  TSchema extends z.ZodTypeAny = z.ZodTypeAny,
  TOutput = unknown,
  TUndoData = unknown,
> {
  readonly name: string;
  readonly description: string;
  readonly concurrency: ActionConcurrency;
  readonly schema: TSchema;
  readonly jsonSchema: JsonSchemaDefinition;
  execute(
    input: z.infer<TSchema>,
    context: ActionExecutionContext,
  ): Promise<ActionExecutionOutcome<TOutput, TUndoData>> | ActionExecutionOutcome<TOutput, TUndoData>;
  undo(
    outcome: ActionExecutionOutcome<TOutput, TUndoData>,
    context: ActionExecutionContext,
  ): Promise<void> | void;
}

export interface ActionCall {
  id: string;
  name: string;
  input: unknown;
}

export interface ActionResultEnvelope {
  actionCallId: string;
  actionName: string;
  input: unknown;
  success: boolean;
  reason?: FailureReason;
  summary: string;
  output: unknown;
  changedPaths: readonly string[];
  undoData?: unknown;
  finish?: FinishActionOutput;
}

export class EngineActionError extends Error {
  readonly reason: FailureReason;

  constructor(reason: FailureReason, message: string) {
    super(message);
    this.name = "EngineActionError";
    this.reason = reason;
  }
}

export function toActionError(
  error: unknown,
  fallbackReason = FailureReason.INVALID_OUTPUT,
): EngineActionError {
  if (error instanceof EngineActionError) {
    return error;
  }

  if (error instanceof z.ZodError) {
    return new EngineActionError(
      FailureReason.INVALID_OUTPUT,
      error.issues.map((issue) => issue.message).join("; "),
    );
  }

  const message = error instanceof Error ? error.message : "Unknown action execution error.";
  return new EngineActionError(fallbackReason, message);
}
