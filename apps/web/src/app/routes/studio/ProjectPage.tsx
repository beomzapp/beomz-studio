/**
 * ProjectPage — V2 builder with resizable panels, TopBar tab switcher,
 * Preview / Code / Database / Integrations views.
 * Light mode — cream #faf9f6 throughout.
 */

// ── Extract a meaningful project name from the user prompt ──────────────────
const FILLER_WORDS = new Set([
  "build", "create", "make", "design", "generate", "develop", "code",
  "a", "an", "the", "my", "me", "app", "application", "website", "page",
  "with", "for", "that", "has", "using", "in", "on", "of", "and",
  "please", "can", "you", "i", "want", "need", "like", "something",
]);

function extractProjectName(prompt: string): string | null {
  // Check for explicit "called X" or "named X" patterns
  const namedMatch = prompt.match(/(?:called|named)\s+["']?([A-Z][A-Za-z0-9 ]{0,30})["']?/);
  if (namedMatch) return namedMatch[1].trim();

  // Check for all-caps brand name (3+ chars)
  const capsMatch = prompt.match(/\b([A-Z]{3,15})\b/);
  if (capsMatch) return capsMatch[1];

  // Strip filler words, capitalise remaining
  const words = prompt
    .replace(/[^\w\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 0 && !FILLER_WORDS.has(w.toLowerCase()));

  if (words.length === 0) return null;

  // Take first 3 meaningful words, title-case them
  return words
    .slice(0, 3)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

// ── Context-aware intro message ───────────────────────────────────
function buildIntroMessage(prompt: string, isIteration: boolean): string {
  const lower = prompt.toLowerCase().trim();

  // Detect questions (no build needed phrasing)
  if (/^(why|how|what|where|when|can|does|is|are|do|should)\b/.test(lower) && lower.endsWith("?")) {
    return "Let me take a look at that.";
  }

  if (isIteration) {
    // Extract the core action from the user's message
    const fixMatch = lower.match(/^fix\s+(.{3,40})/);
    if (fixMatch) return `Fixing ${fixMatch[1].replace(/\.$/, "")}...`;

    const addMatch = lower.match(/^add\s+(.{3,40})/);
    if (addMatch) return `Adding ${addMatch[1].replace(/\.$/, "")}...`;

    const makeMatch = lower.match(/^make\s+(?:it\s+)?(.{3,40})/);
    if (makeMatch) return `On it — making it ${makeMatch[1].replace(/\.$/, "")}...`;

    const changeMatch = lower.match(/^change\s+(.{3,40})/);
    if (changeMatch) return `Changing ${changeMatch[1].replace(/\.$/, "")}...`;

    const removeMatch = lower.match(/^(?:remove|delete)\s+(.{3,40})/);
    if (removeMatch) return `Removing ${removeMatch[1].replace(/\.$/, "")}...`;

    const updateMatch = lower.match(/^update\s+(.{3,40})/);
    if (updateMatch) return `Updating ${updateMatch[1].replace(/\.$/, "")}...`;

    // Generic iteration fallback — echo back a condensed version
    const short = prompt.length > 60 ? prompt.slice(0, 57).replace(/\s+\S*$/, "") + "..." : prompt;
    return `On it — ${short.charAt(0).toLowerCase()}${short.slice(1)}`;
  }

  // First build — acknowledge what they want to build
  const name = extractProjectName(prompt);
  if (name) return `Got it — building ${name} now.`;

  // Fallback for first build
  const condensed = prompt.length > 50 ? prompt.slice(0, 47).replace(/\s+\S*$/, "") + "..." : prompt;
  return `${condensed.charAt(0).toUpperCase()}${condensed.slice(1)} — on it.`;
}

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
  PublishModal,
  type ChatMessage,
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
import { useBuilderEngineStream } from "../../../hooks/useBuilderEngineStream";
import { useBuilderPersistence } from "../../../hooks/useBuilderPersistence";
import { useBuilderSessionHealth } from "../../../hooks/useBuilderSessionHealth";
import { useBuilderTranscript } from "../../../hooks/useBuilderTranscript";
import { cn } from "../../../lib/cn";
import { useCredits } from "../../../lib/CreditsContext";
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
  const [isAiCustomising, setIsAiCustomising] = useState(false);
  // Safety ref: if onFilesWritten never fires (e.g. WC unsupported / fallback build),
  // force-clear isAiCustomising after 8s so the overlay doesn't get stuck.
  const aiCustomisingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  const { credits, deductOptimistic, refresh: refreshCredits } = useCredits();
  const [showOutOfCreditsModal, setShowOutOfCreditsModal] = useState(false);

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

  // Publish state
  const [isPublished, setIsPublished] = useState(false);
  const [publishedSlug, setPublishedSlug] = useState<string | null>(null);
  const [beomzAppUrl, setBeomzAppUrl] = useState<string | null>(null);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Database state (driven by GET /api/projects/:id)
  const [dbEnabled, setDbEnabled] = useState(false);
  const [dbProvider, setDbProvider] = useState<string | null>(null);
  const [dbWired, setDbWired] = useState(false);

  const fetchDbState = useCallback(async () => {
    if (!projectId) return;
    try {
      const state = await getProjectDbState(projectId);
      setDbEnabled(state.database_enabled);
      setDbProvider(state.db_provider);
      setDbWired(state.db_wired);

      // Inject DB credentials into WebContainer when wired
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
    } catch {
      // DB state may not be available yet — keep defaults
    }
  }, [projectId]);

  useEffect(() => {
    setProjectId(id === "new" ? null : id);
  }, [id]);

  // Fetch DB state when project is loaded
  useEffect(() => {
    if (projectId && id !== "new") {
      void fetchDbState();
    }
  }, [projectId, id, fetchDbState]);

  // Fetch publish state when project is loaded
  useEffect(() => {
    if (!projectId || id === "new") return;
    void listProjectsWithMeta().then((data) => {
      const proj = data.projects.find((p) => p.id === projectId) as
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

  // ── Chat message persistence via localStorage ────────────────────────────
  // Restore messages when projectId is set (page load / navigation)
  useEffect(() => {
    if (!projectId) return;
    try {
      const stored = localStorage.getItem(`beomz.chat.${projectId}`);
      if (stored) {
        const parsed = JSON.parse(stored) as ChatMessage[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed);
        }
      }
    } catch { /* localStorage unavailable or corrupt */ }
  }, [projectId]);

  // Save messages whenever they change
  useEffect(() => {
    if (!projectId || messages.length === 0) return;
    try {
      localStorage.setItem(`beomz.chat.${projectId}`, JSON.stringify(messages));
    } catch { /* localStorage full or unavailable */ }
  }, [projectId, messages]);

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

    if (event.type === "tool_use_started") {
      setStreamingText("Planning your app\u2026");
    }

    if (event.type === "assistant_delta" || event.type === "tool_use_progress") {
      setStreamingText("Customising with AI\u2026");
    }

    if (event.type === "preview_ready") {
      setProjectId(event.projectId);
      setIsAiCustomising(true);

      // Animate file writing progress
      const fileCount = ("filesCount" in event ? event.filesCount : null) as number | null;
      if (fileCount && fileCount > 0) {
        let i = 1;
        const tick = () => {
          if (i <= fileCount) {
            setStreamingText("Writing file " + i + " of " + fileCount + "\u2026");
            i++;
            setTimeout(tick, 300);
          } else {
            setStreamingText("Starting preview\u2026");
          }
        };
        tick();
      } else {
        setStreamingText("Writing code\u2026");
      }
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
      if (event.type === "error") {
        // On error, reveal immediately — no new files will arrive.
        if (aiCustomisingTimeoutRef.current) {
          clearTimeout(aiCustomisingTimeoutRef.current);
          aiCustomisingTimeoutRef.current = null;
        }
        setIsAiCustomising(false);
      } else {
        // On done: keep the overlay up until WebContainer writes the new files
        // and Vite HMR propagates (handled by handleFilesWrittenToWC below).
        // Safety: force-clear after 8s in case WC is unavailable or files don't change.
        if (aiCustomisingTimeoutRef.current) clearTimeout(aiCustomisingTimeoutRef.current);
        aiCustomisingTimeoutRef.current = setTimeout(() => {
          aiCustomisingTimeoutRef.current = null;
          setIsAiCustomising(false);
        }, 8000);
      }
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
              fallbackUsed: event.fallbackUsed,
            });

            // Detect fallback-only builds: fallbackUsed with 0 AI-generated files
            const aiFileCount = status.result?.files?.length ?? 0;
            if (event.fallbackUsed && aiFileCount === 0) {
              const reason = event.fallbackReason || "The build didn't produce any files.";
              upsertAssistantMessage(bid, (message) => ({
                ...message,
                error: `Build failed: ${reason} Please try again.`,
              }));
              // Don't show the success summary or preview
              return;
            }

            if (status.result) setBuildResult(status.result);
            if (status.trace.previewReady || status.build.status === "completed") {
              setPreviewGenerationId(bid);
            }
            // BEO-281: Update project name from API so TopBar reflects the AI-generated name
            if (status.project.name && status.project.name !== "Untitled project") {
              setProjectName(status.project.name);
            }
            // Completion summary: context-aware
            const displayName = status.project.name || projectName;
            const filePaths = (status.result?.files ?? []).map((f) => f.path);
            const changedPaths = status.result?.generation?.changedPaths;
            const wasIteration = changedPaths && changedPaths.length > 0 && changedPaths.length < filePaths.length;
            let summary: string;
            if (wasIteration) {
              const changedNames = changedPaths.map((p) => p.replace(/^.*\//, ""));
              const changedList = changedNames.length <= 3
                ? changedNames.join(", ")
                : `${changedNames.slice(0, 2).join(", ")} + ${changedNames.length - 2} more`;
              summary = `Done — updated ${changedList}.`;
            } else {
              const pageFiles = filePaths.filter((p) => /Page\.tsx$|Screen\.tsx$/i.test(p));
              const pageNames = pageFiles.map((p) => {
                const name = p.replace(/^.*\//, "").replace(/(Page|Screen)\.tsx$/i, "");
                return name.replace(/([a-z])([A-Z])/g, "$1 $2");
              });
              const pagesLine = pageNames.length > 0 ? " with " + pageNames.join(", ") : "";
              summary = `${displayName} is ready${pagesLine} — ${filePaths.length} files.`;
            }
            setMessages((prev) => [
              ...prev,
              {
                id: `done-${bid}`,
                role: "assistant" as const,
                content: summary,
                timestamp: new Date().toISOString(),
                changedFiles: filePaths,
              },
            ]);

            // Optimistic credit deduction: ~5 credits per build (rough avg)
            deductOptimistic(5);
            // Refresh real balance from API in background
            void refreshCredits();
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
      // Surface the error on the assistant message so ChatPanel can show retry UI
      upsertAssistantMessage(buildId, (message) => ({
        ...message,
        error: event.message || "Build failed. Please try again.",
      }));
    }
  }, [appendTranscriptEntry, projectName, upsertAssistantMessage]);

  // Called by PreviewPane/useWebContainerPreview after new files have been
  // written to the WebContainer sandbox. We wait a short window for Vite HMR
  // to propagate before revealing the iframe so the user never sees the
  // scaffold template flash through.
  const handleFilesWrittenToWC = useCallback(() => {
    if (aiCustomisingTimeoutRef.current) {
      clearTimeout(aiCustomisingTimeoutRef.current);
      aiCustomisingTimeoutRef.current = null;
    }
    // 400ms covers Vite HMR detection + React fast-refresh render.
    setTimeout(() => setIsAiCustomising(false), 400);
  }, []);

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
      setStreamingText("Analysing your prompt\u2026");
      setPreviewGenerationId(null);
      setLastEventId(null);
      activeAssistantMessageIdRef.current = null;
      activeBuildIdRef.current = null;

      // Auto-name from prompt if still "Untitled project"
      let effectiveName = projectName;
      if (projectName === "Untitled project") {
        const extracted = extractProjectName(text);
        if (extracted) {
          effectiveName = extracted;
          setProjectName(extracted);
        }
      }

      await startAndStreamBuild({
        body: {
          existingFiles: buildResult?.files?.length ? buildResult.files : undefined,
        model: "claude-sonnet-4-6",
          prompt: text,
          projectId: projectId ?? undefined,
          projectName: effectiveName !== "Untitled project" ? effectiveName : undefined,
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
    // Block submission if out of credits
    if (credits && credits.balance <= 0) {
      setShowOutOfCreditsModal(true);
      return;
    }

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
    };

    lastUserPromptRef.current = text;
    summaryAbortRef.current?.abort();
    abortRef.current?.abort();

    // Build a context-aware intro message
    const isIteration = !!(buildResult?.files?.length);
    const introContent = buildIntroMessage(text, isIteration);
    const introMessage: ChatMessage = {
      id: `assistant-intro-${Date.now()}`,
      role: "assistant",
      content: introContent,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMessage, introMessage]);

    void startBuildSession(text).catch((error) => {
      if (abortRef.current?.signal.aborted) return;
      setIsStreaming(false);
      setStreamingText("");
      const errorMsg = error instanceof Error ? error.message : "Failed to start build.";
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-error-${Date.now()}`,
          role: "assistant",
          content: errorMsg,
          timestamp: new Date().toISOString(),
          error: errorMsg,
        },
      ]);
    });
  }, [credits, startBuildSession]);

  const handleRetry = useCallback(() => {
    const prompt = lastUserPromptRef.current;
    if (!prompt) return;
    // Clear the error from the last assistant message before retrying
    setMessages((prev) => prev.map((m) =>
      m.error ? { ...m, error: null } : m,
    ));
    handleSendMessage(prompt);
  }, [handleSendMessage]);

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
            isAiCustomising={isAiCustomising}
            previewEntryPath={buildResult?.previewEntryPath ?? null}
            project={projectId && build?.templateId
              ? { id: projectId, name: projectName, templateId: build.templateId as TemplateId }
              : null}
            refreshToken={previewRefreshKey}
            onFilesWritten={handleFilesWrittenToWC}
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
              onRetry={handleRetry}
              onViewCode={() => {
                setActiveView("code");
                const firstFile = buildResult?.files?.[0]?.path;
                if (firstFile) setSelectedFile(firstFile);
              }}
              width={chatPanelWidth}
              suggestionChips={suggestionChips}
              onDismissChips={() => setSuggestionChips([])}
              creditsBalance={credits?.balance}
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
          onVercelDeployed={(url) => {
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
