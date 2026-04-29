/**
 * ProjectPage — V2 builder with resizable panels, TopBar tab switcher,
 * Preview / Code / Database / Integrations views.
 * Light mode — cream #faf9f6 throughout.
 *
 * BEO-363: All build logic + SSE event handling lives in useBuildChat.
 * BEO-367: Phase UI, scope confirmation, and InsufficientCreditsCard removed.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { BuilderV3Event, StudioFile, TemplateId } from "@beomz-studio/contracts";
import { useNavigate, useParams } from "@tanstack/react-router";
import { Copy, Check, Code2, ChevronLeft, ChevronRight } from "lucide-react";
import {
  TopBar,
  ChatPanel,
  BuilderModals,
  DatabasePanel,
  IntegrationsPanel,
  PublishModal,
  type ActiveView,
} from "../../../components/builder";
import { HistoryPanel, PreviewPane, VersionHistoryPanel } from "../../../components/studio";
import {
  getBuildStatus,
  getLatestBuildForProject,
  getProjectDbState,
  exportProjectZip,
  listProjectsWithMeta,
  type BuildPayload,
  type BuildStatusResponse,
} from "../../../lib/api";
import { getOrBootWebContainer, isWebContainerSupported, teardownWebContainer } from "../../../lib/webcontainer";
import { consumeProjectLaunchIntent } from "../../../lib/projectLaunchIntent";
import { useBuilderPersistence } from "../../../hooks/useBuilderPersistence";
import { useBuilderSessionHealth } from "../../../hooks/useBuilderSessionHealth";
import { useBuildChat } from "../../../hooks/useBuildChat";
import { useSSEBuildStream } from "../../../hooks/useSSEBuildStream";
import { useAuth } from "../../../lib/useAuth";
import { cn } from "../../../lib/cn";
import { useCredits } from "../../../lib/CreditsContext";
import { getSuggestionChips } from "../../../lib/getSuggestionChips";
import { getApiBaseUrl } from "../../../lib/api";

// ─────────────────────────────────────────────
// File grouping helper for Code panel
// ─────────────────────────────────────────────

type FileSection = "ROUTES" | "COMPONENTS" | "CONFIG" | "OTHER";

/** BEO-715 2e: client-side build timeout. Last-line defence above the WC's
 *  own 30s stuck-dev-server safety net and Track B's server-side 5-min cap. */
const BUILD_CLIENT_TIMEOUT_MS = 5 * 60 * 1000;

function classifyFile(path: string, kind?: string): FileSection {
  if (kind === "route" || /\/(screens|pages|routes)\//.test(path) || /(^|\/)app\.tsx$/i.test(path)) return "ROUTES";
  if (kind === "component" || /\/components\//.test(path)) return "COMPONENTS";
  if (/\/(theme|config|data)\b/.test(path) || /\.(json|config)\b/.test(path)) return "CONFIG";
  return "OTHER";
}

/** BEO-570: has an active Vercel deployment when the API sends vercel_deployment_id or a beomz.app URL exists. */
function projectHasActiveVercelDeployment(
  project: BuildStatusResponse["project"],
  beomzAppUrlFallback: string | null,
): boolean {
  const id = (project as { vercel_deployment_id?: string | null }).vercel_deployment_id;
  if (typeof id === "string" && id.trim().length > 0) return true;
  return Boolean(beomzAppUrlFallback?.trim());
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
  const [activeView, setActiveView] = useState<ActiveView>("preview");

  const { setLastError, setTransport } = useBuilderSessionHealth();
  const { clearState, restoreState, saveState } = useBuilderPersistence(projectId);

  // ─── BEO-484: user data for chat personalisation ─────────────────────────
  const { session } = useAuth();
  const chatUserData = (() => {
    const user = session?.user;
    const rawAvatarUrl = user?.user_metadata?.avatar_url as string | undefined;
    const proxiedAvatarUrl = rawAvatarUrl?.includes("googleusercontent.com")
      ? `${getApiBaseUrl()}/avatar?url=${encodeURIComponent(rawAvatarUrl)}`
      : rawAvatarUrl;
    const fullName =
      (user?.user_metadata?.full_name as string | undefined)
      ?? (user?.user_metadata?.display_name as string | undefined)
      ?? (user?.user_metadata?.name as string | undefined)
      ?? "";
    const firstName = fullName.trim().split(" ")[0] ?? "";
    const initials = fullName
      .trim()
      .split(" ")
      .slice(0, 2)
      .map((n: string) => n[0]?.toUpperCase() ?? "")
      .join("");
    return {
      userFirstName: firstName || undefined,
      userAvatarUrl: proxiedAvatarUrl || undefined,
      userInitials: initials || undefined,
    };
  })();

  // ─── useBuildChat ────────────────────────────────────────────────────────

  const {
    messages,
    isBuilding,
    isIterationBuild,
    sendMessage,
    retryLastBuild,
    stopBuild,
    reportIssue,
    buildDoneRef,
    subscribeToExistingBuild,
    notifyPreviewServerReady,
    chatModeActive,
    toggleChatMode,
    implementWithPlan,
    implementSuggestion,
    dismissImplementSuggestion,
    isAnalysingImage,
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
      // BEO-474: Do NOT pre-populate buildResult here even when trace.previewReady
      // is true. onBuildStarted fires before build_confirmed, so isBuildInProgress
      // is still false — delivering scaffold now would bypass the WC guard and flash
      // the template before AI finishes. Scaffold and real files both arrive via the
      // preview_ready / done SSE events after build_confirmed (isBuildInProgress=true).
    },
    onOutOfCredits: (isHardBlock) => {
      setIsHardBlockCredits(isHardBlock);
      setShowOutOfCreditsModal(true);
    },
  });

  // ─── BEO-587: Stop / force-stop state ────────────────────────────────────
  const [isStopPending, setIsStopPending] = useState(false);
  // Snapshot taken at the start of each iteration so we can revert if no FS writes happened.
  const lastGoodSnapshotRef = useRef<{
    buildResult: BuildStatusResponse["result"] | null;
    previewGenerationId: string | null;
  } | null>(null);
  const filesWrittenThisBuildRef = useRef(false);

  // Clear stop-pending when build settles to idle
  useEffect(() => {
    if (!isBuilding && isStopPending) setIsStopPending(false);
  }, [isBuilding, isStopPending]);

  // ─── Build / preview state ────────────────────────────────────────────────

  const [lastEventId, setLastEventId] = useState<string | null>(null);
  const [build, setBuild] = useState<BuildPayload | null>(null);
  const [buildResult, setBuildResult] = useState<BuildStatusResponse["result"] | null>(null);
  const [buildFailed, setBuildFailed] = useState(false);
  const [buildErrorMessage, setBuildErrorMessage] = useState<string | null>(null);
  const [creditsUsed, setCreditsUsed] = useState<number | null>(null);
  const [previewGenerationId, setPreviewGenerationId] = useState<string | null>(null);
  const [previewRefreshKey, setPreviewRefreshKey] = useState(0);
  const [isAiCustomising, setIsAiCustomising] = useState(false);
  const aiCustomisingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // BEO-374 Bug 4: stable ref tracking the current previewGenerationId so
  // handleSendMessage can capture the pre-build value without adding the state
  // to its dependency array. Restored when done.conversational === true.
  const previewGenerationIdRef = useRef<string | null>(null);
  const savedPreviewGenerationIdRef = useRef<string | null>(null);
  // Keep the ref in sync with state on every render (before any callbacks run).
  previewGenerationIdRef.current = previewGenerationId;
  // BEO-715 2b: stable mirror of buildResult so callbacks/effects that need
  // to read its current value don't have to list it as a dep (avoiding the
  // re-render churn that previously bled into the auto-start and fireBuild
  // memos). Reads only — never written from outside this render hook.
  const buildResultRef = useRef<BuildStatusResponse["result"] | null>(null);
  buildResultRef.current = buildResult;
  const activeBuildIdRef = useRef<string | null>(null);
  const resumingBuildRef = useRef(false);

  // ─── Suggestion chips ─────────────────────────────────────────────────────

  const [suggestionChips, setSuggestionChips] = useState<string[]>([]);

  const { credits, deductOptimistic, refresh: refreshCredits } = useCredits();
  const [showOutOfCreditsModal, setShowOutOfCreditsModal] = useState(false);
  const [isHardBlockCredits, setIsHardBlockCredits] = useState(false);

  // ─── Panel layout state ───────────────────────────────────────────────────

  const [showChat, setShowChat] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [chatPanelWidth, setChatPanelWidth] = useState(380);
  const [historyPanelWidth, setHistoryPanelWidth] = useState(220);
  const VERSION_HISTORY_WIDTH = 300;

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
  const [beomzAppUrl, setBeomzAppUrl] = useState<string | null>(null);
  const [showPublishModal, setShowPublishModal] = useState(false);
  // BEO-715 2c (BEO-714 fix): bump on every build_summary / done event so the
  // open VersionHistoryPanel re-fetches without needing to be reopened.
  const [versionRefreshKey, setVersionRefreshKey] = useState(0);
  /** BEO-570: preview ahead of last live Vercel deploy; cleared on successful redeploy (local only). */
  const [hasUnsyncedChanges, setHasUnsyncedChanges] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  // BEO-576: DB-backed custom domain state (sourced from project record on load)
  const [activeDomain, setActiveDomain] = useState<string | null>(null);
  const [domainStatus, setDomainStatus] = useState<string | null>(null);

  // ─── Database state ───────────────────────────────────────────────────────

  const [dbEnabled, setDbEnabled] = useState(false);
  const [dbProvider, setDbProvider] = useState<string | null>(null);
  const [dbWired, setDbWired] = useState(false);
  const [neonDbUrl, setNeonDbUrl] = useState<string | null>(null);
  const [byoDbHost, setByoDbHost] = useState<string | null>(null);

  // ─── SSE event handler ─────────────────────────────────────────────────────
  // Handles preview overlay, project-name updates, and suggestion chips.
  // Phase / scope / insufficient-credits events are ignored (BEO-367).

  function handleLegacyEvent(event: BuilderV3Event) {
    setLastEventId(event.id);

    if ("buildId" in event && event.buildId) {
      activeBuildIdRef.current = event.buildId;
    }

    // BEO-464: build confirmed — NOW start the preview overlay.
    // This only fires for real builds, never for greetings/questions.
    if (event.type === "build_confirmed") {
      if (aiCustomisingTimeoutRef.current) {
        clearTimeout(aiCustomisingTimeoutRef.current);
        aiCustomisingTimeoutRef.current = null;
      }
      setIsAiCustomising(true);
    }

    // Conversational response — clear the building overlay immediately so the
    // preview doesn't flash behind "Building your app…" for question answers.
    // BEO-374 Bug 4.
    if (event.type === "conversational_response") {
      if (aiCustomisingTimeoutRef.current) {
        clearTimeout(aiCustomisingTimeoutRef.current);
        aiCustomisingTimeoutRef.current = null;
      }
      setIsAiCustomising(false);
    }

    // Preview ready — trigger WebContainer file write
    if (event.type === "preview_ready") {
      setProjectId(event.projectId);
      setIsAiCustomising(true);
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
      if (!event.fallbackUsed) {
        if (event.conversational) {
          // Conversational response — clear overlay and restore the preview to its
          // pre-build state so no iframe remount occurs. BEO-374 Bug 4.
          if (aiCustomisingTimeoutRef.current) {
            clearTimeout(aiCustomisingTimeoutRef.current);
            aiCustomisingTimeoutRef.current = null;
          }
          setIsAiCustomising(false);
          setPreviewGenerationId(savedPreviewGenerationIdRef.current);
        } else {
          // Real build done — 8s overlay timer then lift
          if (aiCustomisingTimeoutRef.current) clearTimeout(aiCustomisingTimeoutRef.current);
          aiCustomisingTimeoutRef.current = setTimeout(() => {
            aiCustomisingTimeoutRef.current = null;
            setIsAiCustomising(false);
          }, 8000);

          void getBuildStatus(event.buildId)
            .then(status => {
              if (status.result) setBuildResult(status.result);

              // BEO-474: if the build "succeeded" but delivered 0 files, treat it as
              // a failure so the error overlay is shown rather than silently keeping
              // the scaffold template visible. The API should set fallbackUsed=true in
              // this case — flag to Codex if this fires unexpectedly.
              //
              // BEO-482 NUCLEAR Fix 4: also clear buildResult so the WC hook receives
              // null files — the zero-files state must render as a React error overlay
              // only, never via wc.mount() or IndexedDB.
              if (!status.result || !status.result.files || status.result.files.length === 0) {
                if (aiCustomisingTimeoutRef.current) {
                  clearTimeout(aiCustomisingTimeoutRef.current);
                  aiCustomisingTimeoutRef.current = null;
                }
                setIsAiCustomising(false);
                setBuildResult(null);
                setBuildFailed(true);
                setBuildErrorMessage("Build completed but no files were generated. Please try again.");
                return;
              }

              // BEO-570: iteration on a project with a live Vercel deploy — preview is ahead until redeploy
              if (
                isIterationBuild
                && projectHasActiveVercelDeployment(status.project, beomzAppUrl)
              ) {
                setHasUnsyncedChanges(true);
              }

              if (status.project.name && status.project.name !== "Untitled project") {
                setProjectName(status.project.name);
              }
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
              deductOptimistic(5);
              void refreshCredits();
            })
            .catch(() => {});
        }
      } else {
        if (aiCustomisingTimeoutRef.current) {
          clearTimeout(aiCustomisingTimeoutRef.current);
          aiCustomisingTimeoutRef.current = null;
        }
        setIsAiCustomising(false);
        setBuildFailed(true);
        if (event.fallbackReason) setBuildErrorMessage(event.fallbackReason);
      }
    }

    // Error — clear overlay, set failed state
    if (event.type === "error") {
      if (event.code !== "server_restarting") {
        if (aiCustomisingTimeoutRef.current) {
          clearTimeout(aiCustomisingTimeoutRef.current);
          aiCustomisingTimeoutRef.current = null;
        }
        setIsAiCustomising(false);
        setBuildFailed(true);
        if (event.message) setBuildErrorMessage(event.message);
      }
    }

    // Build summary — capture actual credits used for PreviewPane overlay
    if (event.type === "build_summary") {
      if (typeof event.creditsUsed === "number") {
        setCreditsUsed(event.creditsUsed);
      }
      // BEO-715 2c (BEO-714 fix): API has just persisted a version snapshot —
      // poke the version panel to re-fetch so it shows the new entry without
      // the user having to close + reopen it.
      setVersionRefreshKey(k => k + 1);
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
  }

  // ─── WebContainer overlay gating ─────────────────────────────────────────
  // Called by PreviewPane after new files land in the WC sandbox.
  // Only lifts the overlay once the build has fully completed with real AI files.

  const handleFilesWrittenToWC = useCallback(() => {
    filesWrittenThisBuildRef.current = true;
    if (!buildDoneRef.current) return;
    if (aiCustomisingTimeoutRef.current) {
      clearTimeout(aiCustomisingTimeoutRef.current);
      aiCustomisingTimeoutRef.current = null;
    }
    setTimeout(() => setIsAiCustomising(false), 400);
  }, [buildDoneRef]);

  // ─── Send message ─────────────────────────────────────────────────────────

  // BEO-704: internal — preps state then fires build. Shared by handleSendMessage and setup card.
  const fireBuild = useCallback(
    (
      text: string,
      imageUrl?: string,
      isSystem?: boolean,
      buildMeta?: { withDatabase?: boolean; withAuth?: boolean },
    ) => {
      setBuildFailed(false);
      setBuildErrorMessage(null);
      setCreditsUsed(null);
      buildDoneRef.current = false;
      // BEO-587: snapshot current state before each new iteration so stop can revert if needed.
      // BEO-715 2b: read buildResult via ref so this callback stays stable across renders —
      // previously every buildResult change recreated fireBuild, which trickled into
      // handleSendMessage and the auto-start effect.
      lastGoodSnapshotRef.current = {
        buildResult: buildResultRef.current,
        previewGenerationId: previewGenerationIdRef.current,
      };
      filesWrittenThisBuildRef.current = false;
      // BEO-374 Bug 4: snapshot the current preview ID so conversational done
      // can restore it and avoid reloading the preview for question answers.
      savedPreviewGenerationIdRef.current = previewGenerationIdRef.current;
      // BEO-464: do NOT set isAiCustomising here — wait for build_confirmed SSE.
      // For greetings/questions, the overlay should never appear.
      // Clear any lingering overlay timer from a previous build.
      if (aiCustomisingTimeoutRef.current) {
        clearTimeout(aiCustomisingTimeoutRef.current);
        aiCustomisingTimeoutRef.current = null;
      }
      sendMessage(text, imageUrl, isSystem, buildMeta);
    },
    // BEO-715: intentionally omitted: [buildResult] — read via buildResultRef
    // so fireBuild stays stable and doesn't churn handleSendMessage / auto-start.
    [sendMessage, buildDoneRef],
  );

  const handleSendMessage = useCallback(
    (text: string, imageUrl?: string, isSystem?: boolean) => {
      if (credits && credits.balance <= 0) {
        setIsHardBlockCredits(false);
        setShowOutOfCreditsModal(true);
        return;
      }
      fireBuild(text, imageUrl, isSystem);
    },
    [credits, fireBuild],
  );

  // BEO-715 2e (handler — body filled in by retryLastBuild from useBuildChat).
  // Must NOT bring back the setup-card path; we always silent-retry the last prompt.
  const handleRetry = useCallback(() => {
    retryLastBuild();
  }, [retryLastBuild]);

  // ─── Wire to database (fires after Neon provisioning) ────────────────────

  const handleWireToDatabase = useCallback(
    (prompt: string, options?: { forceIteration?: boolean }) => {
      setActiveView("preview");
      if (options?.forceIteration) {
        // BEO-541: route through implementWithPlan so the build body carries
        // `implementPlan`, which makes the API's `hasExplicitImplementSignal()`
        // bypass `detectIntent()` — fires a silent iteration with no plan card
        // and no Implement button. Used for the Supabase BYO rewire whose short
        // prompt would otherwise be classified as plan mode.
        void implementWithPlan(prompt);
        return;
      }
      handleSendMessage(prompt, undefined, true);
    },
    [handleSendMessage, setActiveView, implementWithPlan],
  );

  // ─── Stop streaming ───────────────────────────────────────────────────────

  const handleStopStreaming = useCallback(() => {
    // BEO-587: abort the SSE stream and set idle immediately
    stopBuild();
    setTransport("idle");
    // Clear any building overlay
    if (aiCustomisingTimeoutRef.current) {
      clearTimeout(aiCustomisingTimeoutRef.current);
      aiCustomisingTimeoutRef.current = null;
    }
    setIsAiCustomising(false);
    // Revert to last good snapshot if no files were written to WC yet
    if (!filesWrittenThisBuildRef.current && lastGoodSnapshotRef.current) {
      setBuildResult(lastGoodSnapshotRef.current.buildResult);
      setPreviewGenerationId(lastGoodSnapshotRef.current.previewGenerationId);
    }
    setIsStopPending(true);
  }, [stopBuild, setTransport]);

  // ─── Force stop (BEO-587) ─────────────────────────────────────────────────

  const handleForceStop = useCallback(async () => {
    // Hard-kill the WebContainer — next build will boot fresh
    stopBuild();
    setTransport("idle");
    if (aiCustomisingTimeoutRef.current) {
      clearTimeout(aiCustomisingTimeoutRef.current);
      aiCustomisingTimeoutRef.current = null;
    }
    setIsAiCustomising(false);
    setIsStopPending(false);
    setBuildFailed(false);
    setBuildErrorMessage(null);
    setCreditsUsed(null);
    // Restore last known good files (even if partial writes occurred)
    if (lastGoodSnapshotRef.current) {
      setBuildResult(lastGoodSnapshotRef.current.buildResult);
      setPreviewGenerationId(lastGoodSnapshotRef.current.previewGenerationId);
    } else {
      setBuildResult(null);
      setPreviewGenerationId(null);
    }
    filesWrittenThisBuildRef.current = false;
    await teardownWebContainer();
  }, [stopBuild, setTransport]);

  // ─── Data fetches ─────────────────────────────────────────────────────────

  const fetchDbState = useCallback(async () => {
    if (!projectId) return;
    try {
      const state = await getProjectDbState(projectId);
      setDbEnabled(state.database_enabled);
      setDbProvider(state.db_provider);
      setDbWired(state.db_wired);
      const supabaseHost = state.supabaseUrl
        ? (() => { try { return new URL(state.supabaseUrl!).hostname; } catch { return null; } })()
        : null;
      setByoDbHost(state.byoDbHost ?? supabaseHost ?? null);
      if (state.db_wired && isWebContainerSupported()) {
        try {
          const { wc } = await getOrBootWebContainer();
          if (state.db_provider === "neon" && state.neonDbUrl) {
            // BEO-428: inject Neon connection string so VITE_DATABASE_URL is
            // available at Vite startup and picked up via env-file hot reload.
            // BEO-424: also inject VITE_PROJECT_ID for auth fetch helpers.
            await wc.fs.writeFile(
              ".env.local",
              `VITE_DATABASE_URL=${state.neonDbUrl}\nVITE_PROJECT_ID=${projectId}\n`,
            );
            // BEO-452: store in state so PreviewPane re-injects after hot-swap mounts.
            setNeonDbUrl(state.neonDbUrl);
          } else if (state.supabaseUrl && state.anonKey) {
            const envContent = [
              `VITE_SUPABASE_URL=${state.supabaseUrl}`,
              `VITE_SUPABASE_ANON_KEY=${state.anonKey}`,
              `VITE_DB_SCHEMA=${state.schemaName ?? "public"}`,
              "",
            ].join("\n");
            await wc.fs.writeFile(".env.local", envContent);
          }
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
            // BEO-576: DB-backed custom domain status
            custom_domain?: string | null;
            domain_status?: string | null;
          })
        | undefined;
      if (proj) {
        setIsPublished(Boolean(proj.published));
        setBeomzAppUrl(proj.beomz_app_url ?? null);
        // BEO-576: read domain status from DB so Live tag persists on refresh
        setActiveDomain(proj.custom_domain ?? null);
        setDomainStatus(proj.domain_status ?? null);
      }
    }).catch(() => {});
  }, [projectId, id]);

  useEffect(() => {
    if (!projectId) return;
    saveState({
      buildId: build?.id ?? null,
      lastEventId,
      previewGenerationId,
    });
  }, [build?.id, lastEventId, previewGenerationId, projectId, saveState]);

  // ─── BEO-715 2a: resume an in-flight build via useSSEBuildStream ─────────
  //
  // Architecture:
  //   1. Hydration effect (below) fetches the latest build for the project,
  //      hydrates ProjectPage state (build, projectName, buildResult,
  //      previewGenerationId, lastEventId), and — only if the build is
  //      queued/running — sets `resumeBuildId` to trigger the hook.
  //   2. `useSSEBuildStream` (further below) owns the AbortController and
  //      drives `subscribeToExistingBuild` exactly once per buildId change.
  //
  // History:
  //   BEO-691 (already shipped) excluded `build` from this effect's deps
  //   because including it caused `setBuild()` inside the async body to
  //   abort the controller mid-flight ("Launching preview" hang). The split
  //   here makes that bug structurally impossible: the hydration effect no
  //   longer owns a controller, and the hook's controller is keyed on
  //   buildId so state updates from inside the SSE stream cannot abort it.
  const [resumeBuildId, setResumeBuildId] = useState<string | null>(null);
  const [resumeLastEventId, setResumeLastEventId] = useState<string | null>(null);

  useEffect(() => {
    if (resumingBuildRef.current || id === "new" || !projectId || build) return;
    resumingBuildRef.current = true;
    let cancelled = false;

    void (async () => {
      const restoredState = restoreState();
      const status = restoredState?.buildId
        ? await getBuildStatus(restoredState.buildId)
        : await getLatestBuildForProject(projectId);

      if (!status || cancelled) return;

      activeBuildIdRef.current = status.build.id;
      setBuild(status.build);
      setProjectName(status.project.name);
      setProjectIcon(status.project.icon ?? null);
      setProjectId(status.project.id);

      const isActive =
        status.build.status === "queued" || status.build.status === "running";

      if (isActive) {
        buildDoneRef.current = false;
        setIsAiCustomising(true);
      } else if (status.build.status === "completed") {
        buildDoneRef.current = true;
      }

      if (status.result) setBuildResult(status.result);
      setPreviewGenerationId(
        restoredState?.previewGenerationId
        ?? (status.trace.previewReady || status.build.status === "completed" ? status.build.id : null),
      );
      setLastEventId(restoredState?.lastEventId ?? status.trace.lastEventId);

      // Trigger the SSE subscription LAST so React batches the prior state
      // updates (build / buildResult / previewGenerationId) before the hook
      // creates its controller and starts streaming. The
      // useWebContainerPreview scaffold guard still blocks wc.mount until
      // isBuildInProgress flips, so no stale scaffold can sneak through.
      if (isActive) {
        setResumeLastEventId(restoredState?.lastEventId ?? status.trace.lastEventId);
        setResumeBuildId(status.build.id);
      }
    })()
      .catch((error: unknown) => {
        if (cancelled) return;
        const name = error instanceof Error ? error.name : "";
        if (name === "AbortError") return;
        setLastError(error instanceof Error ? error.message : "Failed to restore build session.");
      })
      .finally(() => {
        resumingBuildRef.current = false;
      });

    return () => {
      cancelled = true;
      // Allow a true remount (navigate away + back) to re-arm the resume.
      resumingBuildRef.current = false;
    };
  // BEO-715: intentionally omitted: [build, restoreState, setLastError,
  // subscribeToExistingBuild]. `build` is the historical bug from BEO-691;
  // the others are stable refs/callbacks read via closure. Only [id, projectId]
  // should re-arm the hydration.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, projectId]);

  // BEO-715 2a: drives SSE for any active resumed build. The hook owns the
  // AbortController, so `setResumeBuildId(null)` from anywhere (Stop button,
  // 5-min timeout in 2e, build completing) cleanly tears down the stream.
  useSSEBuildStream({
    buildId: resumeBuildId,
    lastEventId: resumeLastEventId,
    subscribe: subscribeToExistingBuild,
  });

  // Clear the resume hook's buildId once the build settles so we don't keep
  // the hook armed against a finished stream. Status flips to terminal when
  // `done` / `error` lands; that's our cue to retire the resume.
  useEffect(() => {
    if (!resumeBuildId) return;
    if (build && build.id === resumeBuildId) {
      const isTerminal =
        build.status === "completed"
        || build.status === "failed"
        || build.status === "cancelled"
        || build.status === "timed_out";
      if (isTerminal) {
        setResumeBuildId(null);
        setResumeLastEventId(null);
      }
    }
  }, [build, resumeBuildId]);

  // ─── BEO-715 2e: 5-minute client-side build timeout ──────────────────────
  //
  // Server-side has its own 5-min timeout (Track B), but its `timed_out`
  // status only reaches the client via SSE / poll. If the upstream stream is
  // stalled (no events, polling hasn't yet escalated, etc.) the user could
  // be parked on "Launching preview" indefinitely. This effect is the
  // last-line defence: arm a timer on isBuilding false→true, cancel it on
  // isBuilding true→false (done / error / stop), and on expiry abort every
  // active controller and surface a Retry-able error.
  //
  // preview_ready short-circuit: if the build has already produced a preview
  // (previewGenerationId === active build id), the WC owns the rest of the
  // lifecycle and has its own 30s stuck-dev-server safety net. Skip the
  // timeout in that case so a slow first paint doesn't error out a build
  // that effectively succeeded. Build id and preview-generation id are read
  // via refs so the 5-min window is anchored to isBuilding and not restarted
  // on every SSE-driven state update.
  useEffect(() => {
    if (!isBuilding) return;
    const handle = setTimeout(() => {
      const activeBuildId = activeBuildIdRef.current;
      if (activeBuildId && previewGenerationIdRef.current === activeBuildId) {
        console.log(
          "[BEO-715] 5-min client timeout skipped — preview_ready already fired",
          { activeBuildId },
        );
        return;
      }
      console.warn("[BEO-715] 5-min client build timeout — aborting build", {
        activeBuildId,
      });
      // Abort fresh-send controller + chat controller; flips isBuilding=false,
      // which propagates to isBuildInProgressRef in useWebContainerPreview so
      // the WC scaffold guard releases.
      stopBuild();
      // Abort the resume hook's controller (no-op if no resume is active).
      setResumeBuildId(null);
      setResumeLastEventId(null);
      // Drop any lingering AI-customising overlay so PreviewPane shows the error.
      if (aiCustomisingTimeoutRef.current) {
        clearTimeout(aiCustomisingTimeoutRef.current);
        aiCustomisingTimeoutRef.current = null;
      }
      setIsAiCustomising(false);
      setTransport("idle");
      // Surface the failure via PreviewPane's existing error overlay; the
      // Retry button is already wired to handleRetry → retryLastBuild.
      setBuildFailed(true);
      setBuildErrorMessage("Build timed out after 5 minutes — try again");
    }, BUILD_CLIENT_TIMEOUT_MS);
    return () => clearTimeout(handle);
  }, [isBuilding, stopBuild, setTransport]);

  // Auto-start from launch intent
  const autoStarted = useRef(false);
  useEffect(() => {
    if (autoStarted.current || !launchIntent?.prompt) return;
    // BEO-687: skip if the project already loaded existing files via the
    // resume effect — prevents any potential race where launchIntent fires
    // after build state is already hydrated.
    // BEO-715 2b: read via ref so this effect re-runs only when launchIntent
    // changes, not on every buildResult update (the autoStarted ref guard
    // already prevents double-firing within a single mount).
    if (buildResultRef.current && buildResultRef.current.files.length > 0) return;
    autoStarted.current = true;
    handleSendMessage(launchIntent.prompt);
  // BEO-715: intentionally omitted: [buildResult] — see comment above.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleSendMessage, launchIntent?.prompt]);

  useEffect(() => {
    if (build?.status === "completed" || build?.status === "failed") clearState();
  }, [build?.status, clearState]);

  // ─── Version restore (BEO-588) ───────────────────────────────────────────

  function showVersionToast(msg: string) {
    const el = document.createElement("div");
    el.textContent = msg;
    el.className =
      "fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] rounded-lg bg-[#1a1a1a] px-4 py-2 text-sm text-white shadow-lg";
    document.body.appendChild(el);
    setTimeout(() => {
      el.style.opacity = "0";
      el.style.transition = "opacity 200ms";
      setTimeout(() => el.remove(), 200);
    }, 3000);
  }

  const handleVersionRestored = useCallback(
    (files: StudioFile[], restoredN: number, savedN: number) => {
      // Update the build result with restored files so useWebContainerPreview hot-patches WC
      setBuildResult(prev =>
        prev
          ? { ...prev, files }
          : {
              files,
              generation: {
                id: `version-restore-${Date.now()}`,
                operationId: "",
                outputPaths: files.map(f => f.path),
                status: "completed" as const,
              },
              previewEntryPath: "",
              warnings: [],
            },
      );
      // New generationId triggers the WC hook to deliver the restored files
      setPreviewGenerationId(`version-restore-${restoredN}-${Date.now()}`);
      setActiveView("preview");
      showVersionToast(`Restored to v${restoredN}. Previous state saved as v${savedN}.`);
    },
    [],
  );

  // ─── Toggle version history panel ─────────────────────────────────────────

  const handleToggleVersionHistory = useCallback(() => {
    setShowVersionHistory(v => {
      const next = !v;
      // When opening History while Code is active, switch back to Preview
      if (next) setActiveView(cur => (cur === "code" ? "preview" : cur));
      return next;
    });
  }, []);

  // ─── Active view change (closes version history if switching to Code) ─────

  const handleActiveViewChange = useCallback((view: ActiveView) => {
    setActiveView(view);
    if (view === "code") setShowVersionHistory(false);
  }, []);

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
            onPreviewServerReady={notifyPreviewServerReady}
            buildFailed={buildFailed}
            neonDbUrl={neonDbUrl}
            buildErrorMessage={buildErrorMessage}
            onRetry={handleRetry}
            creditsUsed={creditsUsed}
            isBuildInProgress={isBuilding}
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
            byoConnectedHost={byoDbHost}
            onDbStateChange={fetchDbState}
            onWireToDatabase={handleWireToDatabase}
          />
        );
      case "integrations":
        return <IntegrationsPanel className="flex-1" />;
      default:
        return null;
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col bg-[#faf9f6]">
      <TopBar
        projectName={projectName}
        projectIcon={projectIcon}
        onProjectNameChange={setProjectName}
        onRefreshPreview={handleRefreshPreview}
        activeView={activeView}
        onActiveViewChange={handleActiveViewChange}
        isPublished={Boolean(beomzAppUrl) || isPublished}
        hasUnpublishedChanges={hasUnsyncedChanges}
        onPublish={() => setShowPublishModal(true)}
        onExportZip={handleExportZip}
        isExporting={isExporting}
        beomzAppUrl={beomzAppUrl}
        hasUnsyncedChanges={hasUnsyncedChanges}
        plan={credits?.plan ?? "free"}
        versionHistoryOpen={showVersionHistory}
        onToggleVersionHistory={handleToggleVersionHistory}
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
              messages={messages}
              isBuilding={isBuilding}
              projectId={projectId}
              onSendMessage={handleSendMessage}
              onStopStreaming={handleStopStreaming}
              onForceStop={handleForceStop}
              isStopPending={isStopPending}
              onRetry={handleRetry}
              onReportIssue={reportIssue}
              width={chatPanelWidth}
              suggestionChips={suggestionChips}
              onDismissChips={() => setSuggestionChips([])}
              creditsBalance={credits?.balance}
              chatModeActive={chatModeActive}
              onToggleChatMode={toggleChatMode}
              implementSuggestion={implementSuggestion}
              onImplement={() => { void implementWithPlan(implementSuggestion?.summary ?? ""); }}
              onDismissImplement={dismissImplementSuggestion}
              onImplementPlan={(plan, imageUrl) => { void implementWithPlan(plan, imageUrl); }}
              isAnalysingImage={isAnalysingImage}
              isIterationBuild={isIterationBuild}
              userFirstName={chatUserData.userFirstName}
              userAvatarUrl={chatUserData.userAvatarUrl}
              userInitials={chatUserData.userInitials}
            />
          </div>
        </div>
        {/* Chat / main divider — resize when open; collapse/expand control on the line */}
        <div className="relative z-20 w-1 shrink-0">
          <div
            onMouseDown={showChat ? e => startResize("chat", e) : undefined}
            className={cn(
              "absolute inset-y-0 left-0 w-full bg-transparent transition-colors",
              showChat &&
                "cursor-col-resize hover:bg-[#F97316]/20 active:bg-[#F97316]/30",
            )}
            title={showChat ? "Drag to resize" : undefined}
          />
          <button
            type="button"
            onClick={() => setShowChat(v => !v)}
            onMouseDown={e => e.stopPropagation()}
            className={cn(
              "absolute left-1/2 top-3 z-10 flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full",
              "border border-[#e5e5e5]/90 bg-white/65 text-[#6b7280] shadow-sm backdrop-blur-sm",
              "transition-colors hover:bg-white/90 hover:text-[#1a1a1a]",
            )}
            aria-label={showChat ? "Collapse chat panel" : "Expand chat panel"}
          >
            {showChat ? (
              <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2.25} />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.25} />
            )}
          </button>
        </div>

        {/* Main content */}
        <div className="flex min-w-0 flex-1 flex-col">
          {renderMainContent()}
        </div>

        {/* Version history panel — slides in from right */}
        <div
          className="shrink-0 overflow-hidden border-l border-[#e5e5e5] transition-[width] duration-200 ease-in-out"
          style={{ width: showVersionHistory ? VERSION_HISTORY_WIDTH : 0 }}
        >
          <div style={{ width: VERSION_HISTORY_WIDTH, minWidth: VERSION_HISTORY_WIDTH }} className="h-full">
            <VersionHistoryPanel
              projectId={projectId}
              onRestoreSuccess={handleVersionRestored}
              refreshKey={versionRefreshKey}
            />
          </div>
        </div>
      </div>

      <BuilderModals
        showShareModal={showShareModal}
        onCloseShareModal={() => setShowShareModal(false)}
        showOutOfCreditsModal={showOutOfCreditsModal}
        onCloseOutOfCreditsModal={() => setShowOutOfCreditsModal(false)}
        isHardBlock={isHardBlockCredits}
      />

      {showPublishModal && projectId && (
        <PublishModal
          projectId={projectId}
          beomzAppUrl={beomzAppUrl}
          plan={credits?.plan ?? "free"}
          customDomain={activeDomain}
          domainStatus={domainStatus}
          onClose={() => setShowPublishModal(false)}
          onVercelDeployed={url => {
            setBeomzAppUrl(url);
            setHasUnsyncedChanges(false);
          }}
          onVercelUnpublished={() => {
            setBeomzAppUrl(null);
          }}
          onDomainRemoved={() => {
            setActiveDomain(null);
            setDomainStatus(null);
          }}
          onExportZip={handleExportZip}
          isExporting={isExporting}
        />
      )}
    </div>
  );
}
