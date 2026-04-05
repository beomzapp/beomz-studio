/**
 * ProjectPage — V1 builder layout ported to V2.
 * TopBar + ChatPanel (left) + PreviewPanel (right) + History sidebar.
 * Light mode — cream #faf9f6 throughout.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "@tanstack/react-router";
import { FolderTree } from "lucide-react";
import {
  TopBar,
  ChatPanel,
  PreviewPanel,
  BuilderModals,
  type ChatMessage,
} from "../../../components/builder";
import { HistoryPanel } from "../../../components/studio/HistoryPanel";
import {
  getBuildStatus,
  startBuild,
  type BuildPayload,
} from "../../../lib/api";
import { supabase } from "../../../lib/supabase";

export function ProjectPage() {
  const { id } = useParams({ from: "/studio/project/$id" });
  const [projectId, setProjectId] = useState<string | null>(
    id === "new" ? null : id,
  );
  const [projectName, setProjectName] = useState("Untitled project");
  const [userMode, setUserMode] = useState<"simple" | "pro">("simple");

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  // Build state
  const [build, setBuild] = useState<BuildPayload | null>(null);

  // Preview state
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [_previewKey, setPreviewKey] = useState(0);

  // Panel visibility + widths
  const [showFiles, setShowFiles] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [showChat, setShowChat] = useState(true);
  const [filesPanelWidth, setFilesPanelWidth] = useState(200);
  const [historyPanelWidth, setHistoryPanelWidth] = useState(220);
  const [chatPanelWidth, setChatPanelWidth] = useState(380);

  // Resize drag state
  const dragRef = useRef<{
    target: "files" | "history" | "chat";
    startX: number;
    startWidth: number;
  } | null>(null);

  // Modals
  const [showShareModal, setShowShareModal] = useState(false);

  // Send message — calls Railway API with SSE streaming
  const handleSendMessage = useCallback(
    async (text: string) => {
      // Add user message
      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        content: text,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setIsStreaming(true);
      setStreamingText("");

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        // Start build via existing API
        const response = await startBuild({ prompt: text });
        setProjectId(response.project.id);
        setBuild(response.build);

        // Poll for build status
        const poll = async () => {
          if (controller.signal.aborted) return;
          try {
            const status = await getBuildStatus(response.build.id);
            setBuild(status.build);

            if (status.build.status === "completed") {
              const summary = status.build.summary ?? "Build completed.";
              setStreamingText("");
              setMessages((prev) => [
                ...prev,
                {
                  id: `assistant-${Date.now()}`,
                  role: "assistant",
                  content: summary,
                  timestamp: new Date().toISOString(),
                },
              ]);
              setIsStreaming(false);
              return;
            }

            if (status.build.status === "failed" || status.build.status === "cancelled") {
              setStreamingText("");
              setMessages((prev) => [
                ...prev,
                {
                  id: `assistant-${Date.now()}`,
                  role: "assistant",
                  content: status.build.error ?? "Build failed.",
                  timestamp: new Date().toISOString(),
                },
              ]);
              setIsStreaming(false);
              return;
            }

            // Show phase as streaming text
            const phase = status.build.phase;
            if (phase) {
              const phaseLabels: Record<string, string> = {
                planner: "Planning architecture...",
                "template-selector": "Selecting approach...",
                generate: "Generating files...",
                validate: "Validating output...",
              };
              setStreamingText(phaseLabels[phase] ?? `${phase}...`);
            }

            // Continue polling
            setTimeout(poll, 1500);
          } catch {
            if (!controller.signal.aborted) {
              setIsStreaming(false);
              setMessages((prev) => [
                ...prev,
                {
                  id: `assistant-${Date.now()}`,
                  role: "assistant",
                  content: "Something went wrong. Please try again.",
                  timestamp: new Date().toISOString(),
                },
              ]);
            }
          }
        };

        void poll();
      } catch (error) {
        setIsStreaming(false);
        setMessages((prev) => [
          ...prev,
          {
            id: `assistant-${Date.now()}`,
            role: "assistant",
            content:
              error instanceof Error
                ? error.message
                : "Failed to start build.",
            timestamp: new Date().toISOString(),
          },
        ]);
      }
    },
    [],
  );

  const handleStopStreaming = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
    setStreamingText("");
  }, []);

  const handleRefreshPreview = useCallback(() => {
    setPreviewKey((k) => k + 1);
  }, []);

  // Panel resize handlers
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
        if (!dragRef.current) return;
        const delta = ev.clientX - dragRef.current.startX;
        const newWidth = Math.max(150, Math.min(500, dragRef.current.startWidth + delta));
        if (dragRef.current.target === "files") setFilesPanelWidth(newWidth);
        else if (dragRef.current.target === "history") setHistoryPanelWidth(newWidth);
        else setChatPanelWidth(newWidth);
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
    [filesPanelWidth, historyPanelWidth, chatPanelWidth],
  );

  // Subscribe to preview URL updates
  useEffect(() => {
    if (!projectId) return;

    const channel = supabase
      .channel(`builder-preview-${projectId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          filter: `project_id=eq.${projectId}`,
          schema: "public",
          table: "previews",
        },
        (payload) => {
          const url = (payload.new as Record<string, unknown>)?.url;
          if (typeof url === "string") setPreviewUrl(url);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [projectId]);

  // Resize handle component
  const ResizeHandle = ({ target }: { target: "files" | "history" | "chat" }) => (
    <div
      onMouseDown={(e) => startResize(target, e)}
      className="w-1 shrink-0 cursor-col-resize bg-transparent transition-colors hover:bg-[#F97316]/20 active:bg-[#F97316]/30"
      title="Drag to resize"
    />
  );

  return (
    <div className="flex h-full flex-col bg-[#faf9f6]">
      {/* TopBar */}
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

      {/* Main layout: [Files?] | [History?] | [Chat?] | Preview */}
      <div className="flex flex-1 min-h-0">
        {/* Files panel */}
        <div
          className="shrink-0 overflow-hidden border-r border-[#e5e7eb] bg-[#faf9f6] transition-[width] duration-200 ease-in-out"
          style={{ width: showFiles ? filesPanelWidth : 0 }}
        >
          <div className="flex h-full flex-col" style={{ minWidth: filesPanelWidth }}>
            <div className="flex items-center gap-2 border-b border-[#e5e7eb] px-3 py-2.5">
              <FolderTree size={12} className="text-[#9ca3af]" />
              <span className="text-xs font-semibold uppercase tracking-wider text-[#9ca3af]">Files</span>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <p className="mt-8 text-center text-xs text-[#c4c4c4]">No files yet</p>
            </div>
          </div>
        </div>
        {showFiles && <ResizeHandle target="files" />}

        {/* History panel */}
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

        {/* Chat panel */}
        <div
          className="shrink-0 overflow-hidden transition-[width] duration-200 ease-in-out"
          style={{ width: showChat ? chatPanelWidth : 0 }}
        >
          <div style={{ width: chatPanelWidth, minWidth: chatPanelWidth }}>
            <ChatPanel
              messages={messages}
              isStreaming={isStreaming}
              streamingText={streamingText}
              onSendMessage={handleSendMessage}
              onStopStreaming={handleStopStreaming}
              width={chatPanelWidth}
            />
          </div>
        </div>
        {showChat && <ResizeHandle target="chat" />}

        {/* Preview panel — fills remaining space */}
        <PreviewPanel
          previewUrl={previewUrl}
          isLoading={isStreaming && !previewUrl}
        />
      </div>

      {/* Modals */}
      <BuilderModals
        showShareModal={showShareModal}
        onCloseShareModal={() => setShowShareModal(false)}
      />
    </div>
  );
}
