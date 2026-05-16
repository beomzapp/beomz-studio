/**
 * useBuildChatV2 — BEO-808 / Sprint 9 Phase 3.1
 *
 * Reducer + SSE subscription hook for the v2 chat panel rebuild.
 * Operates behind the USE_CHAT_PANEL_V2 feature flag — not wired into live UI.
 *
 * Reducer actions map 1:1 to server SSE event types.
 * Persistence: snapshot-only localStorage per project (chat:v2:<projectId>).
 */
import { useCallback, useEffect, useReducer, useRef } from "react";
import {
  isBuildCompleteEvent,
  isErrorEvent,
  isPlanProposedEvent,
  isStateEvent,
  isTextCompleteEvent,
  isTextDeltaEvent,
  isToolActionEvent,
  isTurnCompleteEvent,
  isTurnStartedEvent,
  type BuildCompleteEvent,
  type ErrorEvent as ChatV2ErrorEvent,
  type PlanProposedEvent,
  type StateEvent,
  type TextCompleteEvent,
  type TextDeltaEvent,
  type ToolActionEvent,
  type TurnCompleteEvent,
  type TurnStartedEvent,
} from "@beomz-studio/contracts";
import { getAccessToken, getApiBaseUrl } from "../lib/api";

// ─── Types (local) ───────────────────────────────────────────────────────────

export type ChatPhase =
  | "idle"
  | "classifying"
  | "thinking"
  | "planning"
  | "awaiting_implement"
  | "building"
  | "persisting"
  | "summarizing"
  | "done"
  | "failed";

export interface Message {
  id: string;
  turnId: string;
  role: "user" | "assistant";
  type: "text" | "plan_card" | "build_summary" | "error";
  content: string;
  streaming: boolean;
  cta?: { label: string; action: string; planId: string };
  filesChanged?: string[];
  durationMs?: number;
  creditsUsed?: number;
  costUsd?: number;
  nextSteps?: { label: string; prompt: string }[];
  errorCode?: string;
  retryable?: boolean;
  createdAt: number;
}

export interface ChatState {
  turnId: string | null;
  phase: ChatPhase;
  messages: Message[];
  currentAction: ToolActionEvent | null;
  pendingPlan: PlanProposedEvent | null;
  error: ChatV2ErrorEvent | null;
}

export type ChatAction =
  | { type: "TURN_STARTED"; payload: TurnStartedEvent }
  | { type: "STATE"; payload: StateEvent }
  | { type: "TEXT_DELTA"; payload: TextDeltaEvent }
  | { type: "TEXT_COMPLETE"; payload: TextCompleteEvent }
  | { type: "PLAN_PROPOSED"; payload: PlanProposedEvent }
  | { type: "TOOL_ACTION"; payload: ToolActionEvent }
  | { type: "BUILD_COMPLETE"; payload: BuildCompleteEvent }
  | { type: "ERROR"; payload: ChatV2ErrorEvent }
  | { type: "TURN_COMPLETE"; payload: TurnCompleteEvent }
  | { type: "USER_SENT"; payload: { content: string; messageId: string } }
  | { type: "USER_IMPLEMENTED_PLAN"; payload: { planId: string } }
  | { type: "USER_RETRIED"; payload: { errorCode: string } };

// ─── Initial state ────────────────────────────────────────────────────────────

export const initialChatState: ChatState = {
  turnId: null,
  phase: "idle",
  messages: [],
  currentAction: null,
  pendingPlan: null,
  error: null,
};

// ─── Reducer ─────────────────────────────────────────────────────────────────

export function chatV2Reducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "TURN_STARTED": {
      const { turnId } = action.payload;
      // Update the turnId on any messages that don't have one yet (optimistic user msg)
      const messages = state.messages.map((m) =>
        m.turnId === "" ? { ...m, turnId } : m,
      );
      return { ...state, turnId, phase: "classifying", messages };
    }

    case "STATE": {
      const phase = action.payload.phase as ChatPhase;
      return {
        ...state,
        phase,
        // Clear the live action indicator when the phase settles to done/failed
        currentAction:
          phase === "done" || phase === "failed" ? null : state.currentAction,
      };
    }

    case "TEXT_DELTA": {
      const { messageId, delta } = action.payload;
      const existing = state.messages.find((m) => m.id === messageId);
      if (existing) {
        return {
          ...state,
          messages: state.messages.map((m) =>
            m.id === messageId
              ? { ...m, content: m.content + delta, streaming: true }
              : m,
          ),
        };
      }
      // First delta — create the assistant text message
      const newMsg: Message = {
        id: messageId,
        turnId: state.turnId ?? "",
        role: "assistant",
        type: "text",
        content: delta,
        streaming: true,
        createdAt: Date.now(),
      };
      return { ...state, messages: [...state.messages, newMsg] };
    }

    case "TEXT_COMPLETE": {
      return {
        ...state,
        messages: state.messages.map((m) =>
          m.id === action.payload.messageId ? { ...m, streaming: false } : m,
        ),
      };
    }

    case "PLAN_PROPOSED": {
      const { messageId, summary, cta } = action.payload;
      const planMsg: Message = {
        id: messageId,
        turnId: state.turnId ?? "",
        role: "assistant",
        type: "plan_card",
        content: summary,
        streaming: false,
        cta,
        createdAt: Date.now(),
      };
      return {
        ...state,
        pendingPlan: action.payload,
        phase: "awaiting_implement",
        messages: [...state.messages, planMsg],
      };
    }

    case "TOOL_ACTION": {
      return { ...state, currentAction: action.payload };
    }

    case "BUILD_COMPLETE": {
      const { messageId, filesChanged, durationMs, creditsUsed, costUsd, nextSteps } =
        action.payload;
      const summaryMsg: Message = {
        id: messageId,
        turnId: state.turnId ?? "",
        role: "assistant",
        type: "build_summary",
        content: "",
        streaming: false,
        filesChanged,
        durationMs,
        creditsUsed,
        costUsd,
        nextSteps,
        createdAt: Date.now(),
      };
      return {
        ...state,
        currentAction: null,
        messages: [...state.messages, summaryMsg],
      };
    }

    case "ERROR": {
      const { messageId, code, message, retryable } = action.payload;
      const errorMsg: Message = {
        id: messageId ?? `err_${Date.now()}`,
        turnId: state.turnId ?? "",
        role: "assistant",
        type: "error",
        content: message,
        streaming: false,
        errorCode: code,
        retryable,
        createdAt: Date.now(),
      };
      return {
        ...state,
        error: action.payload,
        phase: "failed",
        messages: [...state.messages, errorMsg],
      };
    }

    case "TURN_COMPLETE": {
      if (state.phase === "failed") return state;
      return { ...state, phase: "done" };
    }

    case "USER_SENT": {
      const { content, messageId } = action.payload;
      const userMsg: Message = {
        id: messageId,
        turnId: "", // filled in by TURN_STARTED
        role: "user",
        type: "text",
        content,
        streaming: false,
        createdAt: Date.now(),
      };
      return {
        ...state,
        phase: "classifying",
        error: null,
        messages: [...state.messages, userMsg],
      };
    }

    case "USER_IMPLEMENTED_PLAN": {
      return { ...state, pendingPlan: null, phase: "building" };
    }

    case "USER_RETRIED": {
      return { ...state, error: null, phase: "classifying" };
    }

    default: {
      // Exhaustive guard — TS will complain if a new action is added without handling
      const _never: never = action;
      return _never;
    }
  }
}

// ─── Persistence helpers ──────────────────────────────────────────────────────

function readSnapshot(projectId: string): Pick<ChatState, "messages" | "turnId"> {
  try {
    const raw = localStorage.getItem(`chat:v2:${projectId}`);
    if (!raw) return { messages: [], turnId: null };
    const { messages, lastTurnId } = JSON.parse(raw) as {
      messages: Message[];
      lastTurnId: string | null;
    };
    return { messages: messages ?? [], turnId: lastTurnId ?? null };
  } catch {
    return { messages: [], turnId: null };
  }
}

function writeSnapshot(projectId: string, state: ChatState): void {
  try {
    localStorage.setItem(
      `chat:v2:${projectId}`,
      JSON.stringify({ messages: state.messages, lastTurnId: state.turnId }),
    );
  } catch {
    // Ignore QuotaExceededError — snapshot is best-effort
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useBuildChatV2(projectId: string) {
  const [state, dispatch] = useReducer(
    chatV2Reducer,
    undefined,
    (): ChatState => {
      const { messages, turnId } = readSnapshot(projectId);
      return { ...initialChatState, messages, turnId };
    },
  );

  // Persist snapshot on every state change
  useEffect(() => {
    writeSnapshot(projectId, state);
  }, [projectId, state]);

  // Track last prompt for retry
  const lastPromptRef = useRef<string>("");
  const lastAttachmentsRef = useRef<{ imageUrl?: string }[] | undefined>(undefined);

  const sendMessage = useCallback(
    async (
      prompt: string,
      attachments?: { imageUrl?: string }[],
    ): Promise<void> => {
      lastPromptRef.current = prompt;
      lastAttachmentsRef.current = attachments;

      // Optimistic dispatch — client-generated messageId
      const optimisticMessageId = `msg_user_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      dispatch({ type: "USER_SENT", payload: { content: prompt, messageId: optimisticMessageId } });

      let token: string;
      try {
        token = await getAccessToken();
      } catch {
        dispatch({
          type: "ERROR",
          payload: {
            type: "error",
            code: "auth_error",
            message: "Could not retrieve auth token. Please sign in again.",
            retryable: true,
          },
        });
        return;
      }

      let response: Response;
      try {
        response = await fetch(`${getApiBaseUrl()}/builds/v2/message`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ projectId, prompt, attachments }),
        });
      } catch (err) {
        dispatch({
          type: "ERROR",
          payload: {
            type: "error",
            code: "network_error",
            message: err instanceof Error ? err.message : "Network request failed.",
            retryable: true,
          },
        });
        return;
      }

      if (!response.ok) {
        dispatch({
          type: "ERROR",
          payload: {
            type: "error",
            code: `http_${response.status}`,
            message: `Server returned ${response.status}.`,
            retryable: response.status >= 500,
          },
        });
        return;
      }

      const body = response.body;
      if (!body) {
        dispatch({
          type: "ERROR",
          payload: {
            type: "error",
            code: "no_body",
            message: "Response had no readable body.",
            retryable: true,
          },
        });
        return;
      }

      const reader = body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // Process complete SSE lines
          const lines = buffer.split("\n");
          // Keep the last (potentially incomplete) line in the buffer
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data: ")) continue;
            const jsonStr = trimmed.slice("data: ".length);
            if (jsonStr === "[DONE]") break;

            let parsed: unknown;
            try {
              parsed = JSON.parse(jsonStr);
            } catch {
              // Malformed line — skip
              continue;
            }

            // Narrow using type guards from contracts and dispatch matching action
            dispatchSSEEvent(dispatch, parsed);
          }
        }
      } catch (err) {
        dispatch({
          type: "ERROR",
          payload: {
            type: "error",
            code: "stream_error",
            message: err instanceof Error ? err.message : "Stream read failed.",
            retryable: true,
          },
        });
      } finally {
        reader.releaseLock();
      }
    },
    [projectId],
  );

  const implementPlan = useCallback((planId: string) => {
    dispatch({ type: "USER_IMPLEMENTED_PLAN", payload: { planId } });
  }, []);

  const retry = useCallback(() => {
    dispatch({ type: "USER_RETRIED", payload: { errorCode: state.error?.code ?? "unknown" } });
    if (lastPromptRef.current) {
      void sendMessage(lastPromptRef.current, lastAttachmentsRef.current);
    }
  }, [state.error?.code, sendMessage]);

  return { state, sendMessage, implementPlan, retry };
}

// ─── SSE event dispatcher ─────────────────────────────────────────────────────

/**
 * Maps a parsed ChatV2Event to the corresponding ChatAction and dispatches it.
 * Uses type guards from @beomz-studio/contracts for narrowing.
 * Silently drops unknown event types — future-proofed against new contract events.
 */
function dispatchSSEEvent(
  dispatch: (action: ChatAction) => void,
  event: unknown,
): void {
  // The event must be a plain object with a `type` string field to be valid
  if (
    typeof event !== "object" ||
    event === null ||
    typeof (event as Record<string, unknown>)["type"] !== "string"
  ) {
    return;
  }

  // Cast to ChatV2Event union so type guards work correctly
  // Guards narrow to the exact subtype — no `any` escapes downstream
  const ev = event as Parameters<typeof isTurnStartedEvent>[0];

  if (isTurnStartedEvent(ev)) {
    dispatch({ type: "TURN_STARTED", payload: ev });
  } else if (isStateEvent(ev)) {
    dispatch({ type: "STATE", payload: ev });
  } else if (isTextDeltaEvent(ev)) {
    dispatch({ type: "TEXT_DELTA", payload: ev });
  } else if (isTextCompleteEvent(ev)) {
    dispatch({ type: "TEXT_COMPLETE", payload: ev });
  } else if (isPlanProposedEvent(ev)) {
    dispatch({ type: "PLAN_PROPOSED", payload: ev });
  } else if (isToolActionEvent(ev)) {
    dispatch({ type: "TOOL_ACTION", payload: ev });
  } else if (isBuildCompleteEvent(ev)) {
    dispatch({ type: "BUILD_COMPLETE", payload: ev });
  } else if (isErrorEvent(ev)) {
    dispatch({ type: "ERROR", payload: ev });
  } else if (isTurnCompleteEvent(ev)) {
    dispatch({ type: "TURN_COMPLETE", payload: ev });
  }
  // auto_implement_started / auto_implement_cancelled handled at UI layer — not reducer actions
}
