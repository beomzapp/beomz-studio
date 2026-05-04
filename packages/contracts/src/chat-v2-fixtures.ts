/**
 * chat-v2-fixtures — BEO-808
 *
 * Exported fixture constants for chat-v2 event types.
 * Consumed by frontend dev-preview and test helpers.
 * Keep in sync with chat-v2.ts contract interfaces.
 */
import type {
  AutoImplementCancelledEvent,
  AutoImplementStartedEvent,
  BuildCompleteEvent,
  ErrorEvent,
  PlanProposedEvent,
  StateEvent,
  TextCompleteEvent,
  TextDeltaEvent,
  ToolActionEvent,
  TurnCompleteEvent,
  TurnStartedEvent,
} from "./chat-v2.js";

export const EXAMPLE_TURN_STARTED: TurnStartedEvent = {
  type: "turn_started",
  turnId: "turn_1",
  userMessageId: "msg_user_1",
  kind: "iteration",
  projectContext: {
    isFirstBuild: false,
    hasExistingFiles: true,
    fileCount: 42,
  },
};

export const EXAMPLE_STATE: StateEvent = {
  type: "state",
  phase: "planning",
};

export const EXAMPLE_TEXT_DELTA: TextDeltaEvent = {
  type: "text_delta",
  messageId: "msg_assistant_1",
  delta: "Drafting plan...",
};

export const EXAMPLE_TEXT_COMPLETE: TextCompleteEvent = {
  type: "text_complete",
  messageId: "msg_assistant_1",
};

export const EXAMPLE_PLAN_PROPOSED: PlanProposedEvent = {
  type: "plan_proposed",
  messageId: "msg_plan_1",
  summary: "I will refresh the layout and keep all current features.",
  cta: {
    label: "Implement",
    action: "implement_plan",
    planId: "plan_1",
  },
};

export const EXAMPLE_AUTO_IMPLEMENT_STARTED: AutoImplementStartedEvent = {
  type: "auto_implement_started",
  messageId: "msg_plan_1",
  durationMs: 5000,
};

export const EXAMPLE_AUTO_IMPLEMENT_CANCELLED: AutoImplementCancelledEvent = {
  type: "auto_implement_cancelled",
  messageId: "msg_plan_1",
  reason: "user_cancelled",
};

export const EXAMPLE_TOOL_ACTION: ToolActionEvent = {
  type: "tool_action",
  kind: "edit_file",
  label: "Editing src/components/Hero.tsx",
  path: "src/components/Hero.tsx",
  phase: 1,
  totalPhases: 3,
};

export const EXAMPLE_BUILD_COMPLETE: BuildCompleteEvent = {
  type: "build_complete",
  messageId: "msg_summary_1",
  buildId: "build_1",
  filesChanged: ["src/App.tsx", "src/components/Hero.tsx"],
  durationMs: 18200,
  creditsUsed: 3,
  costUsd: 0.23,
  nextSteps: [
    { label: "Tighten copy", prompt: "Make hero copy more conversion-focused." },
    { label: "Add FAQ", prompt: "Add an FAQ section under pricing." },
  ],
};

export const EXAMPLE_ERROR: ErrorEvent = {
  type: "error",
  messageId: "msg_error_1",
  code: "MODEL_TIMEOUT",
  message: "The model timed out.",
  retryable: true,
};

export const EXAMPLE_TURN_COMPLETE: TurnCompleteEvent = {
  type: "turn_complete",
  turnId: "turn_1",
};
