/**
 * ChatMessage — BEO-364.
 * One component per message type in the discriminated union.
 * No legacy code, no icons in building state.
 */
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

// ─── Shimmer ──────────────────────────────────────────────────────────────────
// Two transparent bars, flush left. Keyframe defined in index.css.

export function BuildingShimmer() {
  return (
    <div className="space-y-1.5">
      <div className="h-3 w-[60%] animate-[beomz-shimmer_1.8s_ease-in-out_infinite] rounded-sm bg-[rgba(255,255,255,0.06)]" />
      <div className="h-3 w-[40%] animate-[beomz-shimmer_1.8s_ease-in-out_infinite] rounded-sm bg-[rgba(255,255,255,0.06)]" />
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
    const Tag = listBuffer.type === "ol" ? "ol" : "ul";
    const cls =
      listBuffer.type === "ol"
        ? "list-decimal list-inside space-y-1 my-1.5"
        : "list-disc list-inside space-y-1 my-1.5";
    elements.push(
      <Tag key={`list-${elements.length}`} className={cls}>
        {listBuffer.items.map((item, i) => (
          <li key={i} className="text-sm leading-relaxed text-[#374151]">
            {renderInline(item)}
          </li>
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

    // Building — shimmer bars + optional file counter. No avatar, no icon.
    case "building":
      return (
        <div className="space-y-2">
          <BuildingShimmer />
          {typeof message.filesWritten === "number" &&
            typeof message.totalFiles === "number" &&
            message.totalFiles > 0 && (
              <p className="text-xs text-zinc-400">
                Writing {message.filesWritten} of {message.totalFiles} files&hellip;
              </p>
            )}
        </div>
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
        <p className="text-sm text-red-400">Something went wrong. Try again.</p>
      );

    // Server restart — amber card (ServerRestartedCard already exists).
    case "server_restarting":
      return <ServerRestartedCard onRetry={onRetry ?? (() => {})} />;

    default:
      return null;
  }
}
