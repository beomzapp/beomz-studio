/**
 * useBuildChat — BEO-363 / BEO-391 / BEO-392 / BEO-393 / BEO-396 / BEO-495
 *
 * Owns all chat state + SSE event handling for the builder.
 * ProjectPage calls this hook and renders the returned messages.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  BuilderV3ConversationalResponseEvent,
  BuilderV3Event,
  ChatChecklistStatus,
  ChatMessage,
  StudioFile,
} from "@beomz-studio/contracts";
import {
  getAccessToken,
  getApiBaseUrl,
  getBuildStatus,
  getLatestBuildForProject,
  NetworkDisconnectError,
  type BuildStatusResponse,
  type StartBuildResponse,
} from "../lib/api";
import { useBuilderEngineStream } from "./useBuilderEngineStream";
import { CHECKLIST_LABELS, PREAMBLE_FALLBACK } from "../lib/buildStatusCopy";

// ─── BEO-396: Chat mode flag ───────────────────────────────────────────────────
// Set to `true` to use the local mock (Codex backend not yet live).
// Flip to `false` once /api/builds/chat and /api/builds/summarise-chat are deployed.
const MOCK_CHAT_MODE = false;

/** Phrases that mean "go build the plan we discussed" (BEO-197 / BEO-202). */
const BUILD_CONFIRMATIONS = [
  "build it",
  "build this",
  "let's go",
  "lets go",
  "do it",
  "go ahead",
  "implement this",
  "implement it",
  "yes build",
  "ready",
  "go for it",
  "make it",
  "create it",
  "just build it",
];

function isBuildConfirmation(message: string): boolean {
  const clean = message.trim().toLowerCase();
  return (
    BUILD_CONFIRMATIONS.some(phrase => clean.includes(phrase))
    || clean === "yes"
    || clean === "yep"
    || clean === "sure"
    || clean === "ok"
    || clean === "okay"
    || clean === "go"
  );
}

/** BEO-495: if the model spells out a plan with this lead-in, show ImplementBar (SSE-agnostic). */
const PLAN_TRIGGER_PHRASE = "here's what i'll do:";

function shouldShowImplementFromAssistantContent(content: string | undefined): boolean {
  return Boolean(content?.toLowerCase().includes(PLAN_TRIGGER_PHRASE));
}

// ─── BEO-496: Iteration preamble detection ────────────────────────────────────
const ITERATION_PHRASES = ["on it", "got it", "making that", "fixing that", "updating"] as const;

function isIterationPreamble(restatement: string): boolean {
  const lower = restatement.toLowerCase();
  return restatement.length < 60 || ITERATION_PHRASES.some(p => lower.includes(p));
}

type ChatApiMessage = { role: "user" | "assistant"; content: string };

function buildChatThread(messages: ChatMessage[]): ChatApiMessage[] {
  const result: ChatApiMessage[] = [];
  for (const m of messages) {
    if (m.type === "user") result.push({ role: "user", content: m.content });
    else if (m.type === "chat_response") result.push({ role: "assistant", content: m.content });
  }
  return result;
}

function countUserMessages(messages: ChatMessage[]): number {
  return messages.filter(m => m.type === "user").length;
}

// ─── Mock chat responses ───────────────────────────────────────────────────────

const MOCK_EARLY_RESPONSES = [
  "Got it! What's the main problem this app needs to solve? And who's the primary user?",
  "Makes sense. What's the single most important action a user should be able to take in this app?",
  "Good. Any design preferences — minimal and clean, data-heavy, mobile-first?",
];

const MOCK_IMPLEMENT_SUMMARY_TEMPLATE = (thread: string) =>
  `Based on our conversation: ${thread.slice(0, 120).trim()}... Build a clean, focused app with the features discussed.`;

async function mockStreamChatResponse(
  _text: string,
  messages: ChatMessage[],
  onDelta: (delta: string) => void,
  onImplementSuggestion: (summary: string) => void,
): Promise<void> {
  const userCount = countUserMessages(messages);

  if (userCount >= 2) {
    // After 2 exchanges, suggest implementing
    const thread = buildChatThread(messages)
      .map(m => m.content)
      .join(" ");
    const summary = MOCK_IMPLEMENT_SUMMARY_TEMPLATE(thread);
    const response = `I think I have enough to build this — want me to go ahead?\n\n${summary.replace("Based on our conversation: ", "I'll ")}`;

    // Stream the response
    await streamChars(response, onDelta);

    // Then fire implement_suggestion
    await delay(400);
    onImplementSuggestion(summary);
  } else {
    const reply =
      MOCK_EARLY_RESPONSES[userCount % MOCK_EARLY_RESPONSES.length] ??
      "Tell me more about what you have in mind.";
    await streamChars(reply, onDelta);
  }
}

async function mockSummariseChatThread(thread: ChatApiMessage[]): Promise<string> {
  await delay(600);
  const userParts = thread.filter(m => m.role === "user").map(m => m.content);
  return userParts.join(". ").slice(0, 300).trim() || "Build the app we discussed.";
}

function streamChars(text: string, onDelta: (delta: string) => void): Promise<void> {
  return new Promise(resolve => {
    const chars = text.split("");
    let i = 0;
    const tick = () => {
      // Send 2-4 chars at a time for realistic feel
      const chunk = chars.slice(i, i + 3).join("");
      if (!chunk) {
        resolve();
        return;
      }
      onDelta(chunk);
      i += 3;
      setTimeout(tick, 18 + Math.random() * 12);
    };
    setTimeout(tick, 50);
  });
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** BEO-393: minimum time a checklist row stays ◌ before advancing to ✓ */
const CHECKLIST_MIN_DWELL_MS = 2000;
/** BEO-393: cap artificial checklist drain before showing build_summary */
const SUMMARY_MAX_CHECKLIST_DRAIN_MS = 6000;

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
  /** BEO-439: called when credits are insufficient. isHardBlock=true = build blocked before start; false = exhausted mid-session */
  onOutOfCredits?: (isHardBlock: boolean) => void;
}

export function useBuildChat(projectId: string, options: UseBuildChatOptions = {}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isBuilding, setIsBuilding] = useState(false);
  // BEO-462: true while API is analysing an uploaded image (before image_intent SSE)
  const [isAnalysingImage, setIsAnalysingImage] = useState(false);
  // BEO-496: true when the current build is detected as an iteration (short preamble)
  const [isIterationBuild, setIsIterationBuild] = useState(false);
  const isIterationBuildRef = useRef(false);
  // BEO-496: mirrors isBuilding so event handlers can guard without stale closures
  const isBuildInProgressRef = useRef(false);

  // ─── BEO-396: Chat mode ───────────────────────────────────────────────────
  const [chatModeActive, setChatModeActive] = useState(false);
  const chatModeRef = useRef(false);
  const activeChatMsgIdRef = useRef<string | null>(null);
  const chatAbortRef = useRef<AbortController | null>(null);
  /** Latest plan for ⚡ Implement from SSE (chat or /builds/start conversational_response). */
  const pendingImplementPlanRef = useRef<string | null>(null);
  const implementWithPlanRef = useRef<((plan: string, imageUrl?: string) => Promise<void>) | null>(null);

  // ─── BEO-398: Sticky implement suggestion zone ────────────────────────────
  const [implementSuggestion, setImplementSuggestion] = useState<{ summary: string } | null>(null);

  const dismissImplementSuggestion = useCallback(() => {
    setImplementSuggestion(null);
  }, []);

  const toggleChatMode = useCallback(() => {
    setChatModeActive(prev => {
      const next = !prev;
      chatModeRef.current = next;
      return next;
    });
  }, []);

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
  // BEO-399: set true when server-ready fires before prior checklist items finish dwell
  const serverReadyPendingRef = useRef(false);

  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  // BEO-410: keep chatModeRef in sync with chatModeActive state so stale
  // closures can never route a chat-mode message into the build pipeline.
  useEffect(() => {
    chatModeRef.current = chatModeActive;
  }, [chatModeActive]);

  // BEO-496: keep isBuildInProgressRef in sync so event-handler closures can read it without stale values.
  useEffect(() => {
    isBuildInProgressRef.current = isBuilding;
  }, [isBuilding]);

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
    serverReadyPendingRef.current = false;
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

  // ─── BEO-447: persist chat messages to localStorage ───────────────────────
  useEffect(() => {
    const pid = resolvedProjectIdRef.current;
    if (!pid) return;
    // Filter out ephemeral / in-flight messages before persisting
    const persistable = messages.filter(m => {
      if (m.type === "thinking") return false;
      if (m.type === "server_restarting") return false;
      // Only keep building messages that have completed (have a summary)
      if (m.type === "building") return !!(m as BuildingMsg).summary;
      // Only keep chat responses that are fully streamed
      if (m.type === "chat_response")
        return !(m as Extract<ChatMessage, { type: "chat_response" }>).streaming;
      return true;
    });
    if (persistable.length === 0) return;
    try {
      localStorage.setItem(`chat:${pid}`, JSON.stringify(persistable.slice(-20)));
    } catch { /* quota exceeded — ignore */ }
  }, [messages]);

  // ─── BEO-447: restore chat from localStorage on mount (fast path) ─────────
  useEffect(() => {
    const pid = projectId !== "new" ? projectId : "";
    if (!pid) return;
    try {
      const saved = localStorage.getItem(`chat:${pid}`);
      if (!saved) return;
      const parsed = JSON.parse(saved) as ChatMessage[];
      if (!Array.isArray(parsed) || parsed.length === 0) return;
      setMessages(prev => (prev.length > 0 ? prev : parsed));
    } catch { /* corrupted data — ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        // BEO-399: defer if any prior checklist item is still active/pending
        const checklist = b.checklist;
        const deployingIdx = checklist ? checklist.findIndex(i => i.id === "deploying") : -1;
        const priorAllDone =
          deployingIdx <= 0 ||
          !checklist ||
          checklist.slice(0, deployingIdx).every(i => i.status === "done");
        if (!priorAllDone) {
          serverReadyPendingRef.current = true;
          return b;
        }
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

        // BEO-464: API confirms this is a real build — NOW start the shimmer.
        // Removes thinking dots so BuildingShimmer takes over cleanly.
        // BEO-478: clear the floating ImplementBar — build has started.
        case "build_confirmed":
          setIsBuilding(true);
          setImplementSuggestion(null);
          setMessages(prev => prev.filter(m => m.type !== "thinking"));
          break;

        case "insufficient_credits": {
          // BEO-439: hard block — build was rejected before starting due to insufficient credits
          setIsBuilding(false);
          activeBuildingMsgIdRef.current = null;
          optionsRef.current.onOutOfCredits?.(true);
          break;
        }

        case "pre_build_ack": {
          // BEO-392: record internal state only — NO message pushed to chat.
          // BuildingShimmer will display (isBuilding && !hasBuildingMessage).
          // The first real message card is created when stage_preamble arrives.
          // BEO-464: isBuilding is set only on build_confirmed — avoids preview progress bar
          // and other "build in flight" UI during conversational / classify-only turns.
          const now = Date.now();
          buildStartedAtRef.current = now;
          try {
            sessionStorage.setItem(`beomz:buildStartedAt:${resolvedProjectIdRef.current}`, String(now));
          } catch { /* ignore */ }

          clearPreambleAndStageTimers();
          checklistDwellRef.current.activeSince = null;
          latestStageChecklistRef.current = null;
          latestStagePhaseRef.current = undefined;

          // BEO-496: reset iteration detection at the start of each build
          isIterationBuildRef.current = false;
          setIsIterationBuild(false);

          // Pre-allocate ID so stage_preamble can use it without racing
          const pendingBuildId = makeId();
          activeBuildingMsgIdRef.current = pendingBuildId;

          // Drop the thinking indicator — BuildingShimmer takes over
          setMessages(prev => prev.filter(m => m.type !== "thinking"));

          // Safety net: if stage_preamble never fires in 5s, create the card ourselves
          preambleFallbackTimerRef.current = setTimeout(() => {
            preambleFallbackTimerRef.current = null;
            setMessages(prev => {
              if (findLiveBuildingIndex(prev, activeBuildingMsgIdRef.current) !== -1) return prev;
              const id = activeBuildingMsgIdRef.current ?? makeId();
              activeBuildingMsgIdRef.current = id;
              const cl = applyStageToChecklist(makeInitialChecklist(), "stage_classifying");
              checklistDwellRef.current.activeSince = activeChecklistIndex(cl) >= 0 ? Date.now() : null;
              return [
                ...prev,
                {
                  id,
                  type: "building" as const,
                  phase: "classifying",
                  preamble: {
                    restatement: PREAMBLE_FALLBACK.restatement,
                    bullets: [...PREAMBLE_FALLBACK.bullets],
                  },
                  preambleIsFallback: true,
                  checklist: cl,
                  buildStartedAt: buildStartedAtRef.current ?? undefined,
                },
              ];
            });
          }, 5_000);
          break;
        }

        case "stage_preamble": {
          if (preambleFallbackTimerRef.current) {
            clearTimeout(preambleFallbackTimerRef.current);
            preambleFallbackTimerRef.current = null;
          }
          // BEO-462: a real build is starting — no longer just image analysis
          setIsAnalysingImage(false);
          // BEO-496: detect iteration mode from the preamble restatement
          const iterationDetected = isIterationPreamble(event.restatement);
          if (isIterationBuildRef.current !== iterationDetected) {
            isIterationBuildRef.current = iterationDetected;
            setIsIterationBuild(iterationDetected);
          }
          if (iterationDetected) {
            // Suppress any ImplementBar that was showing before the iteration started
            setImplementSuggestion(null);
          }
          setMessages(prev => {
            const idx = findLiveBuildingIndex(prev, activeBuildingMsgIdRef.current);
            if (idx !== -1) {
              // Card already exists (e.g. restored from session or race): patch in-place
              const next = [...prev];
              next[idx] = {
                ...(next[idx] as BuildingMsg),
                preamble: { restatement: event.restatement, bullets: [...event.bullets] },
                preambleIsFallback: false,
              };
              activeBuildingMsgIdRef.current = (next[idx] as BuildingMsg).id;
              return next;
            }
            // BEO-392: CREATE the one-and-only building message here
            const id = activeBuildingMsgIdRef.current ?? makeId();
            activeBuildingMsgIdRef.current = id;
            console.assert(
              prev.filter(m => m.type === "building").length === 0,
              "BEO-392: building message already in state when stage_preamble fires",
            );
            return [
              ...prev.filter(m => m.type !== "thinking"),
              {
                id,
                type: "building" as const,
                phase: "acknowledged",
                preamble: { restatement: event.restatement, bullets: [...event.bullets] },
                preambleIsFallback: false,
                checklist: makeInitialChecklist(),
                buildStartedAt: buildStartedAtRef.current ?? undefined,
              },
            ];
          });
          break;
        }

        case "conversational_response": {
          clearPreambleAndStageTimers();
          setIsAnalysingImage(false);
          const e: BuilderV3ConversationalResponseEvent = event;
          console.log("[BEO-conversational] conversational_response received:", {
            readyToImplement: e.readyToImplement,
            hasPlan: Boolean(e.plan),
            hasImplementPlan: Boolean(e.implementPlan),
            planPreview: (e.plan ?? e.implementPlan ?? "").slice(0, 80),
            messagePreview: e.message?.slice(0, 80),
          });
          const ready =
            Boolean(e.readyToImplement) && Boolean(e.plan || e.implementPlan);
          const plan = ready ? String(e.plan ?? e.implementPlan ?? "").trim() : "";
          console.log("[BEO-conversational] ready:", ready, "plan set:", Boolean(plan));
          if (plan) {
            pendingImplementPlanRef.current = plan;
            console.log("[BEO-conversational] pendingImplementPlanRef set ✓");
            // BEO-478: surface plan in the floating ImplementBar so it persists
            // even when the user sends follow-up messages before clicking Implement.
            setImplementSuggestion({ summary: plan });
            setMessages(prev => [
              ...prev.filter(m => m.type !== "thinking"),
              {
                id: makeId(),
                type: "chat_response",
                content: e.message,
                streaming: false,
                implementPlan: plan,
              },
            ]);
          } else {
            console.warn("[BEO-conversational] plan is empty — rendering question_answer (no ⚡ button)");
            setMessages(prev => [
              ...prev.filter(m => m.type !== "thinking"),
              { id: makeId(), type: "question_answer", content: e.message, streaming: false },
            ]);
          }
          if (!isBuildInProgressRef.current && shouldShowImplementFromAssistantContent(e.message)) {
            setImplementSuggestion({ summary: e.message });
          }
          setIsBuilding(false);
          break;
        }

        case "clarifying_question":
          clearPreambleAndStageTimers();
          setMessages(prev => [
            ...prev.filter(m => m.type !== "thinking"),
            { id: makeId(), type: "clarifying_question", content: event.message },
          ]);
          if (!isBuildInProgressRef.current && shouldShowImplementFromAssistantContent(event.message)) {
            setImplementSuggestion({ summary: event.message });
          }
          break;

        case "image_intent": {
          // BEO-182: classification result — show confirmation card in chat
          // BEO-462: clear analysing state — the card replaces the loading indicator
          setIsAnalysingImage(false);
          setMessages(prev => [
            ...prev.filter(m => m.type !== "thinking"),
            {
              id: makeId(),
              type: "image_intent",
              intent: event.intent as "logo" | "reference" | "error" | "theme" | "general",
              description: event.description as string,
              imageUrl: event.imageUrl as string,
              ctaText: typeof event.ctaText === "string" ? event.ctaText : undefined,
            },
          ]);
          setIsBuilding(false);
          break;
        }

        case "url_research": {
          setMessages(prev => [
            ...prev.filter(m => m.type !== "thinking"),
            {
              id: makeId(),
              type: "url_research" as const,
              domain: event.domain,
              summary: event.summary,
              features: event.features,
            },
          ]);
          break;
        }

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
            setIsAnalysingImage(false);
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
            setIsAnalysingImage(false);
            try {
              sessionStorage.removeItem(`beomz:buildStartedAt:${resolvedProjectIdRef.current}`);
            } catch { /* ignore */ }
            buildStartedAtRef.current = null;
            // BEO-492: high-confidence direct plan path — done event carries readyToImplement
            // signal without a preceding conversational_response. Wire the ImplementBar here
            // so it appears even when clarifying questions are bypassed entirely.
            // BEO-496: skip ImplementBar for iteration builds — they are surgical edits, not new plans.
            if (!isIterationBuildRef.current && event.readyToImplement && (event.plan || event.implementPlan)) {
              const plan = String(event.plan ?? event.implementPlan ?? "").trim();
              if (plan) {
                pendingImplementPlanRef.current = plan;
                setImplementSuggestion({ summary: plan });
              }
            }
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
          setIsAnalysingImage(false);
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
          // BEO-439: soft block — build completed but credits exhausted
          if (event.code === "credits_exhausted") {
            optionsRef.current.onOutOfCredits?.(false);
          }
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
                  checklistDwellRef.current.timer = null;
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
                    // BEO-399: if server-ready was deferred, flush it now that prior items drained
                    if (serverReadyPendingRef.current) {
                      const depIdx = latest.findIndex(i => i.id === "deploying");
                      const priorDone =
                        depIdx <= 0 || latest.slice(0, depIdx).every(i => i.status === "done");
                      if (priorDone) {
                        serverReadyPendingRef.current = false;
                        next[j] = {
                          ...(next[j] as BuildingMsg),
                          checklist: markDeployingDone(latest),
                          phase: "preview_ready",
                        };
                      }
                    }
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

              if (checklistDwellRef.current.timer) {
                clearTimeout(checklistDwellRef.current.timer);
                checklistDwellRef.current.timer = null;
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
            console.assert(
              prev.filter(m => m.type === "building").length === 0,
              `BEO-392: creating 2nd building msg on ${event.type}`,
            );
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

  // ─── BEO-396: Chat mode — send a conversational message ──────────────────

  const sendChatMessage = useCallback(
    (text: string, imageUrl?: string) => {
      chatAbortRef.current?.abort();
      const controller = new AbortController();
      chatAbortRef.current = controller;

      const thinkingId = `thinking-chat-${makeId()}`;
      setMessages(prev => [
        ...prev,
        { id: makeId(), type: "user", content: text, imageUrl: imageUrl || undefined, timestamp: new Date() },
        { id: thinkingId, type: "thinking" },
      ]);

      const respond = async () => {
        if (MOCK_CHAT_MODE) {
          // Capture messages snapshot *before* this new message for thread building
          const snapshot = await new Promise<ChatMessage[]>(resolve => {
            setMessages(prev => {
              resolve(prev);
              return prev;
            });
          });

          const chatMsgId = makeId();
          activeChatMsgIdRef.current = chatMsgId;

          // Replace thinking with empty streaming chat_response
          setMessages(prev => [
            ...prev.filter(m => m.id !== thinkingId),
            { id: chatMsgId, type: "chat_response", content: "", streaming: true },
          ]);

          await mockStreamChatResponse(
            text,
            snapshot,
            delta => {
              if (controller.signal.aborted) return;
              setMessages(prev => {
                let phraseSummary: string | null = null;
                const next = prev.map(m => {
                  if (m.id === chatMsgId && m.type === "chat_response") {
                    const nextContent = m.content + delta;
                    if (shouldShowImplementFromAssistantContent(nextContent)) {
                      phraseSummary = nextContent;
                    }
                    return { ...m, content: nextContent };
                  }
                  return m;
                });
                if (phraseSummary) {
                  queueMicrotask(() => {
                    setImplementSuggestion({ summary: phraseSummary! });
                  });
                }
                return next;
              });
            },
            summary => {
              if (controller.signal.aborted) return;
              // Finalize the streaming message + show sticky implement zone
              setMessages(prev => {
                const next = prev.map(m =>
                  m.id === chatMsgId && m.type === "chat_response"
                    ? { ...m, streaming: false }
                    : m,
                );
                const final = next.find(
                  m => m.id === chatMsgId && m.type === "chat_response",
                ) as Extract<ChatMessage, { type: "chat_response" }> | undefined;
                queueMicrotask(() => {
                  if (shouldShowImplementFromAssistantContent(final?.content)) {
                    setImplementSuggestion({ summary: final!.content });
                  } else {
                    setImplementSuggestion({ summary });
                  }
                });
                return next;
              });
              activeChatMsgIdRef.current = null;
            },
          );

          if (!controller.signal.aborted) {
            setMessages(prev => {
              const next = prev.map(m =>
                m.id === chatMsgId && m.type === "chat_response"
                  ? { ...m, streaming: false }
                  : m,
              );
              const final = next.find(
                m => m.id === chatMsgId && m.type === "chat_response",
              ) as Extract<ChatMessage, { type: "chat_response" }> | undefined;
              if (final && shouldShowImplementFromAssistantContent(final.content)) {
                queueMicrotask(() => {
                  setImplementSuggestion({ summary: final.content });
                });
              }
              return next;
            });
            activeChatMsgIdRef.current = null;
          }
        } else {
          // Real API path — active once Codex ships /api/builds/chat
          try {
            const accessToken = await getAccessToken();
            const url = `${getApiBaseUrl()}/builds/chat`;
            const thread = buildChatThread(
              await new Promise<ChatMessage[]>(resolve => {
                setMessages(prev => { resolve(prev); return prev; });
              }),
            );
            const resp = await fetch(url, {
              method: "POST",
              headers: {
                authorization: `Bearer ${accessToken}`,
                "content-type": "application/json",
                accept: "text/event-stream",
              },
              body: JSON.stringify({
                messages: [...thread, { role: "user", content: text }],
                projectId: resolvedProjectIdRef.current || undefined,
                imageUrl: imageUrl || undefined,
              }),
              signal: controller.signal,
            });

            if (!resp.ok || !resp.body) {
              throw new Error(`Chat request failed with ${resp.status}`);
            }

            const chatMsgId = makeId();
            activeChatMsgIdRef.current = chatMsgId;
            setMessages(prev => [
              ...prev.filter(m => m.id !== thinkingId),
              { id: chatMsgId, type: "chat_response", content: "", streaming: true },
            ]);

            const reader = resp.body.getReader();
            const decoder = new TextDecoder();
            let buf = "";
            let dataLines: string[] = [];

            const flush = () => {
              if (!dataLines.length) return;
              const payload = dataLines.join("\n");
              dataLines = [];
              try {
                const ev = JSON.parse(payload) as {
                  type: string;
                  delta?: string;
                  summary?: string;
                  plan?: string;
                  readyToImplement?: boolean;
                  implementPlan?: string;
                };
                if (ev.type === "chat_response" && ev.delta) {
                  setMessages(prev => {
                    let phraseSummary: string | null = null;
                    const next = prev.map(m => {
                      if (m.id === chatMsgId && m.type === "chat_response") {
                        const nextContent = m.content + ev.delta!;
                        if (shouldShowImplementFromAssistantContent(nextContent)) {
                          phraseSummary = nextContent;
                        }
                        return { ...m, content: nextContent };
                      }
                      return m;
                    });
                    if (phraseSummary) {
                      queueMicrotask(() => {
                        setImplementSuggestion({ summary: phraseSummary! });
                      });
                    }
                    return next;
                  });
                } else if (ev.type === "implement_suggestion" && ev.summary) {
                  setMessages(prev =>
                    prev.map(m =>
                      m.id === chatMsgId && m.type === "chat_response"
                        ? { ...m, streaming: false }
                        : m,
                    ),
                  );
                  setImplementSuggestion({ summary: ev.summary! });
                  activeChatMsgIdRef.current = null;
                } else if (
                  ev.type === "ready_to_implement" ||
                  (ev.readyToImplement && (ev.plan || ev.implementPlan))
                ) {
                  const plan = ev.plan ?? ev.implementPlan ?? "";
                  if (plan) {
                    pendingImplementPlanRef.current = plan;
                    // BEO-492: surface plan in the floating ImplementBar for chat mode too
                    setImplementSuggestion({ summary: plan });
                    setMessages(prev =>
                      prev.map(m =>
                        m.id === chatMsgId && m.type === "chat_response"
                          ? { ...m, streaming: false, implementPlan: plan }
                          : m,
                      ),
                    );
                    activeChatMsgIdRef.current = null;
                  }
                }
                // Also handle readyToImplement as a field on any event (e.g. done)
                if (ev.readyToImplement && (ev.plan || ev.implementPlan) && ev.type !== "ready_to_implement") {
                  const plan = ev.plan ?? ev.implementPlan ?? "";
                  if (plan) {
                    pendingImplementPlanRef.current = plan;
                    // BEO-492: ensure ImplementBar appears on any readyToImplement signal
                    setImplementSuggestion({ summary: plan });
                    setMessages(prev =>
                      prev.map(m =>
                        m.id === chatMsgId && m.type === "chat_response"
                          ? { ...m, implementPlan: plan }
                          : m,
                      ),
                    );
                  }
                }
              } catch { /* ignore parse errors */ }
            };

            while (true) {
              const { done, value } = await reader.read();
              if (done) { flush(); break; }
              buf += decoder.decode(value, { stream: true });
              while (true) {
                const nl = buf.indexOf("\n");
                if (nl === -1) break;
                const line = buf.slice(0, nl).replace(/\r$/, "");
                buf = buf.slice(nl + 1);
                if (!line) { flush(); continue; }
                if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
              }
            }

            setMessages(prev => {
              const next = prev.map(m =>
                m.id === chatMsgId && m.type === "chat_response"
                  ? { ...m, streaming: false }
                  : m,
              );
              const final = next.find(
                m => m.id === chatMsgId && m.type === "chat_response",
              ) as Extract<ChatMessage, { type: "chat_response" }> | undefined;
              if (final && shouldShowImplementFromAssistantContent(final.content)) {
                queueMicrotask(() => {
                  setImplementSuggestion({ summary: final.content });
                });
              }
              return next;
            });
            activeChatMsgIdRef.current = null;
          } catch (err) {
            if (controller.signal.aborted) return;
            const content = err instanceof Error ? err.message : "Chat failed. Try again.";
            setMessages(prev => [
              ...prev.filter(m => m.id !== thinkingId),
              { id: makeId(), type: "error", content },
            ]);
          }
        }
      };

      void respond().catch(err => {
        if (controller.signal.aborted) return;
        setMessages(prev => [
          ...prev.filter(m => m.id !== thinkingId),
          { id: makeId(), type: "error", content: err instanceof Error ? err.message : "Chat failed." },
        ]);
      });
    },
    [],
  );

  // ─── BEO-396: "Implement this" — summarise thread + trigger build ──────────

  const implementCard = useCallback(async () => {
    // BEO-398: clear sticky zone immediately
    setImplementSuggestion(null);

    let prompt: string;

    if (MOCK_CHAT_MODE) {
      const snapshot = await new Promise<ChatMessage[]>(resolve => {
        setMessages(prev => { resolve(prev); return prev; });
      });
      const thread = buildChatThread(snapshot);
      prompt = await mockSummariseChatThread(thread);
    } else {
      try {
        const snapshot = await new Promise<ChatMessage[]>(resolve => {
          setMessages(prev => { resolve(prev); return prev; });
        });
        const thread = buildChatThread(snapshot);
        const accessToken = await getAccessToken();
        const resp = await fetch(`${getApiBaseUrl()}/builds/summarise-chat`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${accessToken}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ messages: thread }),
        });
        if (!resp.ok) throw new Error(`Summarise failed with ${resp.status}`);
        const data = await resp.json() as { prompt: string };
        prompt = data.prompt;
      } catch (err) {
        prompt = "Build the app we discussed.";
        console.error("[BEO-396] summarise-chat failed:", err);
      }
    }

    // Deactivate chat mode, then trigger the normal build flow
    setChatModeActive(false);
    chatModeRef.current = false;

    // sendMessageInternal fires the build pipeline — called via sendMessage below
    // We use a slight delay to let the state update settle
    await delay(50);
    sendMessageInternalRef.current?.(prompt);
  }, []);

  // ─── BEO-460/461/462: Implement a specific plan (⚡ button on chat_response or image_intent CTA) ───
  const implementWithPlan = useCallback(async (plan: string, imageUrl?: string) => {
    pendingImplementPlanRef.current = null;
    setImplementSuggestion(null);
    setChatModeActive(false);
    chatModeRef.current = false;
    await delay(50);
    // Pass plan as implementPlan so the API's hasExplicitImplementSignal() bypasses detectIntent.
    sendMessageInternalRef.current?.(plan, imageUrl, plan);
  }, []);

  useEffect(() => {
    implementWithPlanRef.current = implementWithPlan;
  }, [implementWithPlan]);

  // Ref that points to the raw build sender (set after sendMessage is defined)
  // Third arg `implementPlan` is forwarded to the API body to bypass detectIntent.
  const sendMessageInternalRef = useRef<((text: string, imageUrl?: string, implementPlan?: string) => void) | null>(null);

  const sendMessage = useCallback(
    (text: string, imageUrl?: string, isSystem?: boolean) => {
      if (!isSystem && isBuildConfirmation(text)) {
        const plan = pendingImplementPlanRef.current;
        if (plan && implementWithPlanRef.current) {
          void implementWithPlanRef.current(plan, imageUrl);
          return;
        }
      }

      // BEO-410: hard double-guard — if either ref OR state says chat mode,
      // always route to chat. Prevents stale-closure fallthrough to build.
      if (chatModeRef.current || chatModeActive) {
        sendChatMessage(text, imageUrl);
        return;
      }

      // BEO-410: dev assert — build must never fire while chat mode is active
      console.assert(
        !(isBuilding && chatModeActive),
        "BEO-410: Build fired while chat mode active",
      );

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

      // BEO-464: do NOT set isBuilding here — wait for build_confirmed SSE.
      // Only show thinking dots until the API confirms this is a real build.
      // BEO-462: if an image is attached, flag that we're analysing it until
      // image_intent or a real build stage fires and clears this flag.
      if (imageUrl) setIsAnalysingImage(true);
      setMessages(prev => {
        const filtered = prev.filter(m => m.type !== "server_restarting");
        // BEO-589 Bug 3: skip duplicate user message if identical content sent within 5s
        const lastUserMsg = filtered.slice().reverse().find(m => m.type === "user") as Extract<ChatMessage, { type: "user" }> | undefined;
        if (lastUserMsg && lastUserMsg.content === text) {
          const ts = lastUserMsg.timestamp instanceof Date
            ? lastUserMsg.timestamp.getTime()
            : (lastUserMsg.timestamp ? new Date(String(lastUserMsg.timestamp)).getTime() : NaN);
          if (!isNaN(ts) && Date.now() - ts < 5_000) {
            return [...filtered, { id: `thinking-${makeId()}`, type: "thinking" }];
          }
        }
        return [
          ...filtered,
          { id: makeId(), type: "user", content: text, imageUrl: imageUrl || undefined, timestamp: new Date(), isSystem: isSystem || undefined },
          { id: `thinking-${makeId()}`, type: "thinking" },
        ];
      });

      void startAndStreamBuild({
        body: {
          prompt: text,
          projectId: resolvedProjectIdRef.current || undefined,
          model: "claude-sonnet-4-6",
          existingFiles:
            existingFilesRef.current.length > 0
              ? existingFilesRef.current
              : undefined,
          ...(imageUrl ? { imageUrl } : {}),
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
            const filtered = prev.filter(m => m.type !== "thinking");
            if (filtered.some(m => m.type === "server_restarting")) return filtered;
            return [...filtered, { id: makeId(), type: "server_restarting" }];
          });
        } else {
          const content = err instanceof Error ? err.message : "Failed to start build.";
          setMessages(prev => [
            ...prev.filter(m => m.type !== "thinking"),
            { id: makeId(), type: "error", content },
          ]);
        }
        setIsBuilding(false);
        buildDoneRef.current = false;
      });
    },
    [startAndStreamBuild, handleEvent, clearPreambleAndStageTimers, sendChatMessage, chatModeActive],
  );

  // BEO-396: expose the raw build sender to implementCard
  useEffect(() => {
    sendMessageInternalRef.current = (text: string, imageUrl?: string, implementPlan?: string) => {
      // Call without going through chatModeRef check — directly triggers build flow
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
      // BEO-464: isBuilding is set by build_confirmed SSE, not here
      setMessages(prev => [
        ...prev.filter(m => m.type !== "server_restarting"),
        { id: makeId(), type: "user", content: text, imageUrl: imageUrl || undefined, timestamp: new Date() },
        { id: `thinking-${makeId()}`, type: "thinking" },
      ]);
      void startAndStreamBuild({
        body: {
          prompt: text,
          projectId: resolvedProjectIdRef.current || undefined,
          model: "claude-sonnet-4-6",
          existingFiles:
            existingFilesRef.current.length > 0 ? existingFilesRef.current : undefined,
          ...(imageUrl ? { imageUrl } : {}),
          ...(implementPlan ? { implementPlan } : {}),
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
        onBuildStatus: status => { optionsRef.current.onBuildStatus?.(status); },
        onEvent: handleEvent,
      }).catch(err => {
        if (controller.signal.aborted) return;
        if (err instanceof NetworkDisconnectError) {
          setMessages(prev => {
            const filtered = prev.filter(m => m.type !== "thinking");
            if (filtered.some(m => m.type === "server_restarting")) return filtered;
            return [...filtered, { id: makeId(), type: "server_restarting" }];
          });
        } else {
          const content = err instanceof Error ? err.message : "Failed to start build.";
          setMessages(prev => [
            ...prev.filter(m => m.type !== "thinking"),
            { id: makeId(), type: "error", content },
          ]);
        }
        setIsBuilding(false);
        buildDoneRef.current = false;
      });
    };
  }, [startAndStreamBuild, handleEvent, clearPreambleAndStageTimers]);

  // ─── BEO-589: Silent retry — restart the last build without pushing a new user message ───

  const startBuildSilently = useCallback(
    (prompt: string) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      buildDoneRef.current = false;
      activeBuildingMsgIdRef.current = null;
      buildStartedAtRef.current = null;
      try {
        sessionStorage.removeItem(`beomz:buildStartedAt:${resolvedProjectIdRef.current}`);
        sessionStorage.removeItem(`beomz:buildingUi:${resolvedProjectIdRef.current}`);
      } catch { /* ignore */ }
      clearPreambleAndStageTimers();
      // Clear error/restarting cards and add thinking dots — no user message pushed
      setMessages(prev => [
        ...prev.filter(m => m.type !== "error" && m.type !== "server_restarting" && m.type !== "thinking"),
        { id: `thinking-${makeId()}`, type: "thinking" },
      ]);
      void startAndStreamBuild({
        body: {
          prompt,
          projectId: resolvedProjectIdRef.current || undefined,
          model: "claude-sonnet-4-6",
          existingFiles:
            existingFilesRef.current.length > 0 ? existingFilesRef.current : undefined,
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
        onBuildStatus: status => { optionsRef.current.onBuildStatus?.(status); },
        onEvent: handleEvent,
      }).catch(err => {
        if (controller.signal.aborted) return;
        if (err instanceof NetworkDisconnectError) {
          setMessages(prev => {
            const filtered = prev.filter(m => m.type !== "thinking");
            if (filtered.some(m => m.type === "server_restarting")) return filtered;
            return [...filtered, { id: makeId(), type: "server_restarting" }];
          });
        } else {
          const content = err instanceof Error ? err.message : "Failed to start build.";
          setMessages(prev => [
            ...prev.filter(m => m.type !== "thinking"),
            { id: makeId(), type: "error", content },
          ]);
        }
        setIsBuilding(false);
        buildDoneRef.current = false;
      });
    },
    [startAndStreamBuild, handleEvent, clearPreambleAndStageTimers],
  );

  // ─── BEO-587: Stop build — abort immediately and return to idle ──────────

  const stopBuild = useCallback(() => {
    abortRef.current?.abort();
    chatAbortRef.current?.abort();
    clearPreambleAndStageTimers();
    setIsBuilding(false);
    setIsAnalysingImage(false);
    isBuildInProgressRef.current = false;
    buildDoneRef.current = false;
    activeBuildingMsgIdRef.current = null;
    // Remove the in-flight building card and thinking dots so UI returns to idle
    setMessages(prev =>
      prev.filter(m => {
        if (m.type === "thinking") return false;
        // Drop the live (unsummarised) building card — it was never completed
        if (m.type === "building" && !(m as BuildingMsg).summary) return false;
        return true;
      }),
    );
    try {
      sessionStorage.removeItem(`beomz:buildStartedAt:${resolvedProjectIdRef.current}`);
      sessionStorage.removeItem(`beomz:buildingUi:${resolvedProjectIdRef.current}`);
    } catch { /* ignore */ }
  }, [clearPreambleAndStageTimers]);

  const retryLastBuild = useCallback(() => {
    const prompt = lastUserPromptRef.current;
    if (!prompt) return;
    startBuildSilently(prompt);
  }, [startBuildSilently]);

  // ─── BEO-589: Report issue — mailto with project + prompt context ────────────

  const handleReportIssue = useCallback(() => {
    const subject = encodeURIComponent("Beomz Build Issue");
    const body = encodeURIComponent(
      `Project: ${resolvedProjectIdRef.current || "unknown"}\nPrompt: ${lastUserPromptRef.current}\nError: build failed`,
    );
    window.open(`mailto:hello@beomz.com?subject=${subject}&body=${body}`);
  }, []);

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
    isAnalysingImage,
    isIterationBuild,
    sendMessage,
    retryLastBuild,
    // BEO-587: immediate abort + idle
    stopBuild,
    // BEO-589: report issue via mailto
    reportIssue: handleReportIssue,
    buildDoneRef,
    subscribeToExistingBuild,
    notifyPreviewServerReady,
    // BEO-396: Chat mode
    chatModeActive,
    toggleChatMode,
    implementCard,
    implementWithPlan,
    // BEO-398: Sticky implement zone
    implementSuggestion,
    dismissImplementSuggestion,
  };
}
