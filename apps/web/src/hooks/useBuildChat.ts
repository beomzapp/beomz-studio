/**
 * useBuildChat — BEO-363
 *
 * Owns all chat state + SSE event handling for the builder.
 * ProjectPage calls this hook and renders the returned messages.
 * No build logic lives in ProjectPage itself.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { BuilderV3Event, ChatMessage, StudioFile } from "@beomz-studio/contracts";
import {
  getBuildStatus,
  getLatestBuildForProject,
  NetworkDisconnectError,
  type BuildStatusResponse,
  type StartBuildResponse,
} from "../lib/api";
import { useBuilderEngineStream } from "./useBuilderEngineStream";

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ─── Session-events → ChatMessage mapper ──────────────────────────────────────
// Maps the session_events persisted by the backend into the ChatMessage
// discriminated union so chat history survives a hard refresh (BEO-370).
// Only completed-build events are persisted (user, pre_build_ack,
// question_answer, clarifying_question, build_summary). In-flight types
// (building, error, server_restarting) are never stored and are skipped here.

function mapSessionEventsToMessages(
  events: readonly Record<string, unknown>[],
): ChatMessage[] {
  const result: ChatMessage[] = [];
  for (const ev of events) {
    const type = ev.type;
    const content = typeof ev.content === "string" ? ev.content : "";
    const timestamp = typeof ev.timestamp === "string" ? new Date(ev.timestamp) : new Date();

    if (type === "user") {
      result.push({ id: makeId(), type: "user", content, timestamp });
    } else if (type === "pre_build_ack") {
      result.push({ id: makeId(), type: "pre_build_ack", content });
    } else if (type === "question_answer") {
      result.push({ id: makeId(), type: "question_answer", content, streaming: false });
    } else if (type === "clarifying_question") {
      result.push({ id: makeId(), type: "clarifying_question", content });
    } else if (type === "build_summary") {
      result.push({
        id: makeId(),
        type: "build_summary",
        content,
        filesChanged: Array.isArray(ev.filesChanged) ? ev.filesChanged.map(String) : [],
        durationMs: typeof ev.durationMs === "number" ? ev.durationMs : undefined,
        creditsUsed: typeof ev.creditsUsed === "number" ? ev.creditsUsed : undefined,
      });
    }
    // building / error / server_restarting — not persisted, skip
  }
  return result;
}

export interface UseBuildChatOptions {
  /**
   * Receives every raw SSE event. Use this for legacy side-effects in ProjectPage
   * (phase mode, scope confirmation, insufficient credits, preview overlay, etc.)
   * that have not yet been migrated into the hook.
   */
  onEvent?: (event: BuilderV3Event) => void;
  /**
   * Called once the real project ID is resolved after a new project is created
   * or once the hook identifies the project from an API response.
   */
  onProjectIdResolved?: (projectId: string, projectName: string, projectIcon: string | null) => void;
  /** Called when fresh build status is fetched (e.g. after done event). */
  onBuildStatus?: (status: BuildStatusResponse) => void;
  /** Called immediately after the build API responds (before streaming begins). */
  onBuildStarted?: (response: StartBuildResponse) => void;
}

export function useBuildChat(projectId: string, options: UseBuildChatOptions = {}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isBuilding, setIsBuilding] = useState(false);

  const buildDoneRef = useRef(false);
  const lastUserPromptRef = useRef("");
  const activeBuildingMsgIdRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const existingFilesRef = useRef<readonly StudioFile[]>([]);
  const resolvedProjectIdRef = useRef(
    projectId && projectId !== "new" ? projectId : "",
  );

  // Keep options in a ref so handleEvent never needs them in its dep array.
  // This prevents stale-closure issues when options callbacks are redefined.
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  // ─── Seed chat history from session_events on mount (BEO-370) ────────────
  // Fetches the latest completed build and restores chat history so a hard
  // refresh shows the previous conversation. Only runs for existing projects
  // (not "new") and only seeds when the messages array is still empty.
  const historySeededRef = useRef(false);
  useEffect(() => {
    const pid = resolvedProjectIdRef.current;
    if (!pid || historySeededRef.current) return;
    historySeededRef.current = true;
    void getLatestBuildForProject(pid)
      .then(status => {
        if (!status) return;
        // Only restore from terminal builds — in-progress builds stream live events.
        if (status.build.status !== "completed" && status.build.status !== "failed") return;
        const events = status.build.sessionEvents;
        if (!events?.length) return;
        setMessages(prev => (prev.length > 0 ? prev : mapSessionEventsToMessages(events)));
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { startAndStreamBuild, subscribeToBuild } = useBuilderEngineStream();

  // ─── SSE event handler ────────────────────────────────────────────────────

  const handleEvent = useCallback((event: BuilderV3Event) => {
    // Forward every event to ProjectPage for legacy side-effects
    optionsRef.current.onEvent?.(event);

    switch (event.type) {
      case "intent_detected":
        // Internal classifier result — no chat message
        break;

      case "pre_build_ack":
        setMessages(prev => [
          ...prev,
          { id: makeId(), type: "pre_build_ack", content: event.message },
        ]);
        break;

      case "conversational_response":
        setMessages(prev => [
          ...prev,
          { id: makeId(), type: "question_answer", content: event.message, streaming: false },
        ]);
        setIsBuilding(false);
        break;

      case "clarifying_question":
        setMessages(prev => [
          ...prev,
          { id: makeId(), type: "clarifying_question", content: event.message },
        ]);
        break;

      // Progress events → upsert a single "building" message
      case "tool_use_started":
      case "tool_use_progress":
      case "status": {
        setMessages(prev => {
          const buildingId = activeBuildingMsgIdRef.current;
          const phase =
            event.type === "status"
              ? (event.phase || event.message)
              : event.message;
          const payload = "payload" in event ? (event.payload ?? {}) : {};
          const filesWritten =
            typeof payload.filesWritten === "number" ? payload.filesWritten : undefined;
          const totalFiles =
            typeof payload.totalFiles === "number" ? payload.totalFiles : undefined;

          if (buildingId) {
            const idx = prev.findIndex(m => m.id === buildingId);
            if (idx !== -1) {
              const next = [...prev];
              next[idx] = { id: buildingId, type: "building", phase, filesWritten, totalFiles };
              return next;
            }
          }

          const id = makeId();
          activeBuildingMsgIdRef.current = id;
          return [...prev, { id, type: "building", phase, filesWritten, totalFiles }];
        });
        break;
      }

      case "build_summary":
        setMessages(prev => [
          ...prev,
          {
            id: makeId(),
            type: "build_summary",
            content: event.message,
            filesChanged: event.filesChanged,
            durationMs: event.durationMs,
            creditsUsed: event.creditsUsed,
          },
        ]);
        break;

      case "done":
        if (event.fallbackUsed) {
          buildDoneRef.current = false;
          setMessages(prev => [
            ...prev,
            {
              id: makeId(),
              type: "error",
              content:
                "The build didn't generate any files — this sometimes happens with complex prompts. Your credits have not been charged.",
            },
          ]);
        } else {
          buildDoneRef.current = true;
          // Conversational done (question_answer / clarifying_question) — skip file fetch
          // to avoid clobbering existingFilesRef with empty/stale data.
          if (!event.conversational) {
            void getBuildStatus(event.buildId)
              .then(status => {
                existingFilesRef.current = status.result?.files ?? [];
                optionsRef.current.onBuildStatus?.(status);
              })
              .catch(() => {});
          }
        }
        setIsBuilding(false);
        activeBuildingMsgIdRef.current = null;
        break;

      case "error":
        if (event.code === "server_restarting") {
          buildDoneRef.current = false;
          setMessages(prev => {
            if (prev.some(m => m.type === "server_restarting")) return prev;
            return [...prev, { id: makeId(), type: "server_restarting" }];
          });
        } else {
          setMessages(prev => [
            ...prev,
            { id: makeId(), type: "error", content: event.message, code: event.code },
          ]);
        }
        setIsBuilding(false);
        activeBuildingMsgIdRef.current = null;
        break;

      // Events handled exclusively by ProjectPage via onEvent callback
      default:
        break;
    }
  }, []);

  // ─── sendMessage ─────────────────────────────────────────────────────────

  const sendMessage = useCallback(
    (text: string) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      lastUserPromptRef.current = text;
      buildDoneRef.current = false;
      activeBuildingMsgIdRef.current = null;

      setIsBuilding(true);
      setMessages(prev => [
        // Drop any stale server_restarting card from the previous session
        ...prev.filter(m => m.type !== "server_restarting"),
        { id: makeId(), type: "user", content: text, timestamp: new Date() },
      ]);

      void startAndStreamBuild({
        body: {
          prompt: text,
          projectId: resolvedProjectIdRef.current || undefined,
          model: "claude-sonnet-4-6",
          existingFiles:
            existingFilesRef.current.length > 0
              ? existingFilesRef.current
              : undefined,
        },
        signal: controller.signal,
        onBuildStarted: response => {
          resolvedProjectIdRef.current = response.project.id;
          optionsRef.current.onProjectIdResolved?.(
            response.project.id,
            response.project.name,
            response.project.icon ?? null,
          );
          optionsRef.current.onBuildStarted?.(response);
        },
        onBuildStatus: status => {
          optionsRef.current.onBuildStatus?.(status);
        },
        onEvent: handleEvent,
      }).catch(err => {
        if (controller.signal.aborted) return;
        if (err instanceof NetworkDisconnectError) {
          setMessages(prev => {
            if (prev.some(m => m.type === "server_restarting")) return prev;
            return [...prev, { id: makeId(), type: "server_restarting" }];
          });
        } else {
          const content = err instanceof Error ? err.message : "Failed to start build.";
          setMessages(prev => [...prev, { id: makeId(), type: "error", content }]);
        }
        setIsBuilding(false);
        buildDoneRef.current = false;
      });
    },
    [startAndStreamBuild, handleEvent],
  );

  // ─── retryLastBuild ───────────────────────────────────────────────────────

  const retryLastBuild = useCallback(() => {
    const prompt = lastUserPromptRef.current;
    if (!prompt) return;
    setMessages(prev =>
      prev.filter(m => m.type !== "error" && m.type !== "server_restarting"),
    );
    sendMessage(prompt);
  }, [sendMessage]);

  // ─── subscribeToExistingBuild ─────────────────────────────────────────────
  // Called by ProjectPage's resume-on-mount effect to re-attach to an
  // in-progress build (e.g. after a page refresh).

  const subscribeToExistingBuild = useCallback(
    async (buildId: string, lastEventId: string | null, signal: AbortSignal) => {
      buildDoneRef.current = false;
      setIsBuilding(true);
      await subscribeToBuild({
        buildId,
        lastEventId,
        onEvent: handleEvent,
        onBuildStatus: status => {
          optionsRef.current.onBuildStatus?.(status);
        },
        signal,
      });
      // If subscription ended without a terminal SSE event (e.g. aborted by the
      // resume effect's cleanup), reset isBuilding so the user can still type.
      if (!signal.aborted) {
        setIsBuilding(false);
      }
    },
    [subscribeToBuild, handleEvent],
  );

  return {
    messages,
    isBuilding,
    sendMessage,
    retryLastBuild,
    buildDoneRef,
    /** Re-attach to an in-progress build after page reload. */
    subscribeToExistingBuild,
  };
}
