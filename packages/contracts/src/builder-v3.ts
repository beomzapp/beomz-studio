export type BuilderV3Operation = "initial_build" | "iteration" | "clarify_plan";

export type BuilderV3ToolName =
  | "plan_blueprint"
  | "template_select"
  | "generate_files"
  | "validate_build"
  | "fallback_scaffold"
  | "persist_build_state";

export interface BuilderV3BaseEvent {
  id: string;
  timestamp: string;
  operation: BuilderV3Operation;
}

export interface BuilderV3AssistantDeltaEvent extends BuilderV3BaseEvent {
  type: "assistant_delta";
  delta: string;
}

export interface BuilderV3StatusEvent extends BuilderV3BaseEvent {
  type: "status";
  code: string;
  phase: string;
  message: string;
  progress?: number | null;
}

export interface BuilderV3ToolUseStartedEvent extends BuilderV3BaseEvent {
  type: "tool_use_started";
  tool_use_id: string;
  tool_name: BuilderV3ToolName;
  code: string;
  message: string;
  payload?: Record<string, unknown> | null;
}

export interface BuilderV3ToolUseProgressEvent extends BuilderV3BaseEvent {
  type: "tool_use_progress";
  tool_use_id: string;
  tool_name: BuilderV3ToolName;
  code: string;
  message: string;
  payload?: Record<string, unknown> | null;
}

export interface BuilderV3ToolResultEvent extends BuilderV3BaseEvent {
  type: "tool_result";
  tool_use_id: string;
  tool_name: BuilderV3ToolName;
  code: string;
  status: "success" | "error";
  message: string;
  payload?: Record<string, unknown> | null;
}

export interface BuilderV3PreviewReadyEvent extends BuilderV3BaseEvent {
  type: "preview_ready";
  code: string;
  message: string;
  buildId: string;
  projectId: string;
  previewEntryPath: string;
  fallbackUsed: boolean;
  fallbackReason?: string | null;
  payload?: Record<string, unknown> | null;
}

export interface BuilderV3DoneEvent extends BuilderV3BaseEvent {
  type: "done";
  code: string;
  message: string;
  buildId: string;
  projectId: string;
  fallbackUsed: boolean;
  fallbackReason?: string | null;
  payload?: Record<string, unknown> | null;
  /** True when the stream terminated due to a conversational/clarifying response (no build was run). */
  conversational?: boolean;
}

export interface BuilderV3ErrorEvent extends BuilderV3BaseEvent {
  type: "error";
  code: string;
  message: string;
  buildId: string;
  projectId: string;
  tool_use_id?: string;
  tool_name?: BuilderV3ToolName;
  payload?: Record<string, unknown> | null;
}

// BEO-312: emitted before a complex build starts; frontend renders a feature
// selection card. Build is paused until confirm-scope is called (or 60 s timeout).
export interface BuilderV3ScopeConfirmationEvent extends BuilderV3BaseEvent {
  type: "scope_confirmation";
  features: string[];
  buildId: string;
  message: string;
}

// BEO-312: emitted instead of starting a build when the prompt is conversational
// ("what else can we add?"). No code is generated; frontend renders a suggestion reply.
export interface BuilderV3ConversationalResponseEvent extends BuilderV3BaseEvent {
  type: "conversational_response";
  message: string;
}

// BEO-335: emitted when org lacks enough credits to run a complex build.
// The features list shows what they would have gotten; force-simple can start
// a capped single-phase build instead.
export interface BuilderV3InsufficientCreditsEvent extends BuilderV3BaseEvent {
  type: "insufficient_credits";
  available: number;
  required: number;
  features: string[];
}

// BEO-387: stage boundary events emitted by the backend at real pipeline transitions.
export type BuildStageEventType =
  | "stage_classifying"
  | "stage_enriching"
  | "stage_generating"
  | "stage_sanitising"
  | "stage_persisting"
  | "stage_deploying";

export interface BuilderV3BuildStageEvent extends Omit<BuilderV3BaseEvent, "operation"> {
  type: BuildStageEventType;
  /** From BuilderV3BaseEvent — always present on these events. */
  operation: BuilderV3Operation;
  stage: string;
  elapsedMs: number;
}

// BEO-362: 4-way intent classifier result emitted before any build action.
export type BuildIntent = "question" | "edit" | "build" | "ambiguous";

export interface BuilderV3IntentDetectedEvent extends BuilderV3BaseEvent {
  type: "intent_detected";
  intent: BuildIntent;
}

// BEO-362: one-sentence Haiku acknowledgement streamed before Sonnet fires.
export interface BuilderV3PreBuildAckEvent extends BuilderV3BaseEvent {
  type: "pre_build_ack";
  message: string;
}

// BEO-362: focused clarifying question emitted for ambiguous intent.
// Build is paused; next user message re-runs detectIntent.
export interface BuilderV3ClarifyingQuestionEvent extends BuilderV3BaseEvent {
  type: "clarifying_question";
  message: string;
}

// BEO-362: 2-3 sentence natural-language summary emitted after Sonnet completes.
// BEO-368: durationMs and creditsUsed added for the summary footer.
export interface BuilderV3BuildSummaryEvent extends BuilderV3BaseEvent {
  type: "build_summary";
  message: string;
  filesChanged: string[];
  durationMs: number;
  creditsUsed: number;
}

export type BuilderV3Event =
  | BuilderV3AssistantDeltaEvent
  | BuilderV3StatusEvent
  | BuilderV3ToolUseStartedEvent
  | BuilderV3ToolUseProgressEvent
  | BuilderV3ToolResultEvent
  | BuilderV3PreviewReadyEvent
  | BuilderV3DoneEvent
  | BuilderV3ErrorEvent
  | BuilderV3ScopeConfirmationEvent
  | BuilderV3ConversationalResponseEvent
  | BuilderV3InsufficientCreditsEvent
  | BuilderV3IntentDetectedEvent
  | BuilderV3PreBuildAckEvent
  | BuilderV3ClarifyingQuestionEvent
  | BuilderV3BuildSummaryEvent
  | BuilderV3BuildStageEvent;

export interface BuilderV3TranscriptEntry {
  id: string;
  kind: "assistant" | "status" | "tool_use" | "tool_result" | "error" | "done";
  message: string;
  code?: string;
  toolUseId?: string;
  toolName?: BuilderV3ToolName;
  status?: "running" | "success" | "error";
  payload?: Record<string, unknown> | null;
  timestamp: string;
}

export interface BuilderV3TraceMetadata {
  events: readonly BuilderV3Event[];
  lastEventId: string | null;
  previewReady: boolean;
  fallbackUsed: boolean;
  fallbackReason?: string | null;
}

export interface BuilderV3TracePatch {
  appendEvents?: readonly BuilderV3Event[];
  previewReady?: boolean;
  fallbackUsed?: boolean;
  fallbackReason?: string | null;
}

export function createEmptyBuilderV3TraceMetadata(): BuilderV3TraceMetadata {
  return {
    events: [],
    lastEventId: null,
    previewReady: false,
    fallbackReason: null,
    fallbackUsed: false,
  };
}

export function isBuilderV3TerminalEvent(event: BuilderV3Event): boolean {
  return event.type === "done" || event.type === "error";
}
