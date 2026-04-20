/**
 * ProjectPage — V2 builder with resizable panels, TopBar tab switcher,
 * Preview / Code / Database / Integrations views.
 * Light mode — cream #faf9f6 throughout.
 *
 * BEO-363: All build logic + SSE event handling lives in useBuildChat.
 * BEO-367: Phase UI, scope confirmation, and InsufficientCreditsCard removed.
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
  type ActiveView,
} from "../../../components/builder";
import { HistoryPanel, PreviewPane } from "../../../components/studio";
import {
  getBuildStatus,
  getLatestBuildForProject,
  getProjectDbState,
  exportProjectZip,
  listProjectsWithMeta,
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
  const [activeView, setActiveView] = useState<ActiveView>("preview");

  const { setLastError, setTransport } = useBuilderSessionHealth();
  const { clearState, restoreState, saveState } = useBuilderPersistence(projectId);

  // ─── useBuildChat ────────────────────────────────────────────────────────

  const {
    messages,
    isBuilding,
    sendMessage,
    retryLastBuild,
    buildDoneRef,
    subscribeToExistingBuild,
    notifyPreviewServerReady,
    chatModeActive,
    toggleChatMode,
    implementCard,
    implementSuggestion,
    dismissImplementSuggestion,
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
    onOutOfCredits: (isHardBlock) => {
      setIsHardBlockCredits(isHardBlock);
      setShowOutOfCreditsModal(true);
    },
  });

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
  const [neonDbUrl, setNeonDbUrl] = useState<string | null>(null);

  // ─── SSE event handler ─────────────────────────────────────────────────────
  // Handles preview overlay, project-name updates, and suggestion chips.
  // Phase / scope / insufficient-credits events are ignored (BEO-367).

  function handleLegacyEvent(event: BuilderV3Event) {
    setLastEventId(event.id);

    if ("buildId" in event && event.buildId) {
      activeBuildIdRef.current = event.buildId;
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
    if (!buildDoneRef.current) return;
    if (aiCustomisingTimeoutRef.current) {
      clearTimeout(aiCustomisingTimeoutRef.current);
      aiCustomisingTimeoutRef.current = null;
    }
    setTimeout(() => setIsAiCustomising(false), 400);
  }, [buildDoneRef]);

  // ─── Send message ─────────────────────────────────────────────────────────

  const handleSendMessage = useCallback(
    (text: string, imageUrl?: string, isSystem?: boolean) => {
      if (credits && credits.balance <= 0) {
        setIsHardBlockCredits(false);
        setShowOutOfCreditsModal(true);
        return;
      }
      setBuildFailed(false);
      setBuildErrorMessage(null);
      setCreditsUsed(null);
      buildDoneRef.current = false;
      // BEO-374 Bug 4: snapshot the current preview ID so conversational done
      // can restore it and avoid reloading the preview for question answers.
      savedPreviewGenerationIdRef.current = previewGenerationIdRef.current;
      setIsAiCustomising(true);
      if (aiCustomisingTimeoutRef.current) {
        clearTimeout(aiCustomisingTimeoutRef.current);
        aiCustomisingTimeoutRef.current = null;
      }
      sendMessage(text, imageUrl, isSystem);
    },
    [credits, sendMessage, buildDoneRef],
  );

  // ─── Wire to database (fires after Neon provisioning) ────────────────────

  const handleWireToDatabase = useCallback(
    (prompt: string) => {
      setActiveView("preview");
      handleSendMessage(prompt, undefined, true);
    },
    [handleSendMessage, setActiveView],
  );

  // ─── Stop streaming ───────────────────────────────────────────────────────

  const handleStopStreaming = useCallback(() => {
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

      const isActive =
        status.build.status === "queued" || status.build.status === "running";

      if (isActive) {
        buildDoneRef.current = false;
        setIsAiCustomising(true);
      } else if (status.build.status === "completed") {
        buildDoneRef.current = true;
      }

      // BEO-456 final: when the page rehydrates mid-build, `status.result` may
      // contain the API's prebuilt scaffold (e.g. Kanban Board). Kick off the
      // stream FIRST (its synchronous head sets isBuilding=true) so React
      // batches isBuilding=true with setBuildResult(scaffold) — the
      // useWebContainerPreview scaffold guard then blocks the wc.mount until
      // real files land via the completed-build status fetch.
      const streamPromise = isActive
        ? subscribeToExistingBuild(
            status.build.id,
            restoredState?.lastEventId ?? status.trace.lastEventId,
            controller.signal,
          )
        : null;

      if (status.result) setBuildResult(status.result);
      setPreviewGenerationId(
        restoredState?.previewGenerationId
        ?? (status.trace.previewReady || status.build.status === "completed" ? status.build.id : null),
      );
      setLastEventId(restoredState?.lastEventId ?? status.trace.lastEventId);

      if (streamPromise) {
        await streamPromise;
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
            onRetry={retryLastBuild}
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
        onActiveViewChange={setActiveView}
        showSidebar={showChat}
        onToggleSidebar={() => setShowChat(v => !v)}
        isPublished={isPublished}
        onPublish={() => setShowPublishModal(true)}
        onExportZip={handleExportZip}
        isExporting={isExporting}
        beomzAppUrl={beomzAppUrl}
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
              onRetry={retryLastBuild}
              width={chatPanelWidth}
              suggestionChips={suggestionChips}
              onDismissChips={() => setSuggestionChips([])}
              creditsBalance={credits?.balance}
              chatModeActive={chatModeActive}
              onToggleChatMode={toggleChatMode}
              implementSuggestion={implementSuggestion}
              onImplement={() => { void implementCard(); }}
              onDismissImplement={dismissImplementSuggestion}
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
        isHardBlock={isHardBlockCredits}
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
