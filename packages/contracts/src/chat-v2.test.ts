import assert from "node:assert/strict";
import test from "node:test";

import {
  assertNever,
  isAutoImplementCancelledEvent,
  isAutoImplementStartedEvent,
  isBuildCompleteEvent,
  isErrorEvent,
  isPlanProposedEvent,
  isStateEvent,
  isTextCompleteEvent,
  isTextDeltaEvent,
  isToolActionEvent,
  isTurnCompleteEvent,
  isTurnStartedEvent,
  type AutoImplementCancelledEvent,
  type AutoImplementStartedEvent,
  type BuildCompleteEvent,
  type ChatV2Event,
  type ErrorEvent,
  type PlanProposedEvent,
  type StateEvent,
  type TextCompleteEvent,
  type TextDeltaEvent,
  type ToolActionEvent,
  type TurnCompleteEvent,
  type TurnStartedEvent,
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

const TYPE_GUARDS = {
  turn_started: isTurnStartedEvent,
  state: isStateEvent,
  text_delta: isTextDeltaEvent,
  text_complete: isTextCompleteEvent,
  plan_proposed: isPlanProposedEvent,
  auto_implement_started: isAutoImplementStartedEvent,
  auto_implement_cancelled: isAutoImplementCancelledEvent,
  tool_action: isToolActionEvent,
  build_complete: isBuildCompleteEvent,
  error: isErrorEvent,
  turn_complete: isTurnCompleteEvent,
} as const;

const EXAMPLE_EVENTS: Record<ChatV2Event["type"], ChatV2Event> = {
  turn_started: EXAMPLE_TURN_STARTED,
  state: EXAMPLE_STATE,
  text_delta: EXAMPLE_TEXT_DELTA,
  text_complete: EXAMPLE_TEXT_COMPLETE,
  plan_proposed: EXAMPLE_PLAN_PROPOSED,
  auto_implement_started: EXAMPLE_AUTO_IMPLEMENT_STARTED,
  auto_implement_cancelled: EXAMPLE_AUTO_IMPLEMENT_CANCELLED,
  tool_action: EXAMPLE_TOOL_ACTION,
  build_complete: EXAMPLE_BUILD_COMPLETE,
  error: EXAMPLE_ERROR,
  turn_complete: EXAMPLE_TURN_COMPLETE,
};

test("type guards: each guard matches only its own event type", () => {
  for (const [eventType, sample] of Object.entries(EXAMPLE_EVENTS) as Array<
    [ChatV2Event["type"], ChatV2Event]
  >) {
    for (const [guardType, guard] of Object.entries(TYPE_GUARDS) as Array<
      [ChatV2Event["type"], (ev: ChatV2Event) => boolean]
    >) {
      const result = guard(sample);
      if (guardType === eventType) {
        assert.equal(result, true, `${guardType} should accept ${eventType}`);
      } else {
        assert.equal(result, false, `${guardType} should reject ${eventType}`);
      }
    }
  }
});

function handleEvent(ev: ChatV2Event): string {
  switch (ev.type) {
    case "turn_started":
      return ev.type;
    case "state":
      return ev.type;
    case "text_delta":
      return ev.type;
    case "text_complete":
      return ev.type;
    case "plan_proposed":
      return ev.type;
    case "auto_implement_started":
      return ev.type;
    case "auto_implement_cancelled":
      return ev.type;
    case "tool_action":
      return ev.type;
    case "build_complete":
      return ev.type;
    case "error":
      return ev.type;
    case "turn_complete":
      return ev.type;
    default:
      return assertNever(ev);
  }
}

test("exhaustive switch: all event types are handled", () => {
  for (const [eventType, sample] of Object.entries(EXAMPLE_EVENTS) as Array<
    [ChatV2Event["type"], ChatV2Event]
  >) {
    assert.equal(handleEvent(sample), eventType);
  }
});

test("fixtures: every example satisfies its corresponding guard", () => {
  assert.equal(isTurnStartedEvent(EXAMPLE_TURN_STARTED), true);
  assert.equal(isStateEvent(EXAMPLE_STATE), true);
  assert.equal(isTextDeltaEvent(EXAMPLE_TEXT_DELTA), true);
  assert.equal(isTextCompleteEvent(EXAMPLE_TEXT_COMPLETE), true);
  assert.equal(isPlanProposedEvent(EXAMPLE_PLAN_PROPOSED), true);
  assert.equal(isAutoImplementStartedEvent(EXAMPLE_AUTO_IMPLEMENT_STARTED), true);
  assert.equal(isAutoImplementCancelledEvent(EXAMPLE_AUTO_IMPLEMENT_CANCELLED), true);
  assert.equal(isToolActionEvent(EXAMPLE_TOOL_ACTION), true);
  assert.equal(isBuildCompleteEvent(EXAMPLE_BUILD_COMPLETE), true);
  assert.equal(isErrorEvent(EXAMPLE_ERROR), true);
  assert.equal(isTurnCompleteEvent(EXAMPLE_TURN_COMPLETE), true);
});
