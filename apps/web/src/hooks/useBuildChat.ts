/**
 * useBuildChat — BEO-363 / BEO-391 / BEO-392 / BEO-393
 *
 * Owns all chat state + SSE event handling for the builder.
 * ProjectPage calls this hook and renders the returned messages.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  BuilderV3Event,
  ChatChecklistStatus,
  ChatMessage,
  StudioFile,
} from "@beomz-studio/contracts";
import {
  getBuildStatus,
  getLatestBuildForProject,
  NetworkDisconnectError,
  type BuildStatusResponse,
  type StartBuildResponse,
} from "../lib/api";
import { useBuilderEngineStream } from "./useBuilderEngineStream";
import { CHECKLIST_LABELS, PREAMBLE_FALLBACK } from "../lib/buildStatusCopy";

/** BEO-393: minimum time a checklist row stays ◌ before advancing to ✓ */
const CHECKLIST_MIN_DWELL_MS = 800;
/** BEO-393: cap artificial checklist drain before showing build_summary */
const SUMMARY_MAX_CHECKLIST_DRAIN_MS = 3200;

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function makeInitialChecklist(): { id: string; label: string; status: ChatChecklistStatus }[] {
  return [
    { id: "planning", label: CHECKLIST_LABELS.planning, status: "pending" },
    { id: "writing", label: CHECKLIST_LABELS.writing, status: "pending" },
    { id: "polishing", label: CHECKLIST_LABELS.polishing, status: "pending" },
    { id: "deploying", label: CHECKLIST_LABELS.deploying, status: "pending" },
  ];
}

function applyStageToChecklist(
  items: { id: string; label: string; status: ChatChecklistStatus }[],
  stageType: string,
): { id: string; label: string; status: ChatChecklistStatus }[] {
  const activeIdx: Record<string, number> = {
    stage_classifying: 0,
    stage_enriching: 0,
    stage_generating: 1,
    stage_sanitising: 2,
    stage_persisting: 2,
    stage_deploying: 3,
  };
  const idx = activeIdx[stageType];
  if (idx === undefined) return items;
  return items.map((item, i) => {
    if (i < idx) return { ...item, status: "done" as const };
    if (i === idx) return { ...item, status: "active" as const };
    return { ...item, status: "pending" as const };
  });
}

function markAllChecklistDone(
  items: { id: string; label: string; status: ChatChecklistStatus }[] | undefined,
): { id: string; label: string; status: ChatChecklistStatus }[] {
  const base = items ?? makeInitialChecklist();
  return base.map(i => ({ ...i, status: "done" as const }));
}

function markDeployingDone(
  items: { id: string; label: string; status: ChatChecklistStatus }[] | undefined,
): { id: string; label: string; status: ChatChecklistStatus }[] | undefined {
  if (!items) return items;
  return items.map(i =>
    i.id === "deploying" ? { ...i, status: "done" as const } : i,
  );
}

function markActiveFailed(
  items: { id: string; label: string; status: ChatChecklistStatus }[] | undefined,
): { id: string; label: string; status: ChatChecklistStatus }[] | undefined {
  if (!items) return items;
  return items.map(i =>
    i.status === "active" ? { ...i, status: "failed" as const } : i,
  );
}

function activeChecklistIndex(items: { status: ChatChecklistStatus }[]): number {
  return items.findIndex(i => i.status === "active");
}

function stepChecklistOnceTowardAllDone(
  items: { id: string; label: string; status: ChatChecklistStatus }[],
): { id: string; label: string; status: ChatChecklistStatus }[] {
  const activeIdx = activeChecklistIndex(items);
  if (activeIdx !== -1) {
    if (activeIdx < items.length - 1) {
      return items.map((item, i) => {
        if (i === activeIdx) return { ...item, status: "done" as const };
        if (i === activeIdx + 1) return { ...item, status: "active" as const };
        return item;
      });
    }
    return items.map((item, i) =>
      i === activeIdx ? { ...item, status: "done" as const } : item,
    );
  }
  const firstPending = items.findIndex(i => i.status === "pending");
  if (firstPending !== -1) {
    return items.map((item, i) =>
      i === firstPending ? { ...item, status: "active" as const } : item,
    );
  }
  return items;
}

function countNonDone(items: { status: ChatChecklistStatus }[]): number {
  return items.filter(i => i.status !== "done").length;
}

type BuildingMsg = Extract<ChatMessage, { type: "building" }>;

function findLiveBuildingIndex(prev: ChatMessage[], preferredId: string | null): number {
  if (preferredId) {
    const byId = prev.findIndex(
      m => m.id === preferredId && m.type === "building" && !(m as BuildingMsg).summary,
    );
    if (byId !== -1) return byId;
  }
  for (let i = prev.length - 1; i >= 0; i--) {
    const m = prev[i];
    if (m.type === "building" && !(m as BuildingMsg).summary) return i;
  }
  return -1;
}

function hasActiveToDoneTransition(
  visual: { status: ChatChecklistStatus }[],
  target: { status: ChatChecklistStatus }[],
): boolean {
  for (let i = 0; i < visual.length; i++) {
    if (visual[i]?.status === "active" && target[i]?.status === "done") return true;
  }
  return false;
}

function patchBuildingMessage(
  prev: ChatMessage[],
  buildingId: string | null,
  patch: (m: BuildingMsg) => BuildingMsg,
): ChatMessage[] {
  const idx = findLiveBuildingIndex(prev, buildingId);
  if (idx === -1) return prev;
  const next = [...prev];
  next[idx] = patch(next[idx] as BuildingMsg);
  return next;
}

// ─── Session-events → ChatMessage mapper (BEO-370) ───────────────────────────

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
      const rawNext = ev.nextSteps;
      let nextSteps: { label: string; prompt: string }[] | undefined;
      if (Array.isArray(rawNext)) {
        nextSteps = rawNext
          .map((row: unknown) => {
            if (!row || typeof row !== "object") return null;
            const r = row as Record<string, unknown>;
            const label = typeof r.label === "string" ? r.label : "";
            const prompt = typeof r.prompt === "string" ? r.prompt : "";
            if (!label || !prompt) return null;
            return { label, prompt };
          })
          .filter((x): x is { label: string; prompt: string } => x !== null);
        if (nextSteps.length === 0) nextSteps = undefined;
      }
      result.push({
        id: makeId(),
        type: "build_summary",
        content,
        filesChanged: Array.isArray(ev.filesChanged) ? ev.filesChanged.map(String) : [],
        durationMs: typeof ev.durationMs === "number" ? ev.durationMs : undefined,
        creditsUsed: typeof ev.creditsUsed === "number" ? ev.creditsUsed : undefined,
        nextSteps,
      });
    }
  }
  return result;
}

export interface UseBuildChatOptions {
  onEvent?: (event: BuilderV3Event) => void;
  onProjectIdResolved?: (projectId: string, projectName: string, projectIcon: string | null) => void;
  onBuildStatus?: (status: BuildStatusResponse) => void;
  onBuildStarted?: (response: StartBuildResponse) => void;
}

export function useBuildChat(projectId: string, options: UseBuildChatOptions = {}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isBuilding, setIsBuilding] = useState(false);

  const buildDoneRef = useRef(false);
  const lastUserPromptRef = useRef("");
  const activeBuildingMsgIdRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const buildStartedAtRef = useRef<number | null>(null);
  const existingFilesRef = useRef<readonly StudioFile[]>([]);
  const resolvedProjectIdRef = useRef(
    projectId && projectId !== "new" ? projectId : "",
  );
  const lastEventBuildIdRef = useRef<string | null>(null);

  const preambleFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stageKickoffTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const checklistDwellRef = useRef<{
    timer: ReturnType<typeof setTimeout> | null;
    activeSince: number | null;
  }>({ timer: null, activeSince: null });
  const latestStageChecklistRef = useRef<ReturnType<typeof makeInitialChecklist> | null>(null);
  const latestStagePhaseRef = useRef<string | undefined>(undefined);
  const summaryDrainTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  const clearPreambleAndStageTimers = useCallback(() => {
    if (preambleFallbackTimerRef.current) {
      clearTimeout(preambleFallbackTimerRef.current);
      preambleFallbackTimerRef.current = null;
    }
    if (stageKickoffTimerRef.current) {
      clearTimeout(stageKickoffTimerRef.current);
      stageKickoffTimerRef.current = null;
    }
    if (checklistDwellRef.current.timer) {
      clearTimeout(checklistDwellRef.current.timer);
      checklistDwellRef.current.timer = null;
    }
    checklistDwellRef.current.activeSince = null;
    if (summaryDrainTimerRef.current) {
      clearTimeout(summaryDrainTimerRef.current);
      summaryDrainTimerRef.current = null;
    }
  }, []);

  // ─── Persist in-flight building UI (BEO-391) ───────────────────────────────
  useEffect(() => {
    const pid = resolvedProjectIdRef.current;
    if (!pid) return;
    const bid = activeBuildingMsgIdRef.current;
    const building = messages.find(m => m.id === bid && m.type === "building") as BuildingMsg | undefined;
    if (!building || building.summary) {
      try {
        sessionStorage.removeItem(`beomz:buildingUi:${pid}`);
      } catch { /* ignore */ }
      return;
    }
    try {
      sessionStorage.setItem(
        `beomz:buildingUi:${pid}`,
        JSON.stringify({
          buildId: lastEventBuildIdRef.current,
          lastUserPrompt: lastUserPromptRef.current,
          building,
        }),
      );
    } catch { /* ignore */ }
  }, [messages]);

  // ─── Seed chat history from session_events on mount (BEO-370) ─────────────
  const historySeededRef = useRef(false);
  useEffect(() => {
    const pid = resolvedProjectIdRef.current;
    if (!pid || historySeededRef.current) return;
    historySeededRef.current = true;
    void getLatestBuildForProject(pid)
      .then(status => {
        if (!status) return;
        if (status.build.status !== "completed" && status.build.status !== "failed") return;
        const events = status.build.sessionEvents;
        if (!events?.length) return;
        setMessages(prev => (prev.length > 0 ? prev : mapSessionEventsToMessages(events)));
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { startAndStreamBuild, subscribeToBuild } = useBuilderEngineStream();

  const notifyPreviewServerReady = useCallback(() => {
    setMessages(prev =>
      patchBuildingMessage(prev, activeBuildingMsgIdRef.current, b => {
        if (b.summary) return b;
        return {
          ...b,
          checklist: markDeployingDone(b.checklist),
          phase: "preview_ready",
        };
      }),
    );
  }, []);

  const handleEvent = useCallback(
    (event: BuilderV3Event) => {
      if ("buildId" in event && typeof event.buildId === "string" && event.buildId) {
        lastEventBuildIdRef.current = event.buildId;
      }

      optionsRef.current.onEvent?.(event);

      switch (event.type) {
        case "intent_detected":
          break;

        case "pre_build_ack": {
          const now = Date.now();
          buildStartedAtRef.current = now;
          try {
            sessionStorage.setItem(`beomz:buildStartedAt:${resolvedProjectIdRef.current}`, String(now));
          } catch { /* ignore */ }

          clearPreambleAndStageTimers();
          checklistDwellRef.current.activeSince = null;
          latestStageChecklistRef.current = null;
          latestStagePhaseRef.current = undefined;

          const ackBuildingId = makeId();
          activeBuildingMsgIdRef.current = ackBuildingId;
          const checklist = makeInitialChecklist();
          const ackBuildStartedAt = buildStartedAtRef.current ?? undefined;

          // BEO-392: one card — ack + checklist + preamble live on the same `building` message.
          setMessages(prev => [
            ...prev.filter(m => m.type !== "thinking"),
            {
              id: ackBuildingId,
              type: "building",
              phase: "acknowledged",
              ackMessage: event.message,
              checklist,
              buildStartedAt: ackBuildStartedAt,
            },
          ]);

          preambleFallbackTimerRef.current = setTimeout(() => {
            setMessages(prev =>
              patchBuildingMessage(prev, activeBuildingMsgIdRef.current, b => {
                if (b.preamble) return b;
                return {
                  ...b,
                  preamble: {
                    restatement: PREAMBLE_FALLBACK.restatement,
                    bullets: [...PREAMBLE_FALLBACK.bullets],
                  },
                  preambleIsFallback: true,
                };
              }),
            );
          }, 5_000);

          stageKickoffTimerRef.current = setTimeout(() => {
            setMessages(prev =>
              patchBuildingMessage(prev, activeBuildingMsgIdRef.current, b => {
                if (!b.checklist) return b;
                const stuck = b.checklist.every(i => i.status === "pending");
                if (!stuck) return b;
                const checklist = applyStageToChecklist(b.checklist, "stage_classifying");
                checklistDwellRef.current.activeSince =
                  activeChecklistIndex(checklist) >= 0 ? Date.now() : null;
                return {
                  ...b,
                  checklist,
                  phase: "classifying",
                };
              }),
            );
          }, 5_000);
          break;
        }

        case "stage_preamble": {
          if (preambleFallbackTimerRef.current) {
            clearTimeout(preambleFallbackTimerRef.current);
            preambleFallbackTimerRef.current = null;
          }
          setMessages(prev => {
            const next = patchBuildingMessage(prev, activeBuildingMsgIdRef.current, b => ({
              ...b,
              preamble: { restatement: event.restatement, bullets: [...event.bullets] },
              preambleIsFallback: false,
            }));
            const li = findLiveBuildingIndex(next, null);
            if (li !== -1) activeBuildingMsgIdRef.current = next[li].id;
            return next;
          });
          break;
        }

        case "conversational_response":
          clearPreambleAndStageTimers();
          setMessages(prev => [
            ...prev.filter(m => m.type !== "thinking"),
            { id: makeId(), type: "question_answer", content: event.message, streaming: false },
          ]);
          setIsBuilding(false);
          break;

        case "clarifying_question":
          clearPreambleAndStageTimers();
          setMessages(prev => [
            ...prev.filter(m => m.type !== "thinking"),
            { id: makeId(), type: "clarifying_question", content: event.message },
          ]);
          break;

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
            const buildStartedAt = buildStartedAtRef.current ?? undefined;

            const idx = findLiveBuildingIndex(prev, buildingId);
            if (idx !== -1) {
              const existing = prev[idx] as BuildingMsg;
              if (existing.summary) return prev;
              activeBuildingMsgIdRef.current = existing.id;
              const next = [...prev];
              next[idx] = {
                ...existing,
                phase: existing.phase ?? phase,
                filesWritten,
                totalFiles,
                buildStartedAt,
              };
              return next;
            }

            const id = makeId();
            activeBuildingMsgIdRef.current = id;
            return [
              ...prev,
              {
                id,
                type: "building",
                phase,
                checklist: makeInitialChecklist(),
                filesWritten,
                totalFiles,
                buildStartedAt,
              },
            ];
          });
          break;
        }

        case "next_steps": {
          const raw = event.suggestions ?? [];
          const nextSteps = raw.map(s => ({ label: s.label, prompt: s.prompt }));
          setMessages(prev => {
            const bid = activeBuildingMsgIdRef.current;
            const byActiveId = patchBuildingMessage(prev, bid, b => ({ ...b, nextSteps }));
            if (byActiveId !== prev) return byActiveId;
            const liveIdx = prev.findIndex(m => m.type === "building" && (m as BuildingMsg).summary);
            if (liveIdx !== -1) {
              const next = [...prev];
              next[liveIdx] = { ...(next[liveIdx] as BuildingMsg), nextSteps };
              return next;
            }
            return prev.map(m => {
              if (m.type !== "build_summary") return m;
              return { ...m, nextSteps };
            });
          });
          break;
        }

        case "build_summary": {
          clearPreambleAndStageTimers();
          try {
            sessionStorage.removeItem(`beomz:buildStartedAt:${resolvedProjectIdRef.current}`);
            sessionStorage.removeItem(`beomz:buildingUi:${resolvedProjectIdRef.current}`);
          } catch { /* ignore */ }
          buildStartedAtRef.current = null;

          const frozenAt = Date.now();
          const bid = activeBuildingMsgIdRef.current;
          latestStageChecklistRef.current = null;
          latestStagePhaseRef.current = undefined;

          const pushOrphanSummary = (prev: ChatMessage[]): ChatMessage[] => [
            ...prev.filter(m => m.type !== "building"),
            {
              id: makeId(),
              type: "build_summary",
              content: event.message,
              filesChanged: event.filesChanged,
              durationMs: event.durationMs,
              creditsUsed: event.creditsUsed,
            },
          ];

          const finalizeBuilding = (prev: ChatMessage[], idx: number): ChatMessage[] => {
            const next = [...prev];
            const existing = next[idx] as BuildingMsg;
            next[idx] = {
              ...existing,
              checklist: markAllChecklistDone(existing.checklist),
              summary: {
                content: event.message,
                filesChanged: event.filesChanged,
                durationMs: event.durationMs,
                creditsUsed: event.creditsUsed,
              },
              buildFrozenAt: frozenAt,
              phase: "completed",
            };
            return next;
          };

          const drainStartedAt = Date.now();

          const runDrainStep = () => {
            summaryDrainTimerRef.current = null;
            setMessages(prev => {
              const j = findLiveBuildingIndex(prev, activeBuildingMsgIdRef.current);
              if (j === -1) return pushOrphanSummary(prev);
              const b = prev[j] as BuildingMsg;
              if (b.summary) return prev;
              const checklist = b.checklist ?? makeInitialChecklist();
              if (checklist.every(i => i.status === "done")) {
                return finalizeBuilding(prev, j);
              }
              const stepped = stepChecklistOnceTowardAllDone(checklist);
              const next = [...prev];
              next[j] = { ...b, checklist: stepped };
              if (stepped.every(i => i.status === "done")) {
                return finalizeBuilding(next, j);
              }
              const elapsed = Date.now() - drainStartedAt;
              const budget = SUMMARY_MAX_CHECKLIST_DRAIN_MS - elapsed;
              const remaining = countNonDone(stepped);
              const delay = Math.min(
                CHECKLIST_MIN_DWELL_MS,
                Math.max(16, remaining > 0 ? budget / remaining : 16),
              );
              summaryDrainTimerRef.current = setTimeout(runDrainStep, delay);
              return next;
            });
          };

          setMessages(prev => {
            if (!bid) return pushOrphanSummary(prev);
            const idx = findLiveBuildingIndex(prev, bid);
            if (idx === -1) return pushOrphanSummary(prev);

            const existing = prev[idx] as BuildingMsg;
            const cl = existing.checklist ?? makeInitialChecklist();
            if (cl.every(i => i.status === "done")) {
              return finalizeBuilding(prev, idx);
            }

            const stepped = stepChecklistOnceTowardAllDone(cl);
            const first = [...prev];
            first[idx] = { ...existing, checklist: stepped };
            if (stepped.every(i => i.status === "done")) {
              return finalizeBuilding(first, idx);
            }
            const elapsed = Date.now() - drainStartedAt;
            const budget = SUMMARY_MAX_CHECKLIST_DRAIN_MS - elapsed;
            const remaining = countNonDone(stepped);
            const delay = Math.min(
              CHECKLIST_MIN_DWELL_MS,
              Math.max(16, remaining > 0 ? budget / remaining : 16),
            );
            summaryDrainTimerRef.current = setTimeout(runDrainStep, delay);
            return first;
          });
          break;
        }

        case "done":
          if (event.fallbackUsed) {
            buildDoneRef.current = false;
            clearPreambleAndStageTimers();
            try {
              sessionStorage.removeItem(`beomz:buildStartedAt:${resolvedProjectIdRef.current}`);
              sessionStorage.removeItem(`beomz:buildingUi:${resolvedProjectIdRef.current}`);
            } catch { /* ignore */ }
            const frozenAtFallback = Date.now();
            const frozenBuildIdFallback = activeBuildingMsgIdRef.current;
            setMessages(prev => {
              const mapped = frozenBuildIdFallback
                ? patchBuildingMessage(prev, frozenBuildIdFallback, b => ({
                    ...b,
                    checklist: markActiveFailed(b.checklist),
                    buildFrozenAt: frozenAtFallback,
                  }))
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
            clearPreambleAndStageTimers();
            try {
              sessionStorage.removeItem(`beomz:buildStartedAt:${resolvedProjectIdRef.current}`);
            } catch { /* ignore */ }
            buildStartedAtRef.current = null;
            if (!event.conversational) {
              void getBuildStatus(event.buildId)
                .then(status => {
                  existingFilesRef.current = status.result?.files ?? [];
                  optionsRef.current.onBuildStatus?.(status);
                  const se = status.build.sessionEvents;
                  if (Array.isArray(se)) {
                    const summaryEv = se.find(e => e.type === "build_summary");
                    if (summaryEv) {
                      setMessages(prev => {
                        if (prev.some(m => m.type === "build_summary")) return prev;
                        if (prev.some(m => m.type === "building" && (m as BuildingMsg).summary))
                          return prev;
                        const frozenAt = Date.now();
                        const liveBuildingIdx = prev.findIndex(
                          m => m.type === "building" && !(m as BuildingMsg).summary,
                        );
                        if (liveBuildingIdx !== -1) {
                          const next = [...prev];
                          const existing = next[liveBuildingIdx] as BuildingMsg;
                          next[liveBuildingIdx] = {
                            ...existing,
                            checklist: markAllChecklistDone(existing.checklist),
                            summary: {
                              content:
                                typeof summaryEv.content === "string" ? summaryEv.content : "",
                              filesChanged: Array.isArray(summaryEv.filesChanged)
                                ? summaryEv.filesChanged.map(String)
                                : [],
                              durationMs:
                                typeof summaryEv.durationMs === "number"
                                  ? summaryEv.durationMs
                                  : undefined,
                              creditsUsed:
                                typeof summaryEv.creditsUsed === "number"
                                  ? summaryEv.creditsUsed
                                  : undefined,
                            },
                            buildFrozenAt: frozenAt,
                            phase: "completed",
                          };
                          return next;
                        }
                        return [
                          ...prev.filter(m => m.type !== "building"),
                          {
                            id: makeId(),
                            type: "build_summary" as const,
                            content: typeof summaryEv.content === "string" ? summaryEv.content : "",
                            filesChanged: Array.isArray(summaryEv.filesChanged)
                              ? summaryEv.filesChanged.map(String)
                              : [],
                            durationMs:
                              typeof summaryEv.durationMs === "number" ? summaryEv.durationMs : undefined,
                            creditsUsed:
                              typeof summaryEv.creditsUsed === "number"
                                ? summaryEv.creditsUsed
                                : undefined,
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
          clearPreambleAndStageTimers();
          if (event.code === "server_restarting") {
            buildDoneRef.current = false;
            try {
              sessionStorage.removeItem(`beomz:buildStartedAt:${resolvedProjectIdRef.current}`);
              sessionStorage.removeItem(`beomz:buildingUi:${resolvedProjectIdRef.current}`);
            } catch { /* ignore */ }
            const frozenAtRestart = Date.now();
            const frozenBuildIdRestart = activeBuildingMsgIdRef.current;
            setMessages(prev => {
              const mapped = frozenBuildIdRestart
                ? patchBuildingMessage(prev, frozenBuildIdRestart, b => ({
                    ...b,
                    checklist: markActiveFailed(b.checklist),
                    buildFrozenAt: frozenAtRestart,
                  }))
                : prev;
              if (mapped.some(m => m.type === "server_restarting")) return mapped;
              return [...mapped, { id: makeId(), type: "server_restarting" }];
            });
          } else {
            try {
              sessionStorage.removeItem(`beomz:buildStartedAt:${resolvedProjectIdRef.current}`);
              sessionStorage.removeItem(`beomz:buildingUi:${resolvedProjectIdRef.current}`);
            } catch { /* ignore */ }
            const frozenAtErr = Date.now();
            const frozenBuildIdErr = activeBuildingMsgIdRef.current;
            setMessages(prev => {
              const mapped = frozenBuildIdErr
                ? patchBuildingMessage(prev, frozenBuildIdErr, b => ({
                    ...b,
                    checklist: markActiveFailed(b.checklist),
                    buildFrozenAt: frozenAtErr,
                  }))
                : prev;
              return [...mapped, { id: makeId(), type: "error", content: event.message, code: event.code }];
            });
          }
          setIsBuilding(false);
          activeBuildingMsgIdRef.current = null;
          break;

        case "stage_classifying":
        case "stage_enriching":
        case "stage_generating":
        case "stage_sanitising":
        case "stage_persisting":
        case "stage_deploying": {
          if (stageKickoffTimerRef.current) {
            clearTimeout(stageKickoffTimerRef.current);
            stageKickoffTimerRef.current = null;
          }
          const buildStartedAt = buildStartedAtRef.current ?? undefined;
          const phase = event.stage;
          setMessages(prev => {
            const buildingId = activeBuildingMsgIdRef.current;
            const idx = findLiveBuildingIndex(prev, buildingId);
            if (idx !== -1) {
              activeBuildingMsgIdRef.current = (prev[idx] as BuildingMsg).id;
              const existing = prev[idx] as BuildingMsg;
              if (existing.summary) return prev;

              const visual = existing.checklist ?? makeInitialChecklist();
              const target = applyStageToChecklist(visual, event.type);
              latestStageChecklistRef.current = target;
              latestStagePhaseRef.current = phase;

              const needDwell =
                hasActiveToDoneTransition(visual, target) &&
                checklistDwellRef.current.activeSince != null &&
                Date.now() - checklistDwellRef.current.activeSince < CHECKLIST_MIN_DWELL_MS;

              if (needDwell) {
                const wait =
                  CHECKLIST_MIN_DWELL_MS -
                  (Date.now() - (checklistDwellRef.current.activeSince as number));
                if (checklistDwellRef.current.timer) {
                  clearTimeout(checklistDwellRef.current.timer);
                }
                checklistDwellRef.current.timer = setTimeout(() => {
                  checklistDwellRef.current.timer = null;
                  setMessages(p2 => {
                    const j = findLiveBuildingIndex(p2, activeBuildingMsgIdRef.current);
                    if (j === -1) return p2;
                    const ex = p2[j] as BuildingMsg;
                    if (ex.summary) return p2;
                    const latest =
                      latestStageChecklistRef.current ??
                      ex.checklist ??
                      makeInitialChecklist();
                    const ph = latestStagePhaseRef.current ?? ex.phase;
                    const next = [...p2];
                    const oldA = activeChecklistIndex(ex.checklist ?? makeInitialChecklist());
                    const newA = activeChecklistIndex(latest);
                    if (oldA !== newA || (oldA === -1 && newA !== -1)) {
                      checklistDwellRef.current.activeSince = newA >= 0 ? Date.now() : null;
                    }
                    next[j] = {
                      ...ex,
                      checklist: latest,
                      phase: ph,
                      buildStartedAt: buildStartedAtRef.current ?? ex.buildStartedAt,
                    };
                    return next;
                  });
                }, wait);

                const next = [...prev];
                next[idx] = {
                  ...existing,
                  phase,
                  buildStartedAt,
                  checklist: visual,
                };
                return next;
              }

              const next = [...prev];
              const oldA = activeChecklistIndex(visual);
              const newA = activeChecklistIndex(target);
              if (oldA !== newA || (oldA === -1 && newA !== -1)) {
                checklistDwellRef.current.activeSince = newA >= 0 ? Date.now() : null;
              }
              next[idx] = {
                ...existing,
                phase,
                checklist: target,
                buildStartedAt,
              };
              return next;
            }

            const id = makeId();
            activeBuildingMsgIdRef.current = id;
            const initialTarget = applyStageToChecklist(makeInitialChecklist(), event.type);
            checklistDwellRef.current.activeSince =
              activeChecklistIndex(initialTarget) >= 0 ? Date.now() : null;
            latestStageChecklistRef.current = initialTarget;
            latestStagePhaseRef.current = phase;
            return [
              ...prev,
              {
                id,
                type: "building",
                phase,
                checklist: initialTarget,
                buildStartedAt,
              },
            ];
          });
          break;
        }

        default:
          break;
      }
    },
    [clearPreambleAndStageTimers],
  );

  const sendMessage = useCallback(
    (text: string) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      lastUserPromptRef.current = text;
      buildDoneRef.current = false;
      activeBuildingMsgIdRef.current = null;
      buildStartedAtRef.current = null;
      try {
        sessionStorage.removeItem(`beomz:buildStartedAt:${resolvedProjectIdRef.current}`);
        sessionStorage.removeItem(`beomz:buildingUi:${resolvedProjectIdRef.current}`);
      } catch { /* ignore */ }

      clearPreambleAndStageTimers();

      setIsBuilding(true);
      setMessages(prev => [
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
          lastEventBuildIdRef.current = response.build.id;
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
    [startAndStreamBuild, handleEvent, clearPreambleAndStageTimers],
  );

  const retryLastBuild = useCallback(() => {
    const prompt = lastUserPromptRef.current;
    if (!prompt) return;
    setMessages(prev =>
      prev.filter(m => m.type !== "error" && m.type !== "server_restarting"),
    );
    sendMessage(prompt);
  }, [sendMessage]);

  const subscribeToExistingBuild = useCallback(
    async (buildId: string, lastEventId: string | null, signal: AbortSignal) => {
      buildDoneRef.current = false;
      setIsBuilding(true);
      lastEventBuildIdRef.current = buildId;

      try {
        const ssKey = `beomz:buildStartedAt:${resolvedProjectIdRef.current}`;
        const stored = sessionStorage.getItem(ssKey);
        if (stored) {
          buildStartedAtRef.current = parseInt(stored, 10);
        }
      } catch { /* ignore */ }

      try {
        const raw = sessionStorage.getItem(`beomz:buildingUi:${resolvedProjectIdRef.current}`);
        if (raw) {
          const snap = JSON.parse(raw) as {
            buildId?: string;
            lastUserPrompt?: string;
            building?: BuildingMsg;
          };
          const restored = snap.building;
          if (
            snap.buildId === buildId &&
            restored?.type === "building" &&
            !restored.summary
          ) {
            activeBuildingMsgIdRef.current = restored.id;
            setMessages(prev => {
              if (prev.length > 0) return prev;
              const prompt = snap.lastUserPrompt ?? "";
              return [
                { id: makeId(), type: "user", content: prompt, timestamp: new Date() },
                restored,
              ];
            });
          }
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
    subscribeToExistingBuild,
    notifyPreviewServerReady,
  };
}
