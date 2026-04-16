/**
 * ChatPanel — V2 chat sidebar.
 * User messages: right-aligned dark bubble.
 * AI messages: left-aligned with orange "B" avatar, plain flowing text (no card).
 * Streaming cursor, rotating build status messages, completion suggestions.
 * Human-readable build progress is shown as transcript rows.
 */
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { BuilderV3TranscriptEntry } from "@beomz-studio/contracts";
import {
  Send,
  Square,
  Paperclip,
  ArrowDown,
  Copy,
  Check,
  Sparkles,
  ListChecks,
  AlertCircle,
  ChevronDown,
  Code2,
  Zap,
  RefreshCw,
} from "lucide-react";
import { cn } from "../../lib/cn";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  traceEntries?: readonly BuilderV3TranscriptEntry[];
  planSteps?: readonly string[];
  changedFiles?: readonly string[];
  error?: string | null;
  suggestions?: readonly string[];
  phase?: { current: number; total: number; summary: string };
  /** When true, ChatPanel renders the phaseCard ReactNode here instead of message content */
  isPhaseCard?: boolean;
  /** When true, ChatPanel renders the scopeCard ReactNode here instead of message content */
  isScopeCard?: boolean;
  /** When true, ChatPanel renders the insufficientCreditsCard ReactNode here */
  isInsufficientCreditsCard?: boolean;
}


interface ChatPanelProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  streamingText: string;
  onSendMessage: (text: string) => void;
  onStopStreaming?: () => void;
  onAutoFix?: (error: string) => void;
  onRetry?: () => void;
  onViewCode?: () => void;
  width?: number;
  suggestionChips?: string[];
  onDismissChips?: () => void;
  /** Current credits balance — 0 disables send */
  creditsBalance?: number;
  /** Optional node rendered at the bottom of the message list, inside the scroll container */
  phaseCard?: ReactNode;
  /** Optional node rendered at isScopeCard message position */
  scopeCard?: ReactNode;
  /** Optional node rendered at isInsufficientCreditsCard message position */
  insufficientCreditsCard?: ReactNode;
  /** BEO-316: muted "Writing N of M files..." counter shown below shimmer label */
  streamingFileCount?: { current: number; total: number } | null;
}

// ─────────────────────────────────────────────
// Code line filter — keep only prose-like lines
// ─────────────────────────────────────────────

const ALLOWED_ASSISTANT_MESSAGES = new Set([
  "I’m designing the build plan.",
  "I’m building the approved app now.",
  "Let me take a look at that.",
]);

const PROSE_STARTER_PATTERN = /^(?:[A-Z][a-z]+|I(?:’|’)m|We(?:’|’)re|Building|Planning|Generating|Creating|Updating|Checking|Connecting|Reconnecting|Preview|Build|Error|Done|Ready|Almost|Starting|Finishing)\b/;

function stripListPrefix(line: string): string {
  return line
    .replace(/^[-•*]\s+/, "")
    .replace(/^\d+\.\s+/, "");
}

function hasLowSymbolDensity(line: string): boolean {
  const nonSpace = line.replace(/\s/g, "");
  if (nonSpace.length === 0) {
    return true;
  }

  const symbols = (line.match(/[^A-Za-z0-9\s.,!?’"():/-]/g) || []).length;
  return symbols / nonSpace.length < 0.1;
}

function isHumanReadableLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length === 0) {
    return true;
  }

  if (ALLOWED_ASSISTANT_MESSAGES.has(trimmed)) {
    return true;
  }

  const proseCandidate = stripListPrefix(trimmed);
  if (!/[A-Za-z]/.test(proseCandidate)) {
    return false;
  }

  if (/(===|!==|=>|<=|>=|\$\{|<\/?[A-Za-z]|^\s*(?:import|export|const|let|var|function|class|interface|type|return|if|else|switch|case|for|while|try|catch|async|await|throw|default)\b)/.test(proseCandidate)) {
    return false;
  }

  if (/[{}[\]|`]/.test(proseCandidate)) {
    return false;
  }

  if (/^[a-z_$][\w$.]*\s*(?:===|!==|==|=|\?)/.test(proseCandidate)) {
    return false;
  }

  if (/^(?:[A-Z][a-zA-Z]+,?\s*){3,}$/.test(proseCandidate) && !/[.!?]$/.test(proseCandidate)) {
    return false;
  }

  if (!hasLowSymbolDensity(proseCandidate)) {
    return false;
  }

  const words = proseCandidate.split(/\s+/).filter(Boolean);
  if (words.length <= 1 && !/[.!?]$/.test(proseCandidate)) {
    return false;
  }

  return PROSE_STARTER_PATTERN.test(proseCandidate)
    || /[.!?]$/.test(proseCandidate)
    || words.length >= 4;
}

function filterCodeFromText(text: string): string {
  const lines = text.split("\n");
  const kept = lines.filter((line) => isHumanReadableLine(line));

  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

// ─────────────────────────────────────────────
// Markdown-lite renderer
// ─────────────────────────────────────────────

function renderInline(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*.*?\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} className="font-semibold text-[#1a1a1a]">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={i} className="rounded bg-[#f3f4f6] px-1.5 py-0.5 font-mono text-[13px] text-[#7c3aed]">{part.slice(1, -1)}</code>;
    }
    return <span key={i}>{part}</span>;
  });
}

function MarkdownText({ text }: { text: string }) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let listBuffer: { type: "ul" | "ol"; items: string[] } | null = null;

  const flushList = () => {
    if (!listBuffer) return;
    const Tag = listBuffer.type === "ol" ? "ol" : "ul";
    const cls = listBuffer.type === "ol"
      ? "list-decimal list-inside space-y-1 my-1.5"
      : "list-disc list-inside space-y-1 my-1.5";
    elements.push(
      <Tag key={`list-${elements.length}`} className={cls}>
        {listBuffer.items.map((item, i) => (
          <li key={i} className="text-sm leading-relaxed text-[#374151]">{renderInline(item)}</li>
        ))}
      </Tag>,
    );
    listBuffer = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const ulMatch = line.match(/^[-•*]\s+(.*)/);
    const olMatch = line.match(/^\d+[.)]\s+(.*)/);

    if (ulMatch) {
      if (listBuffer?.type !== "ul") { flushList(); listBuffer = { type: "ul", items: [] }; }
      listBuffer!.items.push(ulMatch[1]);
    } else if (olMatch) {
      if (listBuffer?.type !== "ol") { flushList(); listBuffer = { type: "ol", items: [] }; }
      listBuffer!.items.push(olMatch[1]);
    } else {
      flushList();
      if (line.trim() === "") {
        elements.push(<div key={`br-${i}`} className="h-2" />);
      } else {
        elements.push(<p key={`p-${i}`} className="text-sm leading-relaxed text-[#374151] break-words">{renderInline(line)}</p>);
      }
    }
  }
  flushList();
  return <>{elements}</>;
}

// ─────────────────────────────────────────────
// Progress rows
// ─────────────────────────────────────────────


// ─────────────────────────────────────────────
// Plan card
// ─────────────────────────────────────────────

function PlanCardInline({ steps }: { steps: readonly string[] }) {
  return (
    <div className="mt-2 rounded-xl border border-[#e5e5e5] bg-[#faf9f6] p-3">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[#9ca3af]">Plan</p>
      <ol className="space-y-1.5">
        {steps.map((step, i) => (
          <li key={i} className="flex items-start gap-2 text-xs text-[#374151]">
            <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-[#F97316]/10 text-[10px] font-bold text-[#F97316]">
              {i + 1}
            </span>
            <span className="pt-0.5 leading-relaxed">{step}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ─────────────────────────────────────────────
// File summary (collapsible)
// ─────────────────────────────────────────────

function FilesSummary({ files, onViewCode }: { files: readonly string[]; onViewCode?: () => void }) {
  const [expanded, setExpanded] = useState(false);
  if (files.length === 0) return null;

  return (
    <div className="mt-2 overflow-hidden rounded-xl border border-[#e5e5e5] bg-[#faf9f6]">
      {/* Header */}
      <div className="flex items-center justify-between px-2.5 py-2">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1.5 text-xs text-[#6b7280] transition-colors hover:text-[#374151]"
        >
          <span className="text-sm leading-none">{"\uD83D\uDCC4"}</span>
          <span>Generated {files.length} file{files.length !== 1 ? "s" : ""}</span>
          <ChevronDown
            size={12}
            className={cn(
              "transition-transform duration-200",
              expanded ? "rotate-0" : "-rotate-90",
            )}
          />
        </button>
        {onViewCode && (
          <button
            onClick={onViewCode}
            className="rounded p-1 text-[#9ca3af] transition-colors hover:bg-[rgba(0,0,0,0.04)] hover:text-[#F97316]"
            title="View code"
          >
            <Code2 size={14} />
          </button>
        )}
      </div>

      {/* File list */}
      {expanded && (
        <div className="border-t border-[#e5e5e5] px-2.5 py-1.5">
          {files.map((filePath) => {
            const fileName = filePath.split("/").pop() ?? filePath;
            return (
              <div
                key={filePath}
                className="flex items-center gap-1.5 py-0.5 text-xs"
                title={filePath}
              >
                <span className="font-mono font-bold text-emerald-500">+</span>
                <span className="truncate font-mono text-[#374151]">{fileName}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Copy button
// ─────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        void navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="rounded p-1 text-[#9ca3af] transition-colors hover:bg-[rgba(0,0,0,0.04)] hover:text-[#6b7280]"
      title="Copy"
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
    </button>
  );
}

// ─────────────────────────────────────────────
// Building status (removed — inline bouncing dots now)
// ─────────────────────────────────────────────

// BuildingStatus removed — step messages now flow inline via streamingText

// ─────────────────────────────────────────────
// Suggestion links
// ─────────────────────────────────────────────

function SuggestionLinks({
  suggestions,
  onSend,
}: {
  suggestions: readonly string[];
  onSend: (text: string) => void;
}) {
  return (
    <div className="mt-3 space-y-1.5 pl-9">
      {suggestions.map((s) => (
        <button
          key={s}
          onClick={() => onSend(s)}
          className="block text-sm text-[#F97316] underline decoration-[#F97316]/30 underline-offset-2 transition-colors hover:text-[#ea6c10] hover:decoration-[#ea6c10]/50"
        >
          {s}
        </button>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────
// Trace entry list — single clean rendering path
// ─────────────────────────────────────────────
function TraceEntryList({ entries }: { entries: readonly BuilderV3TranscriptEntry[] }) {
  if (!entries || entries.length === 0) return null;

  return (
    <div className="mb-2 flex flex-col gap-1">
      {entries.map((e, i) => {
        if (
          e.kind === "tool_result"
          && e.status === "success"
          && e.toolName === "plan_blueprint"
        ) {
          return (
            <div key={e.id ?? i} className="flex items-start gap-2 text-xs">
              <Check size={12} className="mt-0.5 shrink-0 text-[#10b981]" />
              <span className="text-[#1a1a1a] break-words">{e.message}</span>
            </div>
          );
        }

        if (e.kind === "error") {
          return (
            <div key={e.id ?? i} className="flex items-start gap-2 text-xs">
              <span className="mt-0.5 shrink-0 leading-none text-red-500">x</span>
              <span className="text-red-600 break-all">{e.message}</span>
            </div>
          );
        }

        if (e.kind === "done") {
          return (
            <div key={e.id ?? i} className="mt-1 flex items-center gap-2 text-xs font-semibold text-[#1a1a1a]">
              <Zap size={12} className="shrink-0 text-[#F97316]" />
              <span>{e.message}</span>
            </div>
          );
        }

        return null;
      })}
    </div>
  );
}

// ─────────────────────────────────────────────
// ChatPanel
// ─────────────────────────────────────────────

export function ChatPanel({
  messages,
  isStreaming,
  streamingText,
  onSendMessage,
  onStopStreaming,
  onAutoFix,
  onRetry,
  onViewCode,
  width = 380,
  suggestionChips,
  onDismissChips,
  creditsBalance,
  phaseCard,
  scopeCard,
  insufficientCreditsCard,
  streamingFileCount,
}: ChatPanelProps) {
  const [input, setInput] = useState("");
  const [planMode, setPlanMode] = useState(false);
  const outOfCredits = typeof creditsBalance === "number" && creditsBalance <= 0;
  const [chipsDismissed, setChipsDismissed] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const userScrolledUp = useRef(false);

  // Reset chipsDismissed when new chips arrive
  const prevChipsRef = useRef(suggestionChips);
  useEffect(() => {
    if (suggestionChips && suggestionChips.length > 0 && suggestionChips !== prevChipsRef.current) {
      setChipsDismissed(false);
    }
    prevChipsRef.current = suggestionChips;
  }, [suggestionChips]);

  const dismissChips = useCallback(() => {
    setChipsDismissed(true);
    onDismissChips?.();
  }, [onDismissChips]);

  const handleChipClick = useCallback((chip: string) => {
    dismissChips();
    onSendMessage(chip);
  }, [dismissChips, onSendMessage]);

  const showChips = !chipsDismissed && !isStreaming && suggestionChips && suggestionChips.length > 0;

  // Auto-scroll to bottom when new messages arrive, unless user scrolled up
  useEffect(() => {
    if (!userScrolledUp.current) {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages.length, streamingText]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    userScrolledUp.current = distFromBottom > 80;
    setShowScrollBtn(distFromBottom > 80);
  }, []);

  const scrollToBottom = useCallback(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    userScrolledUp.current = false;
  }, []);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || isStreaming) return;
    onSendMessage(text);
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }, [input, isStreaming, onSendMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleTextareaChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setInput(e.target.value);
      if (e.target.value.length > 0 && showChips) dismissChips();
      const el = e.target;
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
    },
    [showChips, dismissChips],
  );

  const hasMessages = messages.length > 0 || isStreaming;

  // Find the last error in messages for the error toast
  const lastError = [...messages].reverse().find((m) => m.error)?.error ?? null;

  // Filter AI message content to remove raw code dumps
  const getDisplayContent = (msg: ChatMessage): string => {
    if (msg.role !== "assistant") return msg.content;
    return filterCodeFromText(msg.content);
  };

  // streamingText is controlled by our personality system, not raw AI output — skip code filter
  const displayStreamingText = streamingText;

  return (
    <div
      className="flex h-full shrink-0 flex-col border-r border-[#e5e5e5] bg-[#faf9f6]"
      style={{ width }}
    >
      {/* Messages area — flex-1 + min-h-0 for proper scroll */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-4"
      >
        {!hasMessages && (
          <div className="flex h-full items-center justify-center">
            <p className="max-w-[200px] text-center text-sm leading-relaxed text-[#c4c4c4]">
              Describe what you want to build or change
            </p>
          </div>
        )}

        {hasMessages && (
          <div className="min-w-0 space-y-4">
            {messages.map((msg, msgIdx) => {
              const displayContent = getDisplayContent(msg);
              const hasTrace = (msg.traceEntries?.length ?? 0) > 0;
              const prevMsg = msgIdx > 0 ? messages[msgIdx - 1] : null;
              const showAvatar = msg.role === "assistant" && prevMsg?.role !== "assistant";

              const hasVisibleContent =
                (displayContent.length > 0 && !hasTrace) ||
                hasTrace ||
                (msg.planSteps && msg.planSteps.length > 0) ||
                (msg.changedFiles && msg.changedFiles.length > 0);

              if (
                msg.role === "assistant"
                && !hasVisibleContent
                && !msg.isPhaseCard
                && !msg.isScopeCard
                && !msg.isInsufficientCreditsCard
              ) return null;

              // Phase card placeholder — render the phaseCard ReactNode here
              if (msg.isPhaseCard) {
                return <div key={msg.id}>{phaseCard}</div>;
              }

              // Scope card placeholder — render the scopeCard ReactNode here
              if (msg.isScopeCard) {
                return <div key={msg.id}>{scopeCard}</div>;
              }

              // Insufficient credits card placeholder
              if (msg.isInsufficientCreditsCard) {
                return <div key={msg.id}>{insufficientCreditsCard}</div>;
              }

              return (
                <div key={msg.id}>
                  {msg.role === "user" ? (
                    /* User message — right-aligned compact bubble, V1 style */
                    <div className="flex flex-col items-end gap-1">
                      <div className="max-w-[70%] min-w-0 rounded-2xl rounded-tr-md bg-[#0a0a0a] px-3.5 py-2 text-sm leading-relaxed text-white shadow-sm break-words">
                        {msg.content}
                      </div>
                    </div>
                  ) : (
                    /* AI message — free-flowing text, avatar only on first in group */
                    <div className="flex items-start gap-2">
                      {showAvatar ? (
                        <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-zinc-900 mt-0.5">
                          <span className="text-[9px] font-bold text-[#F97316] leading-none">B</span>
                        </div>
                      ) : (
                        <div className="w-5 flex-shrink-0" />
                      )}
                      <div className="group relative min-w-0 flex-1 pt-0 break-words">
                        {/* Prose content — hidden during builds (when trace entries exist) */}
                        {displayContent && !hasTrace && <MarkdownText text={displayContent} />}

                        {/* Single trace rendering path */}
                        {hasTrace && (
                          <TraceEntryList entries={msg.traceEntries!} />
                        )}

                        {/* Plan steps card */}
                        {msg.planSteps && msg.planSteps.length > 0 && (
                          <PlanCardInline steps={msg.planSteps} />
                        )}

                        {/* File summary (collapsible) */}
                        {msg.changedFiles && msg.changedFiles.length > 0 && (
                          <FilesSummary files={msg.changedFiles} onViewCode={onViewCode} />
                        )}

                        {/* Suggestions after build complete */}
                        {msg.suggestions && msg.suggestions.length > 0 && !isStreaming && (
                          <SuggestionLinks suggestions={msg.suggestions} onSend={onSendMessage} />
                        )}

                        {displayContent && !hasTrace && (
                          <div className="absolute -right-8 top-1 opacity-0 transition-opacity group-hover:opacity-100">
                            <CopyButton text={displayContent} />
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Streaming — BEO-316 shimmer thinking label + muted file counter */}
            {isStreaming && (
              <div className="flex items-start gap-2 px-1">
                <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-zinc-900 mt-0.5">
                  <span className="text-[9px] font-bold text-[#F97316] leading-none">B</span>
                </div>
                <div className="min-w-0 flex-1 pt-0.5 break-words">
                  {displayStreamingText ? (
                    displayStreamingText.endsWith("\u2026") || displayStreamingText.endsWith("...") ? (
                      /* Thinking/status label — shimmer gradient sweep */
                      <p className="thinking-shimmer py-0.5 text-sm font-medium">
                        {displayStreamingText}
                      </p>
                    ) : (
                      /* Content text — normal rendering */
                      <div className="text-sm leading-relaxed text-[#374151] break-words">
                        <MarkdownText text={displayStreamingText} />
                        <span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse bg-[#9ca3af]" />
                      </div>
                    )
                  ) : (
                    <p className="thinking-shimmer py-0.5 text-sm font-medium">
                      Thinking&hellip;
                    </p>
                  )}
                  {/* Muted file counter (no shimmer) */}
                  {streamingFileCount && streamingFileCount.total > 0 && (
                    <p className="mt-0.5 text-xs text-[#9ca3af]">
                      Writing {streamingFileCount.current} of {streamingFileCount.total} files&hellip;
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        <div ref={chatEndRef} />

        {/* Scroll to bottom FAB */}
        {showScrollBtn && (
          <button
            onClick={scrollToBottom}
            className="sticky bottom-2 left-1/2 -translate-x-1/2 rounded-full border border-[#e5e5e5] bg-white p-2 shadow-md transition-colors hover:bg-[rgba(0,0,0,0.02)]"
          >
            <ArrowDown size={14} className="text-[#6b7280]" />
          </button>
        )}
      </div>

      {/* Error banner with retry */}
      {lastError && !isStreaming && (
        <div className="mx-3 mb-2 flex flex-col gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 shadow-sm">
          <div className="flex items-start gap-2">
            <AlertCircle size={14} className="mt-0.5 flex-shrink-0 text-red-500" />
            <span className="min-w-0 flex-1 text-xs leading-relaxed text-red-800 break-all">{lastError}</span>
          </div>
          <div className="flex items-center gap-2">
            {onRetry && (
              <button
                onClick={onRetry}
                className="flex items-center gap-1.5 rounded-lg bg-[#1a1a1a] px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-[#333]"
              >
                <RefreshCw size={11} />
                Try again
              </button>
            )}
            {onAutoFix && (
              <button
                onClick={() => onAutoFix(lastError)}
                className="flex items-center gap-1.5 rounded-lg bg-[#F97316] px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-[#ea6c10]"
              >
                Fix automatically &rarr;
              </button>
            )}
          </div>
        </div>
      )}

      {/* Suggestion chips above input */}
      {showChips && (
        <div className="flex flex-shrink-0 flex-wrap gap-2 px-3 pb-2">
          {suggestionChips!.map((chip) => (
            <button
              key={chip}
              onClick={() => handleChipClick(chip)}
              className="rounded-full border border-[#e5e5e5] bg-white px-3 py-1.5 text-xs text-[#6b7280] transition-all hover:border-[#d1d5db] hover:text-[#374151]"
            >
              {chip}
            </button>
          ))}
        </div>
      )}

      {/* Input bar — pinned to bottom */}
      <div className="flex-shrink-0 border-t border-[#e5e5e5] px-3 py-2">
        <div className="rounded-xl border border-[#e5e5e5] bg-white focus-within:border-[#F97316]/50">
          <div className="px-3 pt-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleTextareaChange}
              onKeyDown={handleKeyDown}
              placeholder="Ask Beomz to build or change..."
              rows={1}
              className="max-h-[120px] w-full resize-none bg-transparent text-sm text-[#1a1a1a] outline-none placeholder:text-[#9ca3af]"
            />
          </div>

          <div className="flex items-center justify-between px-2 pb-1.5">
            <div className="flex items-center gap-0.5">
              <button
                className="rounded p-1.5 text-[#9ca3af] transition-colors hover:bg-[rgba(0,0,0,0.04)] hover:text-[#6b7280]"
                title="Attach file"
              >
                <Paperclip size={15} />
              </button>
              <button
                className="rounded p-1.5 text-[#9ca3af] transition-colors hover:bg-[rgba(0,0,0,0.04)] hover:text-[#6b7280]"
                title="Enhance with AI"
              >
                <Sparkles size={15} />
              </button>
              <button
                onClick={() => setPlanMode((v) => !v)}
                className={cn(
                  "rounded p-1.5 transition-colors",
                  planMode
                    ? "bg-[#F97316]/10 text-[#F97316]"
                    : "text-[#9ca3af] hover:bg-[rgba(0,0,0,0.04)] hover:text-[#6b7280]",
                )}
                title="Plan mode"
              >
                <ListChecks size={15} />
              </button>
            </div>

            {isStreaming ? (
              <button
                onClick={onStopStreaming}
                className="rounded-lg bg-[#1a1a1a] p-1.5 text-white transition-colors hover:bg-[#333]"
                title="Stop generating"
              >
                <Square size={14} />
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!input.trim() || outOfCredits}
                className="rounded-lg bg-[#F97316] p-1.5 text-white transition-colors hover:bg-[#ea6c10] disabled:opacity-40"
                title={outOfCredits ? "Out of credits — upgrade to continue" : "Send"}
              >
                <Send size={14} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
