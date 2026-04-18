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
import { STAGE_COPY, type BuildStage } from "../lib/buildStatusCopy";

// Maps stage SSE event type → BuildStage key
const STAGE_EVENT_TO_STAGE: Record<string, BuildStage> = {
  stage_classifying: "classifying",
  stage_enriching:   "enriching",
  stage_generating:  "generating",
  stage_sanitising:  "sanitising",
  stage_persisting:  "persisting",
  stage_deploying:   "deploying",
};

/**
 * Resolve the {app_type} token from the user's last prompt.
 * Falls back to "your app" — the real descriptor comes from enrichPrompt
 * server-side but isn't yet surfaced in SSE events.
 */
function resolveAppType(prompt: string): string {
  const trimmed = prompt.trim().replace(/[.!?]+$/, "");
  if (!trimmed || trimmed.length < 4) return "your app";
  const match = trimmed.match(/(?:build|make|create|write)\s+(?:me\s+)?(?:a\s+|an\s+)?(.{3,30})/i);
  if (match?.[1]) return match[1].trim();
  return "your app";
}

/** Pick a variant from a stage's copy pool, substituting {app_type}. */
function pickCopy(stage: BuildStage, index: number, appType: string): string {
  const pool = STAGE_COPY[stage];
  const raw = pool[index % pool.length] ?? pool[0];
  return raw.replace("{app_type}", appType);
}

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
  // BEO-386: tracks when the current build started (set on pre_build_ack).
  const buildStartedAtRef = useRef<number | null>(null);
  const existingFilesRef = useRef<readonly StudioFile[]>([]);
  const resolvedProjectIdRef = useRef(
    projectId && projectId !== "new" ? projectId : "",
  );

  // BEO-387: phase / copy tracking refs
  const currentPhaseRef = useRef<BuildStage | null>(null);
  const phaseVariantIndexRef = useRef(0);
  const phaseHasSwappedRef = useRef(false);
  const phaseRotationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const preBuildFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const appTypeRef = useRef("your app");

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

      case "pre_build_ack": {
        // BEO-386: record when this build started so the elapsed timer has a
        // stable anchor that survives navigation (stored in sessionStorage too).
        const now = Date.now();
        buildStartedAtRef.current = now;
        try {
          const ssKey = `beomz:buildStartedAt:${resolvedProjectIdRef.current}`;
          sessionStorage.setItem(ssKey, String(now));
        } catch { /* sessionStorage may be unavailable */ }

        // BEO-387: reset phase tracking for the new build.
        if (phaseRotationTimerRef.current) {
          clearTimeout(phaseRotationTimerRef.current);
          phaseRotationTimerRef.current = null;
        }
        if (preBuildFallbackTimerRef.current) {
          clearTimeout(preBuildFallbackTimerRef.current);
          preBuildFallbackTimerRef.current = null;
        }
        currentPhaseRef.current = null;
        phaseHasSwappedRef.current = false;

        // Pick an "acknowledged" copy variant to show immediately in the
        // building message while we wait for the first stage event.
        const ackIndex = Math.floor(Math.random() * STAGE_COPY.acknowledged.length);
        const ackCopy = pickCopy("acknowledged", ackIndex, appTypeRef.current);

        // BEO-378: replace the thinking dots with the real ack message.
        const ackBuildingId = makeId();
        activeBuildingMsgIdRef.current = ackBuildingId;
        const ackBuildStartedAt = buildStartedAtRef.current ?? undefined;
        setMessages(prev => [
          ...prev.filter(m => m.type !== "thinking"),
          { id: makeId(), type: "pre_build_ack", content: event.message },
          { id: ackBuildingId, type: "building", phase: "acknowledged", phaseCopy: ackCopy, buildStartedAt: ackBuildStartedAt },
        ]);

        // BEO-387: if no stage event arrives within 5s, show a safe fallback.
        preBuildFallbackTimerRef.current = setTimeout(() => {
          if (currentPhaseRef.current !== null) return; // stage already arrived
          setMessages(prev => {
            const bid = activeBuildingMsgIdRef.current;
            if (!bid) return prev;
            const idx = prev.findIndex(m => m.id === bid);
            if (idx === -1) return prev;
            const existing = prev[idx] as Extract<ChatMessage, { type: "building" }>;
            if (existing.phaseCopy && existing.phaseCopy !== ackCopy) return prev;
            const next = [...prev];
            next[idx] = { ...existing, phaseCopy: "Getting started…" };
            return next;
          });
        }, 5_000);
        break;
      }

      case "conversational_response":
        // BEO-378: filter thinking dots (no pre_build_ack fires for conversational).
        setMessages(prev => [
          ...prev.filter(m => m.type !== "thinking"),
          { id: makeId(), type: "question_answer", content: event.message, streaming: false },
        ]);
        setIsBuilding(false);
        break;

      case "clarifying_question":
        // BEO-378: filter thinking dots.
        setMessages(prev => [
          ...prev.filter(m => m.type !== "thinking"),
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
          // BEO-386: attach the stable start timestamp to every building message.
          const buildStartedAt = buildStartedAtRef.current ?? undefined;

          if (buildingId) {
            const idx = prev.findIndex(m => m.id === buildingId);
            if (idx !== -1) {
              const next = [...prev];
              const existing = prev[idx] as Extract<ChatMessage, { type: "building" }>;
              // BEO-387: preserve phaseCopy if a stage event already set it.
              const phaseCopy = existing.phaseCopy;
              next[idx] = { id: buildingId, type: "building", phase: existing.phase ?? phase, phaseCopy, filesWritten, totalFiles, buildStartedAt };
              return next;
            }
          }

          const id = makeId();
          activeBuildingMsgIdRef.current = id;
          return [...prev, { id, type: "building", phase, filesWritten, totalFiles, buildStartedAt }];
        });
        break;
      }

      case "build_summary":
        // BEO-373: remove any lingering building message so the cycling status
        // disappears when the summary card arrives.
        // BEO-386: clear the stored build start time on successful completion.
        try {
          sessionStorage.removeItem(`beomz:buildStartedAt:${resolvedProjectIdRef.current}`);
        } catch { /* ignore */ }
        buildStartedAtRef.current = null;
        setMessages(prev => [
          ...prev.filter(m => m.type !== "building"),
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
          // BEO-386: freeze the timer and clear the stored start time.
          try {
            sessionStorage.removeItem(`beomz:buildStartedAt:${resolvedProjectIdRef.current}`);
          } catch { /* ignore */ }
          const frozenAtFallback = Date.now();
          const frozenBuildIdFallback = activeBuildingMsgIdRef.current;
          // BEO-378: clear thinking dots on failed builds; also freeze building message.
          setMessages(prev => {
            const mapped = frozenBuildIdFallback
              ? prev.map(m =>
                  m.id === frozenBuildIdFallback && m.type === "building"
                    ? { ...m, buildFrozenAt: frozenAtFallback }
                    : m,
                )
              : prev;
            return [
              ...mapped.filter(m => m.type !== "thinking"),
              {
                id: makeId(),
                type: "error",
                content:
                  "The build didn't generate any files — this sometimes happens with complex prompts. Your credits have not been charged.",
              },
            ];
          });
        } else {
          buildDoneRef.current = true;
          // BEO-386: clear the stored start time on successful completion.
          try {
            sessionStorage.removeItem(`beomz:buildStartedAt:${resolvedProjectIdRef.current}`);
          } catch { /* ignore */ }
          buildStartedAtRef.current = null;
          // Conversational done (question_answer / clarifying_question) — skip file fetch
          // to avoid clobbering existingFilesRef with empty/stale data.
          if (!event.conversational) {
            void getBuildStatus(event.buildId)
              .then(status => {
                existingFilesRef.current = status.result?.files ?? [];
                optionsRef.current.onBuildStatus?.(status);
                // BEO-372: recover build_summary from sessionEvents if the SSE event was
                // missed because the server closed the stream before it was flushed.
                // Dedup guard prevents doubling when the SSE event did arrive normally.
                const se = status.build.sessionEvents;
                if (Array.isArray(se)) {
                  const summaryEv = se.find(e => e.type === "build_summary");
                  if (summaryEv) {
                    setMessages(prev => {
                      if (prev.some(m => m.type === "build_summary")) return prev;
                      return [
                        ...prev.filter(m => m.type !== "building"),
                        {
                          id: makeId(),
                          type: "build_summary" as const,
                          content: typeof summaryEv.content === "string" ? summaryEv.content : "",
                          filesChanged: Array.isArray(summaryEv.filesChanged)
                            ? summaryEv.filesChanged.map(String)
                            : [],
                          durationMs: typeof summaryEv.durationMs === "number" ? summaryEv.durationMs : undefined,
                          creditsUsed: typeof summaryEv.creditsUsed === "number" ? summaryEv.creditsUsed : undefined,
                        },
                      ];
                    });
                  }
                }
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
          // BEO-386: freeze the timer on server restart.
          try {
            sessionStorage.removeItem(`beomz:buildStartedAt:${resolvedProjectIdRef.current}`);
          } catch { /* ignore */ }
          const frozenAtRestart = Date.now();
          const frozenBuildIdRestart = activeBuildingMsgIdRef.current;
          setMessages(prev => {
            const mapped = frozenBuildIdRestart
              ? prev.map(m =>
                  m.id === frozenBuildIdRestart && m.type === "building"
                    ? { ...m, buildFrozenAt: frozenAtRestart }
                    : m,
                )
              : prev;
            if (mapped.some(m => m.type === "server_restarting")) return mapped;
            return [...mapped, { id: makeId(), type: "server_restarting" }];
          });
        } else {
          // BEO-386: freeze the timer on build error.
          try {
            sessionStorage.removeItem(`beomz:buildStartedAt:${resolvedProjectIdRef.current}`);
          } catch { /* ignore */ }
          const frozenAtErr = Date.now();
          const frozenBuildIdErr = activeBuildingMsgIdRef.current;
          setMessages(prev => {
            const mapped = frozenBuildIdErr
              ? prev.map(m =>
                  m.id === frozenBuildIdErr && m.type === "building"
                    ? { ...m, buildFrozenAt: frozenAtErr }
                    : m,
                )
              : prev;
            return [...mapped, { id: makeId(), type: "error", content: event.message, code: event.code }];
          });
        }
        setIsBuilding(false);
        activeBuildingMsgIdRef.current = null;
        break;

      // BEO-387: stage boundary events — update building message with honest copy
      case "stage_classifying":
      case "stage_enriching":
      case "stage_generating":
      case "stage_sanitising":
      case "stage_persisting":
      case "stage_deploying": {
        const stage = STAGE_EVENT_TO_STAGE[event.type]!;
        const pool = STAGE_COPY[stage];

        // Cancel any pending rotation timer from the previous stage.
        if (phaseRotationTimerRef.current) {
          clearTimeout(phaseRotationTimerRef.current);
          phaseRotationTimerRef.current = null;
        }
        // Cancel the pre_build_ack fallback — a real stage arrived.
        if (preBuildFallbackTimerRef.current) {
          clearTimeout(preBuildFallbackTimerRef.current);
          preBuildFallbackTimerRef.current = null;
        }

        currentPhaseRef.current = stage;
        phaseHasSwappedRef.current = false;

        // Pick copy variant once at stage entry; keep it locked until rotation.
        // If elapsedMs already >= 60000, jump straight to variant 1 (one-time swap).
        const alreadyLong = typeof event.elapsedMs === "number" && event.elapsedMs >= 60_000;
        const variantIndex = alreadyLong && pool.length > 1 ? 1 : Math.floor(Math.random() * pool.length);
        if (alreadyLong) phaseHasSwappedRef.current = true;
        phaseVariantIndexRef.current = variantIndex;

        const phaseCopy = pickCopy(stage, variantIndex, appTypeRef.current);
        const buildStartedAt = buildStartedAtRef.current ?? undefined;

        setMessages(prev => {
          const buildingId = activeBuildingMsgIdRef.current;
          if (buildingId) {
            const idx = prev.findIndex(m => m.id === buildingId);
            if (idx !== -1) {
              const next = [...prev];
              const existing = prev[idx] as Extract<ChatMessage, { type: "building" }>;
              next[idx] = { ...existing, phase: stage, phaseCopy, buildStartedAt };
              return next;
            }
          }
          // No building message yet — create one.
          const id = makeId();
          activeBuildingMsgIdRef.current = id;
          return [...prev, { id, type: "building", phase: stage, phaseCopy, buildStartedAt }];
        });

        // Schedule a 60s variant rotation for long stages (most useful for "generating").
        if (!alreadyLong && pool.length > 1) {
          const capturedStage = stage;
          const nextIndex = (variantIndex + 1) % pool.length;
          phaseRotationTimerRef.current = setTimeout(() => {
            if (currentPhaseRef.current !== capturedStage) return;
            if (phaseHasSwappedRef.current) return;
            phaseHasSwappedRef.current = true;
            const rotatedCopy = pickCopy(capturedStage, nextIndex, appTypeRef.current);
            setMessages(prev => {
              const bid = activeBuildingMsgIdRef.current;
              if (!bid) return prev;
              const idx = prev.findIndex(m => m.id === bid);
              if (idx === -1) return prev;
              const next = [...prev];
              const existing = prev[idx] as Extract<ChatMessage, { type: "building" }>;
              next[idx] = { ...existing, phaseCopy: rotatedCopy };
              return next;
            });
          }, 60_000);
        }
        break;
      }

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
      // BEO-386: reset the timer for the new build; clear any stale sessionStorage value.
      buildStartedAtRef.current = null;
      try {
        sessionStorage.removeItem(`beomz:buildStartedAt:${resolvedProjectIdRef.current}`);
      } catch { /* ignore */ }

      // BEO-387: reset phase tracking for the new build.
      if (phaseRotationTimerRef.current) {
        clearTimeout(phaseRotationTimerRef.current);
        phaseRotationTimerRef.current = null;
      }
      if (preBuildFallbackTimerRef.current) {
        clearTimeout(preBuildFallbackTimerRef.current);
        preBuildFallbackTimerRef.current = null;
      }
      currentPhaseRef.current = null;
      phaseHasSwappedRef.current = false;
      appTypeRef.current = resolveAppType(text);

      setIsBuilding(true);
      // BEO-378: show thinking dots immediately while the network round-trip completes.
      setMessages(prev => [
        // Drop any stale server_restarting card from the previous session
        ...prev.filter(m => m.type !== "server_restarting"),
        { id: makeId(), type: "user", content: text, timestamp: new Date() },
        { id: `thinking-${makeId()}`, type: "thinking" },
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
      // BEO-386: restore the build start time from sessionStorage so the elapsed
      // timer shows the correct value even after a navigation / remount.
      try {
        const ssKey = `beomz:buildStartedAt:${resolvedProjectIdRef.current}`;
        const stored = sessionStorage.getItem(ssKey);
        if (stored) {
          buildStartedAtRef.current = parseInt(stored, 10);
        }
      } catch { /* ignore */ }
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
