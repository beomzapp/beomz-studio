/**
 * ProjectPage — V1 builder layout ported to V2.
 * TopBar + ChatPanel (left) + PreviewPanel (right) + History sidebar.
 * Light mode — cream #faf9f6 throughout.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "@tanstack/react-router";
import { Clock, FolderTree, PanelLeftClose, PanelLeftOpen } from "lucide-react";
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

  // Sidebar
  const [sidebarTab, setSidebarTab] = useState<"files" | "history">("files");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

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

  return (
    <div className="flex h-full flex-col bg-[#faf9f6]">
      {/* TopBar */}
      <TopBar
        projectName={projectName}
        onProjectNameChange={setProjectName}
        onRefreshPreview={handleRefreshPreview}
        userMode={userMode}
        onUserModeChange={setUserMode}
      />

      {/* Main layout: Sidebar + Chat + Preview */}
      <div className="flex flex-1 min-h-0">
        {/* Left sidebar — collapsible Files / History tabs */}
        <div className="relative hidden shrink-0 lg:flex">
          {/* Panel content — slides in/out */}
          <div
            className="flex flex-col border-r border-[#e5e7eb] bg-[#faf9f6] transition-[width] duration-200 ease-in-out overflow-hidden"
            style={{ width: sidebarCollapsed ? 0 : 200 }}
          >
            {/* Tab switcher */}
            <div className="flex border-b border-[#e5e7eb]" style={{ minWidth: 200 }}>
              <button
                onClick={() => setSidebarTab("files")}
                className={`flex flex-1 items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
                  sidebarTab === "files"
                    ? "border-b-2 border-[#F97316] text-[#1a1a1a]"
                    : "text-[#9ca3af] hover:text-[#6b7280]"
                }`}
              >
                <FolderTree size={12} />
                Files
              </button>
              <button
                onClick={() => setSidebarTab("history")}
                className={`flex flex-1 items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
                  sidebarTab === "history"
                    ? "border-b-2 border-[#F97316] text-[#1a1a1a]"
                    : "text-[#9ca3af] hover:text-[#6b7280]"
                }`}
              >
                <Clock size={12} />
                History
              </button>
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-hidden" style={{ minWidth: 200 }}>
              {sidebarTab === "files" ? (
                <div className="p-4">
                  <p className="mt-8 text-center text-xs text-[#c4c4c4]">
                    No files yet
                  </p>
                </div>
              ) : (
                <HistoryPanel
                  projectId={projectId}
                  activeGenerationId={build?.id}
                />
              )}
            </div>
          </div>

          {/* Collapse/expand toggle — pinned to panel edge */}
          <button
            onClick={() => setSidebarCollapsed((v) => !v)}
            className="flex h-8 w-5 items-center justify-center rounded-r-md border border-l-0 border-[#e5e7eb] bg-[#faf9f6] text-[#9ca3af] transition-colors hover:bg-[rgba(0,0,0,0.02)] hover:text-[#6b7280]"
            style={{ position: "absolute", right: -20, top: 12, zIndex: 10 }}
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={12} /> : <PanelLeftClose size={12} />}
          </button>
        </div>

        {/* Chat panel */}
        <ChatPanel
          messages={messages}
          isStreaming={isStreaming}
          streamingText={streamingText}
          onSendMessage={handleSendMessage}
          onStopStreaming={handleStopStreaming}
          width={380}
        />

        {/* Preview panel */}
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
