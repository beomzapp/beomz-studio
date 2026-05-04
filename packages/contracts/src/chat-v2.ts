/**
 * Fired at the beginning of every user turn, before any state or text events.
 * Frontend should initialize reducer turn context and reset per-turn transient UI.
 * Must be emitted before any other events for the same turn.
 */
export interface TurnStartedEvent {
  type: "turn_started";
  turnId: string;
  userMessageId: string;
  kind: "question" | "iteration" | "redesign" | "initial_build";
  projectContext: {
    isFirstBuild: boolean;
    hasExistingFiles: boolean;
    fileCount: number;
  };
}

/**
 * Fired whenever the turn phase changes.
 * Frontend should update the single active phase indicator atomically.
 * Only one phase is active at a time, and transitions must not overlap.
 */
export interface StateEvent {
  type: "state";
  phase:
    | "classifying"
    | "thinking"
    | "planning"
    | "building"
    | "persisting"
    | "summarizing"
    | "done"
    | "failed";
}

/**
 * Fired for streamed assistant text chunks.
 * Frontend should append delta to the targeted streaming assistant message.
 * Must be paired with prior state phase "thinking" or "planning".
 */
export interface TextDeltaEvent {
  type: "text_delta";
  messageId: string;
  delta: string;
}

/**
 * Fired when a streamed assistant text message is complete.
 * Frontend should mark the targeted message as no longer streaming.
 * Must follow one or more text deltas for the same message when streaming occurred.
 */
export interface TextCompleteEvent {
  type: "text_complete";
  messageId: string;
}

/**
 * Fired when the backend proposes a concise plan confirmation.
 * Frontend should render the inline confirmation CTA and await implement/cancel flow.
 * Ends the planning phase before build state begins.
 */
export interface PlanProposedEvent {
  type: "plan_proposed";
  messageId: string;
  summary: string;
  cta: { label: string; action: "implement_plan"; planId: string };
}

/**
 * Fired when countdown-based auto-implement begins for qualified turns.
 * Frontend should show countdown UI tied to the provided duration.
 * Only emitted for high-confidence iteration/redesign turns.
 */
export interface AutoImplementStartedEvent {
  type: "auto_implement_started";
  messageId: string;
  durationMs: number;
}

/**
 * Fired when auto-implement is interrupted by user action.
 * Frontend should stop countdown and reflect the user-selected outcome.
 * Only valid after an auto_implement_started event for the same message.
 */
export interface AutoImplementCancelledEvent {
  type: "auto_implement_cancelled";
  messageId: string;
  reason: "user_cancelled" | "user_implemented_now";
}

/**
 * Fired for human-readable tool or pipeline progress updates.
 * Frontend should surface the current build action in live status UI.
 * Must only be emitted while in the building phase.
 */
export interface ToolActionEvent {
  type: "tool_action";
  kind:
    | "create_file"
    | "edit_file"
    | "read_file"
    | "run_migration"
    | "install_packages"
    | "deploy"
    | "phase_transition";
  label: string;
  path?: string;
  phase?: number;
  totalPhases?: number;
}

/**
 * Fired when a build finishes and summary metadata is available.
 * Frontend should render build summary content and follow-up next-step chips.
 * Must be followed by state: done and then turn_complete.
 */
export interface BuildCompleteEvent {
  type: "build_complete";
  messageId: string;
  buildId: string;
  filesChanged: string[];
  durationMs: number;
  creditsUsed: number;
  costUsd: number;
  nextSteps: { label: string; prompt: string }[];
}

/**
 * Fired when a turn or build flow encounters an error.
 * Frontend should render inline error UI and optional retry affordances.
 * Terminal failures should transition to failed state before turn completion handling.
 */
export interface ErrorEvent {
  type: "error";
  messageId?: string;
  code: string;
  message: string;
  retryable: boolean;
}

/**
 * Fired exactly once when the turn is fully complete.
 * Frontend should finalize transient turn UI and persist final reducer snapshot.
 * Must be the final event in the turn sequence.
 */
export interface TurnCompleteEvent {
  type: "turn_complete";
  turnId: string;
}

/**
 * Canonical chat-v2 SSE contract emitted by the backend and consumed by frontend reducer.
 *
 * Firing-order rules:
 * - One state event at a time. Phase transitions are atomic.
 * - text_delta always paired with prior state: thinking or state: planning.
 * - tool_action only during state: building.
 * - plan_proposed ends state: planning. Server waits for user implement_plan action OR
 *   auto-implement timer expiry before emitting state: building.
 * - build_complete always followed by state: done then turn_complete.
 * - auto_implement_started only fires when classifier confidence >= 0.85 AND
 *   kind is iteration or redesign.
 */
export type ChatV2Event =
  | TurnStartedEvent
  | StateEvent
  | TextDeltaEvent
  | TextCompleteEvent
  | PlanProposedEvent
  | AutoImplementStartedEvent
  | AutoImplementCancelledEvent
  | ToolActionEvent
  | BuildCompleteEvent
  | ErrorEvent
  | TurnCompleteEvent;

export function isTurnStartedEvent(ev: ChatV2Event): ev is TurnStartedEvent {
  return ev.type === "turn_started";
}

export function isStateEvent(ev: ChatV2Event): ev is StateEvent {
  return ev.type === "state";
}

export function isTextDeltaEvent(ev: ChatV2Event): ev is TextDeltaEvent {
  return ev.type === "text_delta";
}

export function isTextCompleteEvent(ev: ChatV2Event): ev is TextCompleteEvent {
  return ev.type === "text_complete";
}

export function isPlanProposedEvent(ev: ChatV2Event): ev is PlanProposedEvent {
  return ev.type === "plan_proposed";
}

export function isAutoImplementStartedEvent(ev: ChatV2Event): ev is AutoImplementStartedEvent {
  return ev.type === "auto_implement_started";
}

export function isAutoImplementCancelledEvent(ev: ChatV2Event): ev is AutoImplementCancelledEvent {
  return ev.type === "auto_implement_cancelled";
}

export function isToolActionEvent(ev: ChatV2Event): ev is ToolActionEvent {
  return ev.type === "tool_action";
}

export function isBuildCompleteEvent(ev: ChatV2Event): ev is BuildCompleteEvent {
  return ev.type === "build_complete";
}

export function isErrorEvent(ev: ChatV2Event): ev is ErrorEvent {
  return ev.type === "error";
}

export function isTurnCompleteEvent(ev: ChatV2Event): ev is TurnCompleteEvent {
  return ev.type === "turn_complete";
}

export function assertNever(x: never): never {
  throw new Error(`Unhandled ChatV2Event type: ${JSON.stringify(x)}`);
}
