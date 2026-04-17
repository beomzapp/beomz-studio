/**
 * ChatMessage — BEO-364 / BEO-373.
 * One component per message type in the discriminated union.
 * Building state: cycling text status (no shimmer bars).
 */
import { useEffect, useState } from "react";
import type { ChatMessage } from "@beomz-studio/contracts";
import { ServerRestartedCard } from "./ServerRestartedCard";

// ─── B avatar ─────────────────────────────────────────────────────────────────

function BAvatar() {
  return (
    <div className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-zinc-900">
      <span className="text-[9px] font-bold leading-none text-[#F97316]">B</span>
    </div>
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
    // User message — dark bubble, right-aligned, no avatar.
    case "user":
      return (
        <div className="flex flex-col items-end">
          <div className="max-w-[70%] min-w-0 rounded-2xl rounded-tr-md bg-[#0a0a0a] px-3.5 py-2 text-sm leading-relaxed text-white shadow-sm break-words">
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

    // Conversational AI response — B avatar, text flows freely.
    case "question_answer":
      return (
        <AIMessage>
          <MarkdownText text={message.content} />
        </AIMessage>
      );

    // Post-build summary — same style as question_answer, with duration + credits footer.
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
          {showFooter && (
            <span className="text-xs text-zinc-400 mt-2 block">
              {formatDuration(durationMs!)} · {creditsUsed} credits used
            </span>
          )}
        </AIMessage>
      );
    }

    // AI asking a clarifying question — same style as question_answer.
    case "clarifying_question":
      return (
        <AIMessage>
          <MarkdownText text={message.content} />
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
