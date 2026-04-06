/**
 * ChatPanel — V2 chat sidebar.
 * User messages: right-aligned dark bubble.
 * AI messages: left-aligned with orange "B" avatar.
 * Plan cards, file change links, error toast, streaming shimmer.
 */
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
  CheckCircle2,
  Loader2,
  Wrench,
  FileCode,
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
}

interface ChatPanelProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  streamingText: string;
  onSendMessage: (text: string) => void;
  onStopStreaming?: () => void;
  onAutoFix?: (error: string) => void;
  onViewCode?: () => void;
  width?: number;
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
        elements.push(<p key={`p-${i}`} className="text-sm leading-relaxed text-[#374151]">{renderInline(line)}</p>);
      }
    }
  }
  flushList();
  return <>{elements}</>;
}

// ─────────────────────────────────────────────
// Trace entry row
// ─────────────────────────────────────────────

function TraceEntryRow({ entry }: { entry: BuilderV3TranscriptEntry }) {
  const isError = entry.status === "error" || entry.kind === "error";
  const isSuccess = entry.status === "success" || entry.kind === "done";
  const isRunning = entry.status === "running" || entry.kind === "tool_use";

  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-xl border px-2.5 py-2 text-xs",
        isError
          ? "border-red-200 bg-red-50 text-red-700"
          : isSuccess
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : "border-[#e5e5e5] bg-[#faf9f6] text-[#6b7280]",
      )}
    >
      <span className="mt-0.5 shrink-0">
        {isRunning ? <Loader2 size={13} className="animate-spin" />
          : isError ? <AlertCircle size={13} />
            : isSuccess ? <CheckCircle2 size={13} />
              : <Wrench size={13} />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-medium">{entry.message}</div>
        {(entry.toolName || entry.code) && (
          <div className="mt-1 text-[11px] uppercase tracking-wide opacity-70">
            {[entry.toolName, entry.code].filter(Boolean).join(" \u00b7 ")}
          </div>
        )}
      </div>
    </div>
  );
}

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
// File change link
// ─────────────────────────────────────────────

function FileChangeBadge({ files, onViewCode }: { files: readonly string[]; onViewCode?: () => void }) {
  if (files.length === 0) return null;
  return (
    <button
      onClick={onViewCode}
      className="mt-2 flex items-center gap-1.5 rounded-lg border border-[#e5e5e5] bg-[#faf9f6] px-2.5 py-1.5 text-xs text-[#6b7280] transition-colors hover:bg-[#f3f4f6]"
    >
      <FileCode size={12} />
      <span>{files.length} file{files.length !== 1 ? "s" : ""} changed</span>
      <span className="text-[#F97316]">\u00b7 View code</span>
    </button>
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
// Orange B Avatar
// ─────────────────────────────────────────────

function BeomzAvatar() {
  return (
    <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-[#F97316] text-xs font-bold text-white">
      B
    </div>
  );
}

// ─────────────────────────────────────────────
// Streaming shimmer
// ─────────────────────────────────────────────

function StreamingShimmer() {
  return (
    <div className="space-y-2 py-1">
      <div className="h-3 w-3/4 animate-pulse rounded bg-[#f3f4f6]" />
      <div className="h-3 w-1/2 animate-pulse rounded bg-[#f3f4f6]" style={{ animationDelay: "150ms" }} />
      <div className="h-3 w-2/3 animate-pulse rounded bg-[#f3f4f6]" style={{ animationDelay: "300ms" }} />
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
  onViewCode,
  width = 380,
}: ChatPanelProps) {
  const [input, setInput] = useState("");
  const [planMode, setPlanMode] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, streamingText]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setShowScrollBtn(el.scrollHeight - el.scrollTop - el.clientHeight > 80);
  }, []);

  const scrollToBottom = useCallback(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
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
      const el = e.target;
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
    },
    [],
  );

  const hasMessages = messages.length > 0 || isStreaming;

  // Find the last error in messages for the error toast
  const lastError = [...messages].reverse().find((m) => m.error)?.error ?? null;

  return (
    <div
      className="flex shrink-0 flex-col border-r border-[#e5e5e5] bg-[#faf9f6]"
      style={{ width }}
    >
      {/* Messages area */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="relative flex-1 overflow-y-auto px-4 py-4"
      >
        {!hasMessages && (
          <div className="flex h-full items-center justify-center">
            <p className="max-w-[200px] text-center text-sm leading-relaxed text-[#c4c4c4]">
              Describe what you want to build or change
            </p>
          </div>
        )}

        {hasMessages && (
          <div className="space-y-4">
            {messages.map((msg) => (
              <div key={msg.id}>
                {msg.role === "user" ? (
                  /* User message — right-aligned dark bubble */
                  <div className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl rounded-br-md bg-[#1a1a1a] px-3.5 py-2.5 text-sm leading-relaxed text-white">
                      {msg.content}
                    </div>
                  </div>
                ) : (
                  /* AI message — left-aligned with orange avatar */
                  <div className="flex items-start gap-2.5">
                    <BeomzAvatar />
                    <div className="group relative min-w-0 max-w-[85%]">
                      <div className="rounded-2xl rounded-bl-md border border-[#e5e5e5] bg-white px-3.5 py-2.5 text-sm leading-relaxed text-[#1a1a1a]">
                        {msg.content && <MarkdownText text={msg.content} />}

                        {/* Plan steps card */}
                        {msg.planSteps && msg.planSteps.length > 0 && (
                          <PlanCardInline steps={msg.planSteps} />
                        )}

                        {/* Trace entries */}
                        {msg.traceEntries && msg.traceEntries.length > 0 && (
                          <div className={cn(msg.content ? "mt-3 space-y-2" : "space-y-2")}>
                            {msg.traceEntries.map((entry) => (
                              <TraceEntryRow key={entry.id} entry={entry} />
                            ))}
                          </div>
                        )}

                        {/* File change badge */}
                        {msg.changedFiles && msg.changedFiles.length > 0 && (
                          <FileChangeBadge files={msg.changedFiles} onViewCode={onViewCode} />
                        )}
                      </div>

                      {/* Copy button on hover */}
                      <div className="absolute -right-8 top-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <CopyButton text={msg.content} />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* Streaming AI message */}
            {isStreaming && (
              <div className="flex items-start gap-2.5">
                <BeomzAvatar />
                <div className="min-w-0 max-w-[85%] rounded-2xl rounded-bl-md border border-[#e5e5e5] bg-white px-3.5 py-2.5">
                  {streamingText ? (
                    <div className="text-sm leading-relaxed text-[#1a1a1a]">
                      <MarkdownText text={streamingText} />
                      <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-[#9ca3af]" />
                    </div>
                  ) : (
                    <StreamingShimmer />
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

      {/* Error toast */}
      {lastError && !isStreaming && onAutoFix && (
        <div className="mx-3 mb-2 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs shadow-sm">
          <AlertCircle size={14} className="flex-shrink-0 text-amber-500" />
          <span className="flex-1 truncate text-amber-800">{lastError}</span>
          <button
            onClick={() => onAutoFix(lastError)}
            className="flex-shrink-0 rounded-lg bg-[#F97316] px-2.5 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-[#ea6c10]"
          >
            Fix automatically &rarr;
          </button>
        </div>
      )}

      {/* Input bar */}
      <div className="border-t border-[#e5e5e5] px-3 py-2">
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
                disabled={!input.trim()}
                className="rounded-lg bg-[#F97316] p-1.5 text-white transition-colors hover:bg-[#ea6c10] disabled:opacity-40"
                title="Send"
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
