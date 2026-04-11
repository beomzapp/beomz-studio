/**
 * ProjectPage — V2 builder with resizable panels, TopBar tab switcher,
 * Preview / Code / Database / Integrations views.
 * Light mode — cream #faf9f6 throughout.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { BuilderV3Event, TemplateId } from "@beomz-studio/contracts";
import { useNavigate, useParams } from "@tanstack/react-router";
import {
  Copy,
  Check,
  Code2,
} from "lucide-react";
import {
  TopBar,
  ChatPanel,
  BuilderModals,
  DatabasePanel,
  IntegrationsPanel,
  type ChatMessage,
  type ActiveView,
} from "../../../components/builder";
import { HistoryPanel, PreviewPane } from "../../../components/studio";
import {
  getBuildStatus,
  getLatestBuildForProject,
  type BuildPayload,
  type BuildStatusResponse,
} from "../../../lib/api";
import { consumeProjectLaunchIntent } from "../../../lib/projectLaunchIntent";
import { useBuilderEngineStream } from "../../../hooks/useBuilderEngineStream";
import { useBuilderPersistence } from "../../../hooks/useBuilderPersistence";
import { useBuilderSessionHealth } from "../../../hooks/useBuilderSessionHealth";
import { useBuilderTranscript } from "../../../hooks/useBuilderTranscript";
import { cn } from "../../../lib/cn";
import { getSuggestionChips } from "../../../lib/getSuggestionChips";
import { streamBuildSummary } from "../../../lib/streamBuildSummary";

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

  const { appendTranscriptEntry } = useBuilderTranscript();
  const { startAndStreamBuild, subscribeToBuild } = useBuilderEngineStream();
  const {
    resetHealth,
    setLastError,
    setTransport,
    transport,
  } = useBuilderSessionHealth();
  const { clearState, restoreState, saveState } = useBuilderPersistence(projectId);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [lastEventId, setLastEventId] = useState<string | null>(null);
  const [build, setBuild] = useState<BuildPayload | null>(null);
  const [buildResult, setBuildResult] = useState<BuildStatusResponse["result"] | null>(null);
  const [previewGenerationId, setPreviewGenerationId] = useState<string | null>(null);
  const [previewRefreshKey, setPreviewRefreshKey] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const activeAssistantMessageIdRef = useRef<string | null>(null);
  const activeBuildIdRef = useRef<string | null>(null);
  const resumingBuildRef = useRef(false);

  const [suggestionChips, setSuggestionChips] = useState<string[]>([]);

  // Post-build AI summary state
  const [pendingSummaryBuildId, setPendingSummaryBuildId] = useState<string | null>(null);
  const summaryGeneratedRef = useRef(new Set<string>());
  const summaryAbortRef = useRef<AbortController | null>(null);
  const lastUserPromptRef = useRef("");
  const buildSummaryTextRef = useRef("");

  const [showChat, setShowChat] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [chatPanelWidth, setChatPanelWidth] = useState(380);
  const [historyPanelWidth, setHistoryPanelWidth] = useState(220);

  // Code panel state
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  const dragRef = useRef<{
    target: "history" | "chat";
    startX: number;
    startWidth: number;
  } | null>(null);

  const [showShareModal, setShowShareModal] = useState(false);

  useEffect(() => {
    setProjectId(id === "new" ? null : id);
  }, [id]);

  useEffect(() => {
    if (!projectId) return;
    saveState({
      buildId: build?.id ?? null,
      lastEventId,
      previewGenerationId,
    });
  }, [build?.id, lastEventId, previewGenerationId, projectId, saveState]);

  const upsertAssistantMessage = useCallback(
    (buildId: string, updater: (message: ChatMessage) => ChatMessage) => {
      const messageId = `assistant-${buildId}`;
      activeAssistantMessageIdRef.current = messageId;

      setMessages((previousMessages) => {
        let found = false;
        const nextMessages = previousMessages.map((message) => {
          if (message.id !== messageId) return message;
          found = true;
          return updater(message);
        });

        if (found) return nextMessages;
        return [
          ...nextMessages,
          updater({
            id: messageId,
            role: "assistant",
            content: "",
            timestamp: new Date().toISOString(),
            traceEntries: [],
          }),
        ];
      });
    },
    [],
  );

  const replayTraceEvents = useCallback(
    (buildId: string, events: readonly BuilderV3Event[], fallbackContent = "") => {
      if (events.length === 0 && fallbackContent.length === 0) return;

      upsertAssistantMessage(buildId, (message) => {
        let nextContent = message.content;
        let nextEntries = message.traceEntries ?? [];

        for (const event of events) {
          nextEntries = appendTranscriptEntry(nextEntries, event);
        }

        const terminalEvent = events.at(-1);
        const terminalMessage =
          terminalEvent && (terminalEvent.type === "done" || terminalEvent.type === "error")
            ? terminalEvent.message
            : "";
        if (
          nextEntries.length === 0
          && nextContent.trim().length === 0
          && (
            fallbackContent.trim().length > 0
            || terminalMessage.length > 0
          )
        ) {
          nextContent = fallbackContent.trim().length > 0
            ? fallbackContent
            : terminalMessage;
        }

        return { ...message, content: nextContent, traceEntries: nextEntries };
      });
    },
    [appendTranscriptEntry, upsertAssistantMessage],
  );

  const handleBuilderEvent = useCallback((event: BuilderV3Event) => {
    const buildId = "buildId" in event ? event.buildId : activeBuildIdRef.current;
    if (!buildId) return;

    // Log every SSE event for debugging
    console.log("[SSE event]", {
      type: event.type,
      code: "code" in event ? event.code : undefined,
      id: event.id,
      buildId,
      message: "message" in event ? event.message : undefined,
    });

    activeBuildIdRef.current = buildId;
    setLastEventId(event.id);

    upsertAssistantMessage(buildId, (message) => {
      const nextEntries = appendTranscriptEntry(message.traceEntries ?? [], event);
      let nextContent = message.content;

      if (
        nextEntries.length === 0
        && (event.type === "done" || event.type === "error")
        && nextContent.trim().length === 0
      ) {
        nextContent = event.message;
      }

      return { ...message, content: nextContent, traceEntries: nextEntries };
    });

    if (event.type === "preview_ready") {
      setProjectId(event.projectId);
      console.log("[SSE preview_ready] fetching build status for", buildId);
      void getBuildStatus(event.buildId)
        .then((status) => {
          console.log("[SSE preview_ready] getBuildStatus result", {
            status: status.build.status,
            hasResult: !!status.result,
            fileCount: status.result?.files?.length ?? 0,
          });
          if (status.result) setBuildResult(status.result);
          setPreviewGenerationId(event.buildId);
        })
        .catch((err) => {
          console.error("[SSE preview_ready] getBuildStatus failed", err);
          setPreviewGenerationId(event.buildId);
        });
    }

    if (event.type === "done" || event.type === "error") {
      setIsStreaming(false);
      setStreamingText("");
    }

    if (event.type === "done") {
      buildSummaryTextRef.current = event.message;
      const bid = "buildId" in event ? event.buildId : activeBuildIdRef.current;
      if (!lastUserPromptRef.current) {
        lastUserPromptRef.current = projectName || "build this app";
      }
      if (bid) {
        setPendingSummaryBuildId(bid);
        console.log("[SSE done] fetching build status for", bid);
        void getBuildStatus(bid)
          .then((status) => {
            console.log("[SSE done] getBuildStatus result", {
              status: status.build.status,
              hasResult: !!status.result,
              fileCount: status.result?.files?.length ?? 0,
            });
            if (status.result) setBuildResult(status.result);
            if (status.trace.previewReady || status.build.status === "completed") {
              setPreviewGenerationId(bid);
            }
          })
          .catch((err) => {
            console.error("[SSE done] getBuildStatus failed — preview will not update", err);
          });
      }

      setMessages((prev) => {
        const lastUserMsg = [...prev].reverse().find((m) => m.role === "user");
        const prompt = lastUserMsg?.content || lastUserPromptRef.current || projectName;
        if (prompt) {
          void getSuggestionChips(prompt).then((chips) => {
            if (chips.length > 0) setSuggestionChips(chips);
          });
        }
        return prev;
      });
    }

    if (event.type === "error") {
      console.error("[SSE error event]", event.message);
    }
  }, [appendTranscriptEntry, projectName, upsertAssistantMessage]);

  const handleBuildStatus = useCallback((status: BuildStatusResponse) => {
    setBuild(status.build);
    setProjectId(status.project.id);
    setProjectName(status.project.name);
    setProjectIcon(status.project.icon ?? null);
    if (status.result) setBuildResult(status.result);
    if (status.trace.previewReady || status.build.status === "completed") {
      setPreviewGenerationId(status.build.id);
    }
    if (status.build.status === "completed") {
      buildSummaryTextRef.current = status.build.summary ?? "Build completed.";
      if (!lastUserPromptRef.current) {
        lastUserPromptRef.current = status.project.name || "build this app";
      }
      setPendingSummaryBuildId(status.build.id);
    }
    if (status.build.status === "completed" || status.build.status === "failed") {
      setIsStreaming(false);
      setStreamingText("");
    }
  }, []);

  const handleTransportChange = useCallback((nextTransport: "idle" | "streaming" | "polling" | "reconnecting") => {
    setTransport(nextTransport);
    const transportLabel =
      nextTransport === "streaming" ? "Connecting live build stream..."
        : nextTransport === "polling" ? "Live stream unavailable. Continuing with polling..."
          : nextTransport === "reconnecting" ? "Reconnecting to the live build stream..."
            : "";
    setStreamingText(transportLabel);
  }, [setTransport]);

  const startBuildSession = useCallback(
    async (text: string) => {
      const controller = new AbortController();
      abortRef.current = controller;
      resetHealth();
      setIsStreaming(true);
      setStreamingText("Connecting live build stream...");
      setPreviewGenerationId(null);
      setLastEventId(null);
      activeAssistantMessageIdRef.current = null;
      activeBuildIdRef.current = null;

      await startAndStreamBuild({
        body: {
          existingFiles: buildResult?.files?.length ? buildResult.files : undefined,
          prompt: text,
          projectId: projectId ?? undefined,
          projectName: projectName !== "Untitled project" ? projectName : undefined,
          summary: launchIntent?.approvedPlan?.summary,
          steps: launchIntent?.approvedPlan?.steps,
        },
        onBuildStarted: (response) => {
          activeBuildIdRef.current = response.build.id;
          setBuild(response.build);
          setProjectId(response.project.id);
          setProjectName(response.project.name);
          setProjectIcon(response.project.icon ?? null);
          replayTraceEvents(response.build.id, response.trace.events, response.build.summary ?? "");

          if (response.trace.previewReady) {
            void getBuildStatus(response.build.id)
              .then((status) => {
                if (!status.result) return;
                setBuild(status.build);
                setBuildResult(status.result);
                setPreviewGenerationId(response.build.id);
              })
              .catch(() => { setPreviewGenerationId(response.build.id); });
          }

          if (id === "new") {
            void navigate({ params: { id: response.project.id }, to: "/studio/project/$id" });
          }
        },
        onBuildStatus: handleBuildStatus,
        onEvent: handleBuilderEvent,
        onStreamError: setLastError,
        onTransportChange: handleTransportChange,
        signal: controller.signal,
      });
    },
    [handleBuildStatus, handleBuilderEvent, handleTransportChange, id, launchIntent?.approvedPlan?.steps, launchIntent?.approvedPlan?.summary, navigate, replayTraceEvents, resetHealth, setLastError, startAndStreamBuild],
  );

  const handleSendMessage = useCallback((text: string) => {
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
    };

    lastUserPromptRef.current = text;
    summaryAbortRef.current?.abort();
    abortRef.current?.abort();
    setMessages((prev) => [...prev, userMessage]);

    void startBuildSession(text).catch((error) => {
      if (abortRef.current?.signal.aborted) return;
      setIsStreaming(false);
      setStreamingText("");
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-error-${Date.now()}`,
          role: "assistant",
          content: error instanceof Error ? error.message : "Failed to start build.",
          timestamp: new Date().toISOString(),
        },
      ]);
    });
  }, [startBuildSession]);

  const handleStopStreaming = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
    setStreamingText("");
    setTransport("idle");
  }, [setTransport]);

  const handleRefreshPreview = useCallback(() => {
    setPreviewRefreshKey((c) => c + 1);
    if (build?.id) setPreviewGenerationId(build.id);
  }, [build?.id]);

  // Resume existing build
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
      replayTraceEvents(status.build.id, status.trace.events, status.build.summary ?? "");
      setLastEventId(restoredState?.lastEventId ?? status.trace.lastEventId);

      if (status.build.status === "queued" || status.build.status === "running") {
        abortRef.current = controller;
        setIsStreaming(true);
        setStreamingText("Reconnecting to the live build stream...");
        await subscribeToBuild({
          buildId: status.build.id,
          lastEventId: restoredState?.lastEventId ?? status.trace.lastEventId,
          onBuildStatus: handleBuildStatus,
          onEvent: handleBuilderEvent,
          onStreamError: setLastError,
          onTransportChange: handleTransportChange,
          signal: controller.signal,
        });
      }
    })()
      .catch((error: unknown) => {
        setLastError(error instanceof Error ? error.message : "Failed to restore build session.");
      })
      .finally(() => { resumingBuildRef.current = false; });

    return () => { controller.abort(); };
  }, [build, handleBuildStatus, handleBuilderEvent, handleTransportChange, id, projectId, replayTraceEvents, restoreState, setLastError, subscribeToBuild]);

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

  useEffect(() => {
    if (!buildResult?.files?.length) return;
    const bid = activeBuildIdRef.current;
    if (!bid) return;

    const files = buildResult.generation.changedPaths ?? buildResult.generation.outputPaths;
    const messageId = `assistant-${bid}`;

    setMessages((prev) =>
      prev.map((message) =>
        message.id === messageId && (!message.changedFiles || message.changedFiles.length === 0)
          ? { ...message, changedFiles: files }
          : message,
      ),
    );
  }, [buildResult]);

  // ── Post-build AI summary ──

  useEffect(() => {
    if (!pendingSummaryBuildId) return;
    if (summaryGeneratedRef.current.has(pendingSummaryBuildId)) {
      setPendingSummaryBuildId(null);
      return;
    }

    const buildId = pendingSummaryBuildId;
    summaryGeneratedRef.current.add(buildId);
    setPendingSummaryBuildId(null);

    const userPrompt = lastUserPromptRef.current;
    if (!userPrompt) return;

    const fileCount = buildResult?.files?.length ?? 0;
    const buildInfo = [
      `App: ${projectName}`,
      fileCount > 0 ? `${fileCount} files generated` : null,
      buildSummaryTextRef.current,
    ]
      .filter(Boolean)
      .join(". ");

    const summaryMsgId = `summary-${buildId}`;
    const controller = new AbortController();
    summaryAbortRef.current = controller;

    setMessages((prev) => [
      ...prev,
      {
        id: summaryMsgId,
        role: "assistant" as const,
        content: "\u258B",
        timestamp: new Date().toISOString(),
      },
    ]);

    (async () => {
      let accumulated = "";
      try {
        for await (const delta of streamBuildSummary(userPrompt, buildInfo, controller.signal)) {
          accumulated += delta;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === summaryMsgId ? { ...m, content: accumulated + "\u258B" } : m,
            ),
          );
        }
        // Remove cursor when streaming finishes
        if (accumulated) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === summaryMsgId ? { ...m, content: accumulated } : m,
            ),
          );
        } else {
          setMessages((prev) => prev.filter((m) => m.id !== summaryMsgId));
        }
      } catch {
        if (!controller.signal.aborted) {
          setMessages((prev) => prev.filter((m) => m.id !== summaryMsgId));
        }
      }
    })();

    return () => {
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingSummaryBuildId, buildResult, projectName]);

  // ── Resize logic ──

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
      onMouseDown={(e) => startResize(target, e)}
      className="w-1 shrink-0 cursor-col-resize bg-transparent transition-colors hover:bg-[#F97316]/20 active:bg-[#F97316]/30"
      title="Drag to resize"
    />
  );

  // ── Copy code handler ──

  const handleCopyCode = useCallback(() => {
    if (!buildResult || !selectedFile) return;
    const file = buildResult.files.find((f) => f.path === selectedFile);
    if (!file) return;
    void navigator.clipboard.writeText(file.content);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 1500);
  }, [buildResult, selectedFile]);

  // Auto-select first file when build result changes
  useEffect(() => {
    if (buildResult && buildResult.files.length > 0 && !selectedFile) {
      setSelectedFile(buildResult.files[0].path);
    }
  }, [buildResult, selectedFile]);

  // ── Grouped file tree for Code panel ──

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

    // Group by section
    const grouped: Record<FileSection, Array<(typeof files)[number]>> = { ROUTES: [], COMPONENTS: [], CONFIG: [], OTHER: [] };
    for (const file of files) {
      const section = classifyFile(file.path, file.kind);
      grouped[section].push(file);
    }

    const sectionOrder: FileSection[] = ["ROUTES", "COMPONENTS", "CONFIG", "OTHER"];
    const currentFile = files.find((f) => f.path === selectedFile);

    return (
      <div className="flex min-h-0 flex-1">
        {/* File tree sidebar */}
        <div className="w-48 flex-shrink-0 overflow-y-auto border-r border-[#e5e5e5] bg-[#faf9f6]">
          <div className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-[#9ca3af]">
            Files
          </div>
          <div className="pb-2">
            {sectionOrder.map((section) => {
              const sectionFiles = grouped[section];
              if (sectionFiles.length === 0) return null;
              return (
                <div key={section}>
                  <div className="px-3 pb-1 pt-3 text-[9px] font-semibold uppercase tracking-wider text-[#9ca3af]">
                    {section}
                  </div>
                  {sectionFiles.map((f) => (
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

        {/* File content */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-[#0a0a0a]">
          <div className="flex flex-shrink-0 items-center justify-between border-b border-gray-800 px-4 py-2">
            <span className="font-mono text-xs text-gray-400">{selectedFile}</span>
            <button
              onClick={handleCopyCode}
              className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-500 transition-colors hover:text-white"
            >
              {copiedCode ? (
                <><Check className="h-3 w-3" /> Copied!</>
              ) : (
                <><Copy className="h-3 w-3" /> Copy</>
              )}
            </button>
          </div>
          <pre className="flex-1 overflow-auto whitespace-pre p-4 font-mono text-xs leading-relaxed text-gray-300">
            {currentFile?.content ?? ""}
          </pre>
        </div>
      </div>
    );
  };

  // ── Main content area based on activeView ──

  const renderMainContent = () => {
    switch (activeView) {
      case "preview":
        return (
          <PreviewPane
            files={buildResult?.files}
            generationId={previewGenerationId}
            previewEntryPath={buildResult?.previewEntryPath ?? null}
            project={projectId && build?.templateId
              ? { id: projectId, name: projectName, templateId: build.templateId as TemplateId }
              : null}
            refreshToken={previewRefreshKey}
          />
        );
      case "code":
        return renderCodePanel();
      case "database":
        return <DatabasePanel className="flex-1" />;
      case "integrations":
        return <IntegrationsPanel className="flex-1" />;
      default:
        return null;
    }
  };

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
        onToggleSidebar={() => setShowChat((v) => !v)}
      />

      <div className="flex min-h-0 flex-1">
        {/* History panel */}
        <div
          className="shrink-0 overflow-hidden border-r border-[#e5e5e5] bg-[#faf9f6] transition-[width] duration-200 ease-in-out"
          style={{ width: showHistory ? historyPanelWidth : 0 }}
        >
          <div className="h-full" style={{ minWidth: historyPanelWidth }}>
            <HistoryPanel
              projectId={projectId}
              activeGenerationId={build?.id}
            />
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
              isStreaming={isStreaming}
              streamingText={transport === "idle" ? "" : streamingText}
              onSendMessage={handleSendMessage}
              onStopStreaming={handleStopStreaming}
              onViewCode={() => {
                setActiveView("code");
                const firstFile = buildResult?.files?.[0]?.path;
                if (firstFile) setSelectedFile(firstFile);
              }}
              width={chatPanelWidth}
              suggestionChips={suggestionChips}
              onDismissChips={() => setSuggestionChips([])}
            />
          </div>
        </div>
        {showChat && <ResizeHandle target="chat" />}

        {/* Main content area */}
        <div className="flex min-w-0 flex-1 flex-col">
          {renderMainContent()}
        </div>
      </div>

      <BuilderModals
        showShareModal={showShareModal}
        onCloseShareModal={() => setShowShareModal(false)}
      />
    </div>
  );
}
