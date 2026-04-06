/**
 * ProjectPage — V2 builder with resizable panels, TopBar toggles, icon toolbar.
 * Renders for both /studio/project/new and /studio/project/:id.
 * Light mode — cream #faf9f6 throughout.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { BuilderV3Event, TemplateId } from "@beomz-studio/contracts";
import { useNavigate, useParams } from "@tanstack/react-router";
import { FolderTree } from "lucide-react";
import {
  TopBar,
  ChatPanel,
  BuilderModals,
  type ChatMessage,
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
  const [userMode, setUserMode] = useState<"simple" | "pro">("simple");

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

  const [showFiles, setShowFiles] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [showChat, setShowChat] = useState(true);
  const [filesPanelWidth, setFilesPanelWidth] = useState(200);
  const [historyPanelWidth, setHistoryPanelWidth] = useState(220);
  const [chatPanelWidth, setChatPanelWidth] = useState(380);

  const dragRef = useRef<{
    target: "files" | "history" | "chat";
    startX: number;
    startWidth: number;
  } | null>(null);

  const [showShareModal, setShowShareModal] = useState(false);

  useEffect(() => {
    setProjectId(id === "new" ? null : id);
  }, [id]);

  useEffect(() => {
    if (!projectId) {
      return;
    }

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
          if (message.id !== messageId) {
            return message;
          }

          found = true;
          return updater(message);
        });

        if (found) {
          return nextMessages;
        }

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
      if (events.length === 0 && fallbackContent.length === 0) {
        return;
      }

      upsertAssistantMessage(buildId, (message) => {
        let nextContent = message.content || fallbackContent;
        let nextEntries = message.traceEntries ?? [];

        for (const event of events) {
          if (event.type === "assistant_delta") {
            nextContent += event.delta;
          } else {
            nextEntries = appendTranscriptEntry(nextEntries, event);
          }
        }

        const terminalEvent = events.at(-1);
        if (
          terminalEvent
          && (terminalEvent.type === "done" || terminalEvent.type === "error")
          && nextContent.trim().length === 0
        ) {
          nextContent = terminalEvent.message;
        }

        return {
          ...message,
          content: nextContent,
          traceEntries: nextEntries,
        };
      });
    },
    [appendTranscriptEntry, upsertAssistantMessage],
  );

  const handleBuilderEvent = useCallback((event: BuilderV3Event) => {
    const buildId = "buildId" in event ? event.buildId : activeBuildIdRef.current;
    if (!buildId) {
      return;
    }

    activeBuildIdRef.current = buildId;
    setLastEventId(event.id);

    upsertAssistantMessage(buildId, (message) => {
      const nextEntries =
        event.type === "assistant_delta"
          ? message.traceEntries ?? []
          : appendTranscriptEntry(message.traceEntries ?? [], event);
      let nextContent =
        event.type === "assistant_delta"
          ? `${message.content}${event.delta}`
          : message.content;

      if ((event.type === "done" || event.type === "error") && nextContent.trim().length === 0) {
        nextContent = event.message;
      }

      return {
        ...message,
        content: nextContent,
        traceEntries: nextEntries,
      };
    });

    if (event.type === "preview_ready") {
      setPreviewGenerationId(event.buildId);
      setProjectId(event.projectId);
    }

    if (event.type === "done" || event.type === "error") {
      setIsStreaming(false);
      setStreamingText("");
    }
  }, [appendTranscriptEntry, upsertAssistantMessage]);

  const handleBuildStatus = useCallback((status: BuildStatusResponse) => {
    setBuild(status.build);
    setProjectId(status.project.id);
    setProjectName(status.project.name);

    if (status.result) {
      setBuildResult(status.result);
    }

    if (status.trace.previewReady || status.build.status === "completed") {
      setPreviewGenerationId(status.build.id);
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
          prompt: text,
          summary: launchIntent?.approvedPlan?.summary,
          steps: launchIntent?.approvedPlan?.steps,
        },
        onBuildStarted: (response) => {
          activeBuildIdRef.current = response.build.id;
          setBuild(response.build);
          setProjectId(response.project.id);
          setProjectName(response.project.name);
          replayTraceEvents(
            response.build.id,
            response.trace.events,
            response.build.summary ?? "",
          );

          if (response.trace.previewReady) {
            void getBuildStatus(response.build.id)
              .then((status) => {
                if (!status.result) {
                  return;
                }

                setBuild(status.build);
                setBuildResult(status.result);
                setPreviewGenerationId(response.build.id);
              })
              .catch(() => {
                setPreviewGenerationId(response.build.id);
              });
          }

          if (id === "new") {
            void navigate({
              params: { id: response.project.id },
              to: "/studio/project/$id",
            });
          }
        },
        onBuildStatus: handleBuildStatus,
        onEvent: handleBuilderEvent,
        onStreamError: setLastError,
        onTransportChange: handleTransportChange,
        signal: controller.signal,
      });
    },
    [
      handleBuildStatus,
      handleBuilderEvent,
      handleTransportChange,
      id,
      launchIntent?.approvedPlan?.steps,
      launchIntent?.approvedPlan?.summary,
      navigate,
      replayTraceEvents,
      resetHealth,
      setLastError,
      startAndStreamBuild,
    ],
  );

  const handleSendMessage = useCallback((text: string) => {
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
    };

    abortRef.current?.abort();
    setMessages((previousMessages) => [...previousMessages, userMessage]);

    void startBuildSession(text).catch((error) => {
      if (abortRef.current?.signal.aborted) {
        return;
      }

      setIsStreaming(false);
      setStreamingText("");
      setMessages((previousMessages) => [
        ...previousMessages,
        {
          id: `assistant-error-${Date.now()}`,
          role: "assistant",
          content:
            error instanceof Error
              ? error.message
              : "Failed to start build.",
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
    setPreviewRefreshKey((current) => current + 1);
    if (build?.id) {
      setPreviewGenerationId(build.id);
    }
  }, [build?.id]);

  useEffect(() => {
    if (resumingBuildRef.current || id === "new" || !projectId || build) {
      return;
    }

    resumingBuildRef.current = true;
    const controller = new AbortController();

    void (async () => {
      const restoredState = restoreState();

      // Use restoredState buildId → full status fetch, or fall back to latest-build API
      // (avoids direct Supabase table queries which require RLS policies)
      const status = restoredState?.buildId
        ? await getBuildStatus(restoredState.buildId)
        : await getLatestBuildForProject(projectId);

      if (!status || controller.signal.aborted) {
        return;
      }

      activeBuildIdRef.current = status.build.id;
      setBuild(status.build);
      setProjectName(status.project.name);
      setProjectId(status.project.id);
      if (status.result) {
        setBuildResult(status.result);
      }
      setPreviewGenerationId(
        restoredState?.previewGenerationId
          ?? (status.trace.previewReady || status.build.status === "completed"
            ? status.build.id
            : null),
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
      .finally(() => {
        resumingBuildRef.current = false;
      });

    return () => {
      controller.abort();
    };
  }, [
    build,
    handleBuildStatus,
    handleBuilderEvent,
    handleTransportChange,
    id,
    projectId,
    replayTraceEvents,
    restoreState,
    setLastError,
    subscribeToBuild,
  ]);

  const autoStarted = useRef(false);
  useEffect(() => {
    if (autoStarted.current || !launchIntent?.prompt) {
      return;
    }

    autoStarted.current = true;
    handleSendMessage(launchIntent.prompt);
  }, [handleSendMessage, launchIntent?.prompt]);

  useEffect(() => {
    if (build?.status === "completed" || build?.status === "failed") {
      clearState();
    }
  }, [build?.status, clearState]);

  const startResize = useCallback(
    (target: "files" | "history" | "chat", e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth =
        target === "files" ? filesPanelWidth
        : target === "history" ? historyPanelWidth
        : chatPanelWidth;
      dragRef.current = { target, startX, startWidth };

      const onMove = (ev: MouseEvent) => {
        if (!dragRef.current) {
          return;
        }

        const delta = ev.clientX - dragRef.current.startX;
        const raw = dragRef.current.startWidth + delta;
        const newWidth = raw < 100 ? 0 : Math.max(150, Math.min(500, raw));

        if (dragRef.current.target === "files") {
          setFilesPanelWidth(newWidth || 200);
          if (newWidth === 0) {
            setShowFiles(false);
          }
        } else if (dragRef.current.target === "history") {
          setHistoryPanelWidth(newWidth || 220);
          if (newWidth === 0) {
            setShowHistory(false);
          }
        } else {
          setChatPanelWidth(newWidth || 380);
          if (newWidth === 0) {
            setShowChat(false);
          }
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
    [chatPanelWidth, filesPanelWidth, historyPanelWidth],
  );

  const ResizeHandle = ({ target }: { target: "files" | "history" | "chat" }) => (
    <div
      onMouseDown={(e) => startResize(target, e)}
      className="w-1 shrink-0 cursor-col-resize bg-transparent transition-colors hover:bg-[#F97316]/20 active:bg-[#F97316]/30"
      title="Drag to resize"
    />
  );

  return (
    <div className="flex h-full flex-col bg-[#faf9f6]">
      <TopBar
        projectName={projectName}
        onProjectNameChange={setProjectName}
        onRefreshPreview={handleRefreshPreview}
        userMode={userMode}
        onUserModeChange={setUserMode}
        showFiles={showFiles}
        showHistory={showHistory}
        showChat={showChat}
        onToggleFiles={() => setShowFiles((v) => !v)}
        onToggleHistory={() => setShowHistory((v) => !v)}
        onToggleChat={() => setShowChat((v) => !v)}
      />

      <div className="flex min-h-0 flex-1">
        <div
          className="shrink-0 overflow-hidden border-r border-[#e5e7eb] bg-[#faf9f6] transition-[width] duration-200 ease-in-out"
          style={{ width: showFiles ? filesPanelWidth : 0 }}
        >
          <div className="flex h-full flex-col" style={{ minWidth: filesPanelWidth }}>
            <div className="flex items-center gap-2 border-b border-[#e5e7eb] px-3 py-2.5">
              <FolderTree size={12} className="text-[#9ca3af]" />
              <span className="text-xs font-semibold uppercase tracking-wider text-[#9ca3af]">Files</span>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {buildResult && buildResult.files.length > 0 ? (
                <ul className="space-y-0.5">
                  {buildResult.files.map((file) => (
                    <li
                      key={file.path}
                      className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-[#374151] hover:bg-[#f3f4f6] cursor-default truncate"
                      title={file.path}
                    >
                      <span className="shrink-0 text-[#9ca3af]">
                        {file.kind === "route" ? "⎇" : "◻"}
                      </span>
                      <span className="truncate">{file.path.split("/").pop()}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-8 text-center text-xs text-[#c4c4c4]">No files yet</p>
              )}
            </div>
          </div>
        </div>
        {showFiles && <ResizeHandle target="files" />}

        <div
          className="shrink-0 overflow-hidden border-r border-[#e5e7eb] bg-[#faf9f6] transition-[width] duration-200 ease-in-out"
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

        <div
          className="shrink-0 overflow-hidden transition-[width] duration-200 ease-in-out"
          style={{ width: showChat ? chatPanelWidth : 0 }}
        >
          <div style={{ width: chatPanelWidth, minWidth: chatPanelWidth }}>
            <ChatPanel
              messages={messages}
              isStreaming={isStreaming}
              streamingText={
                transport === "idle" ? ""
                : streamingText
              }
              onSendMessage={handleSendMessage}
              onStopStreaming={handleStopStreaming}
              width={chatPanelWidth}
            />
          </div>
        </div>
        {showChat && <ResizeHandle target="chat" />}

        <div className="min-w-0 flex-1">
          <PreviewPane
            files={buildResult?.files}
            generationId={previewGenerationId}
            previewEntryPath={buildResult?.previewEntryPath ?? null}
            project={projectId && build?.templateId
              ? {
                  id: projectId,
                  name: projectName,
                  templateId: build.templateId as TemplateId,
                }
              : null}
            refreshToken={previewRefreshKey}
          />
        </div>
      </div>

      <BuilderModals
        showShareModal={showShareModal}
        onCloseShareModal={() => setShowShareModal(false)}
      />
    </div>
  );
}
