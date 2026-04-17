/**
 * ChatMessage — BEO-364 / BEO-373 / BEO-378 / BEO-379.
 * One component per message type in the discriminated union.
 * Building state: cycling text status (no shimmer bars).
 * BEO-378: copy button, FileChangeBadge, bubble tail, thinking dots.
 * BEO-379: copy button moved inline — no absolute positioning.
 */
import { useEffect, useState } from "react";
import type { ChatMessage } from "@beomz-studio/contracts";
import { Check, Copy, FileCode } from "lucide-react";
import { ServerRestartedCard } from "./ServerRestartedCard";

// ─── B avatar ─────────────────────────────────────────────────────────────────

function BAvatar() {
  return (
    <div className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-zinc-900">
      <span className="text-[9px] font-bold leading-none text-[#F97316]">B</span>
    </div>
  );
}

// ─── Copy button ──────────────────────────────────────────────────────────────
// BEO-379: self-contained, inline — no absolute positioning.

function CopyButton({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    void navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <button onClick={handleCopy} title="Copy">
      {copied ? (
        <Check className="h-3.5 w-3.5 text-zinc-300" />
      ) : (
        <Copy className="h-3.5 w-3.5 cursor-pointer text-zinc-300 hover:text-zinc-500" />
      )}
    </button>
  );
}

// ─── Cycling status ───────────────────────────────────────────────────────────
// BEO-373: replaces the two grey shimmer bars with a cycling text status.
// Shows "Writing file N of M..." when filesWritten/totalFiles are present.

const CYCLING_PHRASES = [
  "Thinking...",
  "Planning the structure...",
  "Writing components...",
  "Building your app...",
  "Almost done...",
];

interface BuildingShimmerProps {
  filesWritten?: number;
  totalFiles?: number;
}

export function BuildingShimmer({ filesWritten, totalFiles }: BuildingShimmerProps = {}) {
  const showFileCount =
    typeof filesWritten === "number" && typeof totalFiles === "number" && totalFiles > 0;

  const [phraseIdx, setPhraseIdx] = useState(
    () => Math.floor(Math.random() * CYCLING_PHRASES.length),
  );
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (showFileCount) return;
    let fadeTimeout: ReturnType<typeof setTimeout> | null = null;
    const id = setInterval(() => {
      setFading(true);
      fadeTimeout = setTimeout(() => {
        setPhraseIdx(i => (i + 1) % CYCLING_PHRASES.length);
        setFading(false);
      }, 300);
    }, 2500);
    return () => {
      clearInterval(id);
      if (fadeTimeout) clearTimeout(fadeTimeout);
    };
  }, [showFileCount]);

  const text = showFileCount
    ? `Writing file ${filesWritten} of ${totalFiles}...`
    : CYCLING_PHRASES[phraseIdx];

  return (
    <div className="flex items-center gap-1.5">
      <span className="animate-pulse text-[#F97316]">◌</span>
      <span
        className="text-sm text-zinc-500 transition-opacity duration-300"
        style={{ opacity: fading ? 0 : 1 }}
      >
        {text}
      </span>
    </div>
  );
}

// ─── Markdown-lite renderer ────────────────────────────────────────────────────

function renderInline(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*.*?\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={i} className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-[13px]">{part.slice(1, -1)}</code>;
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
    const isOrdered = listBuffer.type === "ol";
    const items = listBuffer.items;
    elements.push(
      isOrdered ? (
        <ol key={`list-${elements.length}`} className="space-y-1 my-1.5">
          {items.map((item, i) => (
            <li key={i} className="flex gap-2 text-sm leading-relaxed text-[#374151]">
              <span className="flex-shrink-0 select-none text-zinc-400">{i + 1}.</span>
              <span className="min-w-0">{renderInline(item)}</span>
            </li>
          ))}
        </ol>
      ) : (
        <ul key={`list-${elements.length}`} className="space-y-1 my-1.5">
          {items.map((item, i) => (
            <li key={i} className="flex gap-2 text-sm leading-relaxed text-[#374151]">
              <span className="flex-shrink-0 select-none text-zinc-400">•</span>
              <span className="min-w-0">{renderInline(item)}</span>
            </li>
          ))}
        </ul>
      ),
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
        elements.push(
          <p key={`p-${i}`} className="text-sm leading-relaxed text-[#374151] break-words">
            {renderInline(line)}
          </p>,
        );
      }
    }
  }
  flushList();
  return <>{elements}</>;
}

// ─── AI message wrapper ───────────────────────────────────────────────────────
// B avatar top-left, text flows freely — no bubble, no container.

function AIMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <BAvatar />
      <div className="min-w-0 flex-1 break-words">{children}</div>
    </div>
  );
}

// ─── ChatMessageView ──────────────────────────────────────────────────────────

export function ChatMessageView({
  message,
  onRetry,
}: {
  message: ChatMessage;
  onRetry?: () => void;
}) {
  switch (message.type) {
    // BEO-378: pulsing dots shown immediately after send, before first SSE event.
    case "thinking":
      return (
        <div className="flex items-center gap-1 py-1">
          <span className="h-1.5 w-1.5 rounded-full bg-zinc-400 animate-pulse" style={{ animationDelay: "0ms" }} />
          <span className="h-1.5 w-1.5 rounded-full bg-zinc-400 animate-pulse" style={{ animationDelay: "150ms" }} />
          <span className="h-1.5 w-1.5 rounded-full bg-zinc-400 animate-pulse" style={{ animationDelay: "300ms" }} />
        </div>
      );

    // User message — dark bubble, right-aligned, no avatar.
    // BEO-378: rounded-br-sm gives an asymmetric "sent" tail.
    case "user":
      return (
        <div className="flex flex-col items-end">
          <div className="max-w-[70%] min-w-0 rounded-2xl rounded-br-sm bg-[#0a0a0a] px-3.5 py-2 text-sm leading-relaxed text-white shadow-sm break-words">
            {message.content}
          </div>
        </div>
      );

    // Pre-build acknowledgement — flush left, no avatar, plain text.
    case "pre_build_ack":
      return (
        <p className="text-sm leading-relaxed text-[#374151] break-words">
          {message.content}
        </p>
      );

    // Building — cycling text status. No avatar, no bubble.
    case "building":
      return (
        <BuildingShimmer filesWritten={message.filesWritten} totalFiles={message.totalFiles} />
      );

    // Conversational AI response — B avatar + text + copy row below.
    case "question_answer":
      return (
        <AIMessage>
          <MarkdownText text={message.content} />
          {/* BEO-379: inline copy row, right-aligned */}
          <div className="mt-1.5 flex justify-end">
            <CopyButton content={message.content} />
          </div>
        </AIMessage>
      );

    // Post-build summary — text + single footer row: files badge · duration · copy.
    case "build_summary": {
      const { durationMs, creditsUsed } = message;
      const showFooter =
        typeof durationMs === "number" && durationMs > 0 &&
        typeof creditsUsed === "number" && creditsUsed > 0;
      const formatDuration = (ms: number) => {
        if (ms >= 60000) {
          const m = Math.floor(ms / 60000);
          const s = Math.floor((ms % 60000) / 1000);
          return `${m}m ${s}s`;
        }
        return `${Math.floor(ms / 1000)}s`;
      };
      return (
        <AIMessage>
          <MarkdownText text={message.content} />
          {/* BEO-379: single footer row — files badge + duration/credits + copy right-aligned */}
          <div className="mt-1.5 flex items-center gap-2 text-xs text-zinc-400">
            {message.filesChanged.length > 0 && (
              <span className="flex items-center gap-1">
                <FileCode className="h-2.5 w-2.5" />
                {message.filesChanged.length} files changed
              </span>
            )}
            {showFooter && (
              <span>{formatDuration(durationMs!)} · {creditsUsed} credits used</span>
            )}
            <span className="ml-auto">
              <CopyButton content={message.content} />
            </span>
          </div>
        </AIMessage>
      );
    }

    // AI asking a clarifying question — same layout as question_answer.
    case "clarifying_question":
      return (
        <AIMessage>
          <MarkdownText text={message.content} />
          {/* BEO-379: inline copy row, right-aligned */}
          <div className="mt-1.5 flex justify-end">
            <CopyButton content={message.content} />
          </div>
        </AIMessage>
      );

    // Error — inline red text, no card.
    case "error":
      return (
        <p className="text-sm text-red-400">{message.content}</p>
      );

    // Server restart — amber card (ServerRestartedCard already exists).
    case "server_restarting":
      return <ServerRestartedCard onRetry={onRetry ?? (() => {})} />;

    default:
      return null;
  }
}
