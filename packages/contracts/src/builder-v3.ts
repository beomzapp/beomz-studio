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
  | BuilderV3ConversationalResponseEvent;

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
