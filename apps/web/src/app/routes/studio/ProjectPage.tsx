/**
 * ProjectPage — V2 builder with resizable panels, TopBar tab switcher,
 * Preview / Code / Database / Integrations views.
 * Light mode — cream #faf9f6 throughout.
 *
 * BEO-363: All build logic + SSE event handling lives in useBuildChat.
 * This component only orchestrates layout + calls the hook.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { BuilderV3Event, TemplateId } from "@beomz-studio/contracts";
import { useNavigate, useParams } from "@tanstack/react-router";
import { Copy, Check, Code2 } from "lucide-react";
import {
  TopBar,
  ChatPanel,
  BuilderModals,
  DatabasePanel,
  IntegrationsPanel,
  PublishModal,
  PhasePlanCard,
  type ActiveView,
} from "../../../components/builder";
import type { ChatMessage as LegacyChatMessage } from "../../../components/builder/ChatPanel";
import type { Phase } from "../../../components/builder/PhasePlanCard";
import { FeatureScopeCard } from "../../../components/builder/FeatureScopeCard";
import { InsufficientCreditsCard } from "../../../components/builder/InsufficientCreditsCard";
import { ServerRestartedCard } from "../../../components/builder/ServerRestartedCard";
import { HistoryPanel, PreviewPane } from "../../../components/studio";
import { usePricingModal } from "../../../contexts/PricingModalContext";
import {
  getBuildStatus,
  getLatestBuildForProject,
  getProject,
  getProjectDbState,
  exportProjectZip,
  listProjectsWithMeta,
  startNextPhase,
  confirmScope,
  forceSimpleBuild,
  type BuildPayload,
  type BuildStatusResponse,
} from "../../../lib/api";
import { getOrBootWebContainer, isWebContainerSupported } from "../../../lib/webcontainer";
import { consumeProjectLaunchIntent } from "../../../lib/projectLaunchIntent";
import { useBuilderPersistence } from "../../../hooks/useBuilderPersistence";
import { useBuilderSessionHealth } from "../../../hooks/useBuilderSessionHealth";
import { useBuildChat } from "../../../hooks/useBuildChat";
import { cn } from "../../../lib/cn";
import { useCredits } from "../../../lib/CreditsContext";
import { getSuggestionChips } from "../../../lib/getSuggestionChips";
import {
  getPersonality,
  PERSONALITIES,
  type PersonalityId,
} from "../../../lib/personalities";

// ─────────────────────────────────────────────
// File grouping helper for Code panel
// ─────────────────────────────────────────────

type FileSection = "ROUTES" | "COMPONENTS" | "CONFIG" | "OTHER";

function classifyFile(path: string, kind?: string): FileSection {
  if (kind === "route" || /\/(screens|pages|routes)\//.test(path) || /(^|\/)app\.tsx$/i.test(path)) return "ROUTES";
  if (kind === "component" || /\/components\//.test(path)) return "COMPONENTS";
  if (/\/(theme|config|data)\b/.test(path) || /\.(json|config)\b/.test(path)) return "CONFIG";
  return "OTHER";
}

export function ProjectPage() {
  const { id } = useParams({ from: "/studio/project/$id" });
  const navigate = useNavigate();
  const [launchIntent] = useState(() =>
    id === "new" ? consumeProjectLaunchIntent() : null,
  );
  const [projectId, setProjectId] = useState<string | null>(
    id === "new" ? null : id,
  );
  const [projectName, setProjectName] = useState("Untitled project");
  const [projectIcon, setProjectIcon] = useState<string | null>(null);
  const [userMode, setUserMode] = useState<"simple" | "pro">("simple");
  const [activeView, setActiveView] = useState<ActiveView>("preview");
  const [personalityId] = useState<PersonalityId>(() => getPersonality());
  const personality = PERSONALITIES[personalityId];

  const { setLastError, setTransport, transport } = useBuilderSessionHealth();
  const { clearState, restoreState, saveState } = useBuilderPersistence(projectId);

  // ─── useBuildChat ────────────────────────────────────────────────────────

  const {
    messages,
    isBuilding,
    sendMessage,
    retryLastBuild,
    buildDoneRef,
    subscribeToExistingBuild,
  } = useBuildChat(id, {
    onEvent: handleLegacyEvent,
    onProjectIdResolved: (newId, name, icon) => {
      setProjectId(newId);
      setProjectName(name);
      setProjectIcon(icon);
      if (id === "new") {
        void navigate({ params: { id: newId }, to: "/studio/project/$id" });
      }
    },
    onBuildStatus: handleBuildStatus,
    onBuildStarted: response => {
      activeBuildIdRef.current = response.build.id;
      setBuild(response.build);
      setProjectId(response.project.id);
      setProjectName(response.project.name);
      setProjectIcon(response.project.icon ?? null);
      if (response.trace.previewReady) {
        void getBuildStatus(response.build.id)
          .then(status => {
            if (!status.result) return;
            setBuild(status.build);
            setBuildResult(status.result);
            setPreviewGenerationId(response.build.id);
          })
          .catch(() => {
            setPreviewGenerationId(response.build.id);
          });
      }
    },
  });

  // ─── Build / preview state ────────────────────────────────────────────────

  const [lastEventId, setLastEventId] = useState<string | null>(null);
  const [build, setBuild] = useState<BuildPayload | null>(null);
  const [buildResult, setBuildResult] = useState<BuildStatusResponse["result"] | null>(null);
  const [buildFailed, setBuildFailed] = useState(false);
  const [previewGenerationId, setPreviewGenerationId] = useState<string | null>(null);
  const [previewRefreshKey, setPreviewRefreshKey] = useState(0);
  const [isAiCustomising, setIsAiCustomising] = useState(false);
  const aiCustomisingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeBuildIdRef = useRef<string | null>(null);
  const resumingBuildRef = useRef(false);

  // ─── Thinking-label animation (personality) ────────────────────────────────

  const [streamingText, setStreamingText] = useState("");
  const [streamingFileCount, setStreamingFileCount] = useState<{ current: number; total: number } | null>(null);
  const thinkingLabelIndexRef = useRef(0);
  const thinkingLabelIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── Suggestion chips ─────────────────────────────────────────────────────

  const [suggestionChips, setSuggestionChips] = useState<string[]>([]);

  // ─── Phase mode state ─────────────────────────────────────────────────────

  const [phases, setPhases] = useState<Phase[]>([]);
  const [currentPhase, setCurrentPhase] = useState(0);
  const [phaseMode, setPhaseMode] = useState(false);
  const [isPhaseBuilding, setIsPhaseBuilding] = useState(false);
  const phasePollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── Feature scope card ───────────────────────────────────────────────────

  const [scopeFeatures, setScopeFeatures] = useState<string[]>([]);
  const [scopeBuildId, setScopeBuildId] = useState<string | null>(null);
  const [scopeMessage, setScopeMessage] = useState("");

  // ─── Insufficient credits card ────────────────────────────────────────────

  const [insufficientAvailable, setInsufficientAvailable] = useState(0);
  const [insufficientRequired, setInsufficientRequired] = useState(0);
  const [insufficientFeatures, setInsufficientFeatures] = useState<string[]>([]);
  const [insufficientBuildId, setInsufficientBuildId] = useState<string | null>(null);

  const { openPricingModal } = usePricingModal();
  const { credits, deductOptimistic, refresh: refreshCredits } = useCredits();
  const [showOutOfCreditsModal, setShowOutOfCreditsModal] = useState(false);

  // ─── Panel layout state ───────────────────────────────────────────────────

  const [showChat, setShowChat] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [chatPanelWidth, setChatPanelWidth] = useState(380);
  const [historyPanelWidth, setHistoryPanelWidth] = useState(220);

  // ─── Code panel ───────────────────────────────────────────────────────────

  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  const dragRef = useRef<{
    target: "history" | "chat";
    startX: number;
    startWidth: number;
  } | null>(null);

  // ─── Publish state ────────────────────────────────────────────────────────

  const [showShareModal, setShowShareModal] = useState(false);
  const [isPublished, setIsPublished] = useState(false);
  const [publishedSlug, setPublishedSlug] = useState<string | null>(null);
  const [beomzAppUrl, setBeomzAppUrl] = useState<string | null>(null);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // ─── Database state ───────────────────────────────────────────────────────

  const [dbEnabled, setDbEnabled] = useState(false);
  const [dbProvider, setDbProvider] = useState<string | null>(null);
  const [dbWired, setDbWired] = useState(false);

  // ─── Legacy SSE event handler ─────────────────────────────────────────────
  // Handles side-effects that have not yet been migrated to useBuildChat:
  // phase mode, scope confirmation, insufficient credits, preview overlay,
  // thinking-label animation, project-name updates, and suggestion chips.

  function handleLegacyEvent(event: BuilderV3Event) {
    const buildId = "buildId" in event ? event.buildId : activeBuildIdRef.current;

    setLastEventId(event.id);

    if ("buildId" in event && event.buildId) {
      activeBuildIdRef.current = event.buildId;
    }

    // Phases planned — phase mode card
    if ((event as unknown as Record<string, unknown>).type === "phases_planned") {
      const phaseEvent = event as unknown as { phases: Phase[]; currentPhase: number };
      setPhases(phaseEvent.phases);
      setCurrentPhase(phaseEvent.currentPhase);
      setPhaseMode(true);
      setIsPhaseBuilding(true);
    }

    // Scope confirmation — pause build, show FeatureScopeCard
    if ((event as unknown as Record<string, unknown>).type === "scope_confirmation") {
      const scopeEvent = event as unknown as { features: string[]; buildId: string; message: string };
      setScopeFeatures(scopeEvent.features);
      setScopeBuildId(scopeEvent.buildId);
      setScopeMessage(scopeEvent.message);
      setStreamingText("");
    }

    // Insufficient credits — show InsufficientCreditsCard
    if ((event as unknown as Record<string, unknown>).type === "insufficient_credits") {
      const icEvent = event as unknown as {
        available: number;
        required: number;
        features: string[];
        buildId?: string;
      };
      setInsufficientAvailable(icEvent.available ?? 0);
      setInsufficientRequired(icEvent.required ?? 0);
      setInsufficientFeatures(icEvent.features ?? []);
      setInsufficientBuildId(icEvent.buildId ?? buildId);
      setStreamingText("");
    }

    // Thinking-label advancement on tool use events
    if (event.type === "tool_use_started") {
      const labels = personality.thinkingLabels;
      thinkingLabelIndexRef.current = Math.min(thinkingLabelIndexRef.current + 1, labels.length - 1);
      setStreamingText(labels[thinkingLabelIndexRef.current]);
    }

    if (event.type === "assistant_delta" || event.type === "tool_use_progress") {
      const labels = personality.thinkingLabels;
      const midIdx = Math.min(Math.floor(labels.length / 2), labels.length - 1);
      if (thinkingLabelIndexRef.current < midIdx) {
        thinkingLabelIndexRef.current = midIdx;
        setStreamingText(labels[midIdx]);
      }
    }

    // Preview ready — begin writing AI files to WebContainer
    if (event.type === "preview_ready") {
      setProjectId(event.projectId);
      setIsAiCustomising(true);
      const fileCount = ("filesCount" in event ? event.filesCount : null) as number | null;
      if (fileCount && fileCount > 0) {
        let i = 1;
        const tick = () => {
          if (i <= fileCount) {
            setStreamingFileCount({ current: i, total: fileCount });
            i++;
            setTimeout(tick, 300);
          } else {
            setStreamingFileCount({ current: fileCount, total: fileCount });
          }
        };
        tick();
      }
      void getBuildStatus(event.buildId)
        .then(status => {
          if (status.result) setBuildResult(status.result);
          setPreviewGenerationId(event.buildId);
        })
        .catch(() => {
          setPreviewGenerationId(event.buildId);
        });
    }

    // Done — manage overlay timer, update project meta, generate suggestion chips
    if (event.type === "done") {
      if (thinkingLabelIntervalRef.current) {
        clearInterval(thinkingLabelIntervalRef.current);
        thinkingLabelIntervalRef.current = null;
      }
      setStreamingText("");
      setStreamingFileCount(null);

      if (!event.fallbackUsed) {
        if (aiCustomisingTimeoutRef.current) clearTimeout(aiCustomisingTimeoutRef.current);
        aiCustomisingTimeoutRef.current = setTimeout(() => {
          aiCustomisingTimeoutRef.current = null;
          setIsAiCustomising(false);
        }, 8000);

        void getBuildStatus(event.buildId)
          .then(status => {
            if (status.project.name && status.project.name !== "Untitled project") {
              setProjectName(status.project.name);
            }
            // Suggestion chips from last user prompt
            const lastUserMsg = messages
              .slice()
              .reverse()
              .find(m => m.type === "user");
            const prompt = lastUserMsg?.type === "user" ? lastUserMsg.content : projectName;
            if (prompt) {
              void getSuggestionChips(prompt).then(chips => {
                if (chips.length > 0) setSuggestionChips(chips);
              });
            }
            // Optimistic credit deduction
            deductOptimistic(5);
            void refreshCredits();
          })
          .catch(() => {});
      } else {
        if (aiCustomisingTimeoutRef.current) {
          clearTimeout(aiCustomisingTimeoutRef.current);
          aiCustomisingTimeoutRef.current = null;
        }
        setIsAiCustomising(false);
        setBuildFailed(true);
      }

      setIsPhaseBuilding(false);
    }

    // Error — manage overlay
    if (event.type === "error") {
      if (thinkingLabelIntervalRef.current) {
        clearInterval(thinkingLabelIntervalRef.current);
        thinkingLabelIntervalRef.current = null;
      }
      setStreamingText("");
      setStreamingFileCount(null);

      if (event.code !== "server_restarting") {
        if (aiCustomisingTimeoutRef.current) {
          clearTimeout(aiCustomisingTimeoutRef.current);
          aiCustomisingTimeoutRef.current = null;
        }
        setIsAiCustomising(false);
      }
    }
  }

  // ─── handleBuildStatus ────────────────────────────────────────────────────

  function handleBuildStatus(status: BuildStatusResponse) {
    setBuild(status.build);
    setProjectId(status.project.id);
    setProjectName(status.project.name);
    setProjectIcon(status.project.icon ?? null);
    if (status.result) setBuildResult(status.result);
    if (status.trace.previewReady || status.build.status === "completed") {
      setPreviewGenerationId(status.build.id);
    }
    if (status.build.status === "completed" || status.build.status === "failed") {
      setStreamingText("");
    }
  }

  // ─── WebContainer overlay gating ─────────────────────────────────────────
  // Called by PreviewPane after new files land in the WC sandbox.
  // Only lifts the overlay once the build has fully completed with real AI files.

  const handleFilesWrittenToWC = useCallback(() => {
    if (!buildDoneRef.current) return;
    if (aiCustomisingTimeoutRef.current) {
      clearTimeout(aiCustomisingTimeoutRef.current);
      aiCustomisingTimeoutRef.current = null;
    }
    setTimeout(() => setIsAiCustomising(false), 400);
  }, [buildDoneRef]);

  // ─── Send message ─────────────────────────────────────────────────────────
  // Thin wrapper that handles credits check and raises the preview overlay.

  const handleSendMessage = useCallback(
    (text: string) => {
      if (credits && credits.balance <= 0) {
        setShowOutOfCreditsModal(true);
        return;
      }
      setBuildFailed(false);
      buildDoneRef.current = false;
      setIsAiCustomising(true);
      if (aiCustomisingTimeoutRef.current) {
        clearTimeout(aiCustomisingTimeoutRef.current);
        aiCustomisingTimeoutRef.current = null;
      }
      // Start personality thinking-label cycle
      thinkingLabelIndexRef.current = 0;
      setStreamingText(personality.thinkingLabels[0]);
      if (thinkingLabelIntervalRef.current) clearInterval(thinkingLabelIntervalRef.current);
      thinkingLabelIntervalRef.current = setInterval(() => {
        const labels = personality.thinkingLabels;
        thinkingLabelIndexRef.current = Math.min(thinkingLabelIndexRef.current + 1, labels.length - 1);
        setStreamingText(labels[thinkingLabelIndexRef.current]);
      }, 4000);

      sendMessage(text);
    },
    [credits, sendMessage, personality.thinkingLabels, buildDoneRef],
  );

  // ─── Stop streaming ───────────────────────────────────────────────────────

  const handleStopStreaming = useCallback(() => {
    if (thinkingLabelIntervalRef.current) {
      clearInterval(thinkingLabelIntervalRef.current);
      thinkingLabelIntervalRef.current = null;
    }
    setStreamingText("");
    setTransport("idle");
    // The abort is handled inside useBuildChat; we just clean up local UI
  }, [setTransport]);

  // ─── Data fetches ─────────────────────────────────────────────────────────

  const fetchDbState = useCallback(async () => {
    if (!projectId) return;
    try {
      const state = await getProjectDbState(projectId);
      setDbEnabled(state.database_enabled);
      setDbProvider(state.db_provider);
      setDbWired(state.db_wired);
      if (state.db_wired && state.supabaseUrl && state.anonKey && isWebContainerSupported()) {
        try {
          const envContent = [
            `VITE_SUPABASE_URL=${state.supabaseUrl}`,
            `VITE_SUPABASE_ANON_KEY=${state.anonKey}`,
            `VITE_DB_SCHEMA=${state.schemaName ?? "public"}`,
            "",
          ].join("\n");
          const { wc } = await getOrBootWebContainer();
          await wc.fs.writeFile(".env.local", envContent);
        } catch (wcErr) {
          console.warn("[ProjectPage] Failed to inject DB env into WebContainer:", wcErr);
        }
      }
    } catch { /* DB state may not be available yet */ }
  }, [projectId]);

  // ─── Effects ──────────────────────────────────────────────────────────────

  useEffect(() => {
    setProjectId(id === "new" ? null : id);
  }, [id]);

  useEffect(() => {
    if (projectId && id !== "new") void fetchDbState();
  }, [projectId, id, fetchDbState]);

  useEffect(() => {
    if (!projectId || id === "new") return;
    void listProjectsWithMeta().then(data => {
      const proj = data.projects.find(p => p.id === projectId) as
        | (typeof data.projects[number] & {
            published?: boolean;
            published_slug?: string | null;
            beomz_app_url?: string | null;
          })
        | undefined;
      if (proj) {
        setIsPublished(Boolean(proj.published));
        setPublishedSlug(proj.published_slug ?? null);
        setBeomzAppUrl(proj.beomz_app_url ?? null);
      }
    }).catch(() => {});
  }, [projectId, id]);

  useEffect(() => {
    if (!projectId || id === "new" || phaseMode) return;
    void getProject(projectId).then(proj => {
      if (proj.phaseMode) {
        const bp = proj.buildPhases as Phase[] | null | undefined;
        if (bp && Array.isArray(bp) && bp.length > 0) {
          setPhases(bp);
          setCurrentPhase(proj.currentPhase ?? 1);
          setPhaseMode(true);
          setIsPhaseBuilding(false);
          setTimeout(() => setPreviewRefreshKey(c => c + 1), 500);
        }
      }
    }).catch(() => {});
  }, [projectId, id, phaseMode]);

  useEffect(() => {
    if (!projectId) return;
    saveState({
      buildId: build?.id ?? null,
      lastEventId,
      previewGenerationId,
    });
  }, [build?.id, lastEventId, previewGenerationId, projectId, saveState]);

  // Resume existing build on mount
  useEffect(() => {
    if (resumingBuildRef.current || id === "new" || !projectId || build) return;
    resumingBuildRef.current = true;
    const controller = new AbortController();

    void (async () => {
      const restoredState = restoreState();
      const status = restoredState?.buildId
        ? await getBuildStatus(restoredState.buildId)
        : await getLatestBuildForProject(projectId);

      if (!status || controller.signal.aborted) return;

      activeBuildIdRef.current = status.build.id;
      setBuild(status.build);
      setProjectName(status.project.name);
      setProjectIcon(status.project.icon ?? null);
      setProjectId(status.project.id);
      if (status.result) setBuildResult(status.result);
      setPreviewGenerationId(
        restoredState?.previewGenerationId
        ?? (status.trace.previewReady || status.build.status === "completed" ? status.build.id : null),
      );
      setLastEventId(restoredState?.lastEventId ?? status.trace.lastEventId);

      // Restore phase state
      const proj = status.project as unknown as Record<string, unknown>;
      if (proj.phase_mode || proj.phaseMode) {
        const buildPhases = (proj.build_phases ?? proj.buildPhases) as Phase[] | undefined;
        const curPhase = (proj.current_phase ?? proj.currentPhase) as number | undefined;
        if (buildPhases && Array.isArray(buildPhases) && buildPhases.length > 0) {
          setPhases(buildPhases);
          setCurrentPhase(curPhase ?? 1);
          setPhaseMode(true);
          const isRunning = status.build.status === "queued" || status.build.status === "running";
          setIsPhaseBuilding(isRunning);
        }
      }

      if (status.build.status === "queued" || status.build.status === "running") {
        buildDoneRef.current = false;
        setIsAiCustomising(true);
      } else if (status.build.status === "completed") {
        buildDoneRef.current = true;
      }

      if (
        status.build.status === "queued" ||
        status.build.status === "running" ||
        status.build.status === "awaiting_scope_confirmation"
      ) {
        if (status.build.status === "awaiting_scope_confirmation") {
          const pending = (status.build as unknown as {
            metadata?: { pendingScope?: { featureCandidates?: string[]; message?: string } };
          }).metadata?.pendingScope;
          if (pending) {
            setScopeFeatures(pending.featureCandidates ?? []);
            setScopeBuildId(status.build.id);
            setScopeMessage(pending.message ?? "Here's what I'm planning to build:");
          }
        }

        setStreamingText("Reconnecting to the live build stream...");
        thinkingLabelIndexRef.current = 0;
        if (thinkingLabelIntervalRef.current) clearInterval(thinkingLabelIntervalRef.current);
        thinkingLabelIntervalRef.current = setInterval(() => {
          const labels = personality.thinkingLabels;
          thinkingLabelIndexRef.current = Math.min(thinkingLabelIndexRef.current + 1, labels.length - 1);
          setStreamingText(labels[thinkingLabelIndexRef.current]);
        }, 4000);

        await subscribeToExistingBuild(
          status.build.id,
          restoredState?.lastEventId ?? status.trace.lastEventId,
          controller.signal,
        );
      }
    })()
      .catch((error: unknown) => {
        setLastError(error instanceof Error ? error.message : "Failed to restore build session.");
      })
      .finally(() => {
        resumingBuildRef.current = false;
      });

    return () => { controller.abort(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [build, id, projectId]);

  // Auto-start from launch intent
  const autoStarted = useRef(false);
  useEffect(() => {
    if (autoStarted.current || !launchIntent?.prompt) return;
    autoStarted.current = true;
    handleSendMessage(launchIntent.prompt);
  }, [handleSendMessage, launchIntent?.prompt]);

  useEffect(() => {
    if (build?.status === "completed" || build?.status === "failed") clearState();
  }, [build?.status, clearState]);

  // Cleanup phase poll on unmount
  useEffect(() => {
    return () => {
      if (phasePollRef.current) { clearInterval(phasePollRef.current); phasePollRef.current = null; }
    };
  }, []);

  // ─── Phase: continue to next phase ────────────────────────────────────────

  const handleNextPhase = useCallback(async () => {
    if (!projectId) return;
    const expectedPhase = currentPhase + 1;
    setIsPhaseBuilding(true);
    setCurrentPhase(expectedPhase);

    buildDoneRef.current = false;
    setIsAiCustomising(true);
    if (aiCustomisingTimeoutRef.current) {
      clearTimeout(aiCustomisingTimeoutRef.current);
      aiCustomisingTimeoutRef.current = null;
    }

    if (phasePollRef.current) { clearInterval(phasePollRef.current); phasePollRef.current = null; }

    thinkingLabelIndexRef.current = 0;
    setStreamingText(personality.thinkingLabels[0]);
    if (thinkingLabelIntervalRef.current) clearInterval(thinkingLabelIntervalRef.current);
    thinkingLabelIntervalRef.current = setInterval(() => {
      const labels = personality.thinkingLabels;
      thinkingLabelIndexRef.current = Math.min(thinkingLabelIndexRef.current + 1, labels.length - 1);
      setStreamingText(labels[thinkingLabelIndexRef.current]);
    }, 4000);

    let phaseCompleted = false;

    const startPhasePoll = () => {
      if (phasePollRef.current) return;
      const pollStart = Date.now();
      const POLL_TIMEOUT = 5 * 60 * 1000;

      phasePollRef.current = setInterval(async () => {
        if (phaseCompleted) {
          if (phasePollRef.current) { clearInterval(phasePollRef.current); phasePollRef.current = null; }
          return;
        }
        if (Date.now() - pollStart > POLL_TIMEOUT) {
          if (phasePollRef.current) { clearInterval(phasePollRef.current); phasePollRef.current = null; }
          setIsPhaseBuilding(false);
          setStreamingText("");
          return;
        }
        try {
          const proj = await getProject(projectId);
          const serverPhase = proj.currentPhase ?? 0;
          if (serverPhase > expectedPhase || (serverPhase === expectedPhase && !proj.phaseMode)) {
            phaseCompleted = true;
            if (phasePollRef.current) { clearInterval(phasePollRef.current); phasePollRef.current = null; }
            setCurrentPhase(serverPhase);
            setIsPhaseBuilding(false);
            setStreamingText("");
            const latestBuild = await getLatestBuildForProject(projectId);
            if (latestBuild) {
              setBuild(latestBuild.build);
              if (latestBuild.result) setBuildResult(latestBuild.result);
              if (latestBuild.trace.previewReady || latestBuild.build.status === "completed") {
                setPreviewGenerationId(latestBuild.build.id);
              }
              setPreviewRefreshKey(c => c + 1);
            }
          }
        } catch (pollErr) {
          console.warn("[NextPhase] Poll error:", pollErr);
        }
      }, 3000);
    };

    const controller = new AbortController();

    try {
      const response = await startNextPhase(projectId);
      const reader = response.body?.getReader();
      if (!reader) throw new Error("No stream body");

      const decoder = new TextDecoder();
      let buffer = "";
      let dataLines: string[] = [];

      const flushEvent = () => {
        if (dataLines.length === 0) return;
        const payload = dataLines.join("\n");
        dataLines = [];
        try {
          const event = JSON.parse(payload) as BuilderV3Event;
          if ("buildId" in event && event.buildId) activeBuildIdRef.current = event.buildId;
          if (event.type === "done" || event.type === "error") {
            phaseCompleted = true;
            if (phasePollRef.current) { clearInterval(phasePollRef.current); phasePollRef.current = null; }
          }
          handleLegacyEvent(event);
        } catch { /* ignore parse errors */ }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) { flushEvent(); break; }
        buffer += decoder.decode(value, { stream: true });
        while (true) {
          const lineBreakIndex = buffer.indexOf("\n");
          if (lineBreakIndex === -1) break;
          const rawLine = buffer.slice(0, lineBreakIndex);
          buffer = buffer.slice(lineBreakIndex + 1);
          const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
          if (line.length === 0) { flushEvent(); continue; }
          if (line.startsWith("id:") || line.startsWith("event:")) continue;
          if (line.startsWith("data:")) { dataLines.push(line.slice(5).trim()); }
        }
      }

      if (!phaseCompleted) startPhasePoll();
    } catch (err) {
      if (!controller.signal.aborted && !phaseCompleted) startPhasePoll();
    }
  }, [projectId, currentPhase, personality.thinkingLabels, buildDoneRef]);

  const handleSkipPhases = useCallback(() => {
    if (phasePollRef.current) { clearInterval(phasePollRef.current); phasePollRef.current = null; }
    setPhaseMode(false);
  }, []);

  // ─── Scope confirmation ───────────────────────────────────────────────────

  const handleScopeConfirm = useCallback(async (features: string[], extras: string) => {
    if (!scopeBuildId) return;
    try {
      await confirmScope(scopeBuildId, features, extras);
      thinkingLabelIndexRef.current = 0;
      setStreamingText(personality.thinkingLabels[0]);
      if (thinkingLabelIntervalRef.current) clearInterval(thinkingLabelIntervalRef.current);
      thinkingLabelIntervalRef.current = setInterval(() => {
        const labels = personality.thinkingLabels;
        thinkingLabelIndexRef.current = Math.min(thinkingLabelIndexRef.current + 1, labels.length - 1);
        setStreamingText(labels[thinkingLabelIndexRef.current]);
      }, 4000);
    } catch (err) {
      console.error("[ScopeConfirm] Failed:", err);
    }
  }, [scopeBuildId, personality.thinkingLabels]);

  // ─── Insufficient credits actions ─────────────────────────────────────────

  const handleInsufficientCreditsUpgrade = useCallback(() => {
    openPricingModal();
  }, [openPricingModal]);

  const handleForceSimple = useCallback(async () => {
    if (!insufficientBuildId) return;
    try {
      await forceSimpleBuild(insufficientBuildId);
      thinkingLabelIndexRef.current = 0;
      setStreamingText(personality.thinkingLabels[0]);
      if (thinkingLabelIntervalRef.current) clearInterval(thinkingLabelIntervalRef.current);
      thinkingLabelIntervalRef.current = setInterval(() => {
        const labels = personality.thinkingLabels;
        thinkingLabelIndexRef.current = Math.min(thinkingLabelIndexRef.current + 1, labels.length - 1);
        setStreamingText(labels[thinkingLabelIndexRef.current]);
      }, 4000);
    } catch (err) {
      console.error("[ForceSimple] Failed:", err);
      throw err;
    }
  }, [insufficientBuildId, personality.thinkingLabels]);

  // ─── Preview refresh ──────────────────────────────────────────────────────

  const handleRefreshPreview = useCallback(() => {
    setPreviewRefreshKey(c => c + 1);
    if (build?.id) setPreviewGenerationId(build.id);
  }, [build?.id]);

  // ─── Export ZIP ───────────────────────────────────────────────────────────

  const handleExportZip = useCallback(async () => {
    if (!projectId || isExporting) return;
    setIsExporting(true);
    try {
      const blob = await exportProjectZip(projectId);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${projectName}.zip`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (err) {
      console.error("[Export] Failed:", err);
    } finally {
      setIsExporting(false);
    }
  }, [projectId, projectName, isExporting]);

  // ─── Resize logic ─────────────────────────────────────────────────────────

  const startResize = useCallback(
    (target: "history" | "chat", e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = target === "history" ? historyPanelWidth : chatPanelWidth;
      dragRef.current = { target, startX, startWidth };

      const onMove = (ev: MouseEvent) => {
        if (!dragRef.current) return;
        const delta = ev.clientX - dragRef.current.startX;
        const raw = dragRef.current.startWidth + delta;
        const newWidth = raw < 100 ? 0 : Math.max(150, Math.min(500, raw));
        if (dragRef.current.target === "history") {
          setHistoryPanelWidth(newWidth || 220);
          if (newWidth === 0) setShowHistory(false);
        } else {
          setChatPanelWidth(newWidth || 380);
          if (newWidth === 0) setShowChat(false);
        }
      };

      const onUp = () => {
        dragRef.current = null;
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [chatPanelWidth, historyPanelWidth],
  );

  const ResizeHandle = ({ target }: { target: "history" | "chat" }) => (
    <div
      onMouseDown={e => startResize(target, e)}
      className="w-1 shrink-0 cursor-col-resize bg-transparent transition-colors hover:bg-[#F97316]/20 active:bg-[#F97316]/30"
      title="Drag to resize"
    />
  );

  // ─── Copy code handler ────────────────────────────────────────────────────

  const handleCopyCode = useCallback(() => {
    if (!buildResult || !selectedFile) return;
    const file = buildResult.files.find(f => f.path === selectedFile);
    if (!file) return;
    void navigator.clipboard.writeText(file.content as string);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 1500);
  }, [buildResult, selectedFile]);

  useEffect(() => {
    if (buildResult && buildResult.files.length > 0 && !selectedFile) {
      setSelectedFile(buildResult.files[0].path);
    }
  }, [buildResult, selectedFile]);

  // ─── Code panel ───────────────────────────────────────────────────────────

  const renderCodePanel = () => {
    const files = buildResult?.files ?? [];
    if (files.length === 0) {
      return (
        <div className="flex flex-1 items-center justify-center">
          <div className="flex max-w-xs flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-[#e5e5e5] p-12 text-center">
            <Code2 className="h-8 w-8 text-[#d1d5db]" />
            <p className="text-sm text-[#9ca3af]">Generated code will appear here</p>
          </div>
        </div>
      );
    }

    const grouped: Record<FileSection, Array<(typeof files)[number]>> = {
      ROUTES: [], COMPONENTS: [], CONFIG: [], OTHER: [],
    };
    for (const file of files) {
      grouped[classifyFile(file.path, file.kind)].push(file);
    }

    const sectionOrder: FileSection[] = ["ROUTES", "COMPONENTS", "CONFIG", "OTHER"];
    const currentFile = files.find(f => f.path === selectedFile);

    return (
      <div className="flex min-h-0 flex-1">
        <div className="w-48 flex-shrink-0 overflow-y-auto border-r border-[#e5e5e5] bg-[#faf9f6]">
          <div className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-[#9ca3af]">Files</div>
          <div className="pb-2">
            {sectionOrder.map(section => {
              const sectionFiles = grouped[section];
              if (sectionFiles.length === 0) return null;
              return (
                <div key={section}>
                  <div className="px-3 pb-1 pt-3 text-[9px] font-semibold uppercase tracking-wider text-[#9ca3af]">
                    {section}
                  </div>
                  {sectionFiles.map(f => (
                    <button
                      key={f.path}
                      onClick={() => setSelectedFile(f.path)}
                      className={cn(
                        "flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-xs transition-colors",
                        selectedFile === f.path
                          ? "border-r-2 border-[#F97316] bg-white font-medium text-[#1a1a1a]"
                          : "text-[#6b7280] hover:bg-white/60 hover:text-[#1a1a1a]",
                      )}
                    >
                      <span className="flex-1 truncate font-mono">{f.path.split("/").pop()}</span>
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-[#0a0a0a]">
          <div className="flex flex-shrink-0 items-center justify-between border-b border-gray-800 px-4 py-2">
            <span className="font-mono text-xs text-gray-400">{selectedFile}</span>
            <button
              onClick={handleCopyCode}
              className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-500 transition-colors hover:text-white"
            >
              {copiedCode ? <><Check className="h-3 w-3" /> Copied!</> : <><Copy className="h-3 w-3" /> Copy</>}
            </button>
          </div>
          <pre className="flex-1 overflow-auto whitespace-pre p-4 font-mono text-xs leading-relaxed text-gray-300">
            {currentFile?.content ?? ""}
          </pre>
        </div>
      </div>
    );
  };

  // ─── Main content area ────────────────────────────────────────────────────

  const renderMainContent = () => {
    switch (activeView) {
      case "preview":
        return (
          <PreviewPane
            files={buildResult?.files}
            generationId={previewGenerationId}
            isAiCustomising={isAiCustomising}
            previewEntryPath={buildResult?.previewEntryPath ?? null}
            project={
              projectId && build?.templateId
                ? { id: projectId, name: projectName, templateId: build.templateId as TemplateId }
                : null
            }
            refreshToken={previewRefreshKey}
            onFilesWritten={handleFilesWrittenToWC}
            buildFailed={buildFailed}
          />
        );
      case "code":
        return renderCodePanel();
      case "database":
        return (
          <DatabasePanel
            className="flex-1"
            projectId={projectId}
            databaseEnabled={dbEnabled}
            dbProvider={dbProvider}
            dbWired={dbWired}
            plan={credits?.plan ?? "free"}
            onDbStateChange={fetchDbState}
          />
        );
      case "integrations":
        return <IntegrationsPanel className="flex-1" />;
      default:
        return null;
    }
  };

  // ─── Adapt new ChatMessage to legacy ChatPanel interface ──────────────────
  // BEO-364 will update ChatPanel to accept the new discriminated union directly.
  // Until then, map the new types to the shape ChatPanel currently renders.

  const legacyMessages: LegacyChatMessage[] = messages.map(msg => {
    switch (msg.type) {
      case "user":
        return {
          id: msg.id,
          role: "user" as const,
          content: msg.content,
          timestamp: msg.timestamp.toISOString(),
        };
      case "question_answer":
        return {
          id: msg.id,
          role: "assistant" as const,
          content: msg.content,
          timestamp: new Date().toISOString(),
        };
      case "pre_build_ack":
        return {
          id: msg.id,
          role: "assistant" as const,
          content: msg.content,
          timestamp: new Date().toISOString(),
        };
      case "building":
        return {
          id: msg.id,
          role: "assistant" as const,
          content: msg.phase ?? "",
          timestamp: new Date().toISOString(),
        };
      case "build_summary":
        return {
          id: msg.id,
          role: "assistant" as const,
          content: msg.content,
          timestamp: new Date().toISOString(),
          changedFiles: msg.filesChanged,
        };
      case "clarifying_question":
        return {
          id: msg.id,
          role: "assistant" as const,
          content: msg.content,
          timestamp: new Date().toISOString(),
        };
      case "error":
        return {
          id: msg.id,
          role: "assistant" as const,
          content: msg.content,
          timestamp: new Date().toISOString(),
          error: msg.content,
        };
      case "server_restarting":
        return {
          id: msg.id,
          role: "assistant" as const,
          content: "",
          timestamp: new Date().toISOString(),
          isServerRestartCard: true,
        };
    }
  });

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col bg-[#faf9f6]">
      <TopBar
        projectName={projectName}
        projectIcon={projectIcon}
        onProjectNameChange={setProjectName}
        onRefreshPreview={handleRefreshPreview}
        userMode={userMode}
        onUserModeChange={setUserMode}
        activeView={activeView}
        onActiveViewChange={setActiveView}
        showSidebar={showChat}
        onToggleSidebar={() => setShowChat(v => !v)}
        isPublished={isPublished}
        onPublish={() => setShowPublishModal(true)}
        onExportZip={handleExportZip}
        isExporting={isExporting}
        beomzAppUrl={beomzAppUrl}
        phaseMode={phaseMode}
        currentPhase={currentPhase}
        phasesTotal={phases.length}
      />

      <div className="flex min-h-0 flex-1">
        {/* History panel */}
        <div
          className="shrink-0 overflow-hidden border-r border-[#e5e5e5] bg-[#faf9f6] transition-[width] duration-200 ease-in-out"
          style={{ width: showHistory ? historyPanelWidth : 0 }}
        >
          <div className="h-full" style={{ minWidth: historyPanelWidth }}>
            <HistoryPanel projectId={projectId} activeGenerationId={build?.id} />
          </div>
        </div>
        {showHistory && <ResizeHandle target="history" />}

        {/* Chat panel */}
        <div
          className="shrink-0 overflow-hidden transition-[width] duration-200 ease-in-out"
          style={{ width: showChat ? chatPanelWidth : 0 }}
        >
          <div className="h-full" style={{ width: chatPanelWidth, minWidth: chatPanelWidth }}>
            <ChatPanel
              messages={legacyMessages}
              isStreaming={isBuilding}
              streamingText={transport === "idle" ? "" : streamingText}
              onSendMessage={handleSendMessage}
              onStopStreaming={handleStopStreaming}
              onRetry={retryLastBuild}
              onViewCode={() => {
                setActiveView("code");
                const firstFile = buildResult?.files?.[0]?.path;
                if (firstFile) setSelectedFile(firstFile);
              }}
              width={chatPanelWidth}
              suggestionChips={suggestionChips}
              onDismissChips={() => setSuggestionChips([])}
              creditsBalance={credits?.balance}
              phaseCard={
                phaseMode && phases.length > 0 ? (
                  <PhasePlanCard
                    phases={phases}
                    currentPhase={currentPhase}
                    isBuilding={isPhaseBuilding}
                    onContinue={handleNextPhase}
                    onSkip={handleSkipPhases}
                  />
                ) : undefined
              }
              scopeCard={
                scopeBuildId && scopeFeatures.length > 0 ? (
                  <FeatureScopeCard
                    features={scopeFeatures}
                    buildId={scopeBuildId}
                    message={scopeMessage}
                    onConfirm={handleScopeConfirm}
                  />
                ) : undefined
              }
              insufficientCreditsCard={
                insufficientBuildId ? (
                  <InsufficientCreditsCard
                    available={insufficientAvailable}
                    required={insufficientRequired}
                    features={insufficientFeatures}
                    buildId={insufficientBuildId}
                    onUpgrade={handleInsufficientCreditsUpgrade}
                    onSimpleBuild={handleForceSimple}
                  />
                ) : undefined
              }
              serverRestartedCard={<ServerRestartedCard onRetry={retryLastBuild} />}
              streamingFileCount={streamingFileCount}
            />
          </div>
        </div>
        {showChat && <ResizeHandle target="chat" />}

        {/* Main content */}
        <div className="flex min-w-0 flex-1 flex-col">
          {renderMainContent()}
        </div>
      </div>

      <BuilderModals
        showShareModal={showShareModal}
        onCloseShareModal={() => setShowShareModal(false)}
        showOutOfCreditsModal={showOutOfCreditsModal}
        onCloseOutOfCreditsModal={() => setShowOutOfCreditsModal(false)}
      />

      {showPublishModal && projectId && (
        <PublishModal
          projectId={projectId}
          projectName={projectName}
          isPublished={isPublished}
          publishedSlug={publishedSlug ?? undefined}
          beomzAppUrl={beomzAppUrl}
          onClose={() => setShowPublishModal(false)}
          onPublished={(_url, slug) => {
            setIsPublished(true);
            setPublishedSlug(slug);
          }}
          onUnpublished={() => {
            setIsPublished(false);
            setPublishedSlug(null);
          }}
          onVercelDeployed={url => {
            setBeomzAppUrl(url);
          }}
          onVercelUnpublished={() => {
            setBeomzAppUrl(null);
          }}
        />
      )}
    </div>
  );
}
