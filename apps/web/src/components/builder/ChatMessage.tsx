/**
 * ChatMessage — BEO-364 / BEO-373 / BEO-378 / BEO-379 / BEO-386 / BEO-391.
 * Building state: single evolving card — preamble, checklist + timer, summary + next-steps.
 */
import { useEffect, useState } from "react";
import type { ChatChecklistStatus, ChatMessage } from "@beomz-studio/contracts";
import { Check, ChevronDown, ChevronRight, Copy, FileCode } from "lucide-react";
import { ServerRestartedCard } from "./ServerRestartedCard";
import { NextStepsCard } from "./NextStepsCard";

// ─── B avatar ─────────────────────────────────────────────────────────────────

function BAvatar() {
  return (
    <div className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-zinc-900">
      <span className="text-[9px] font-bold leading-none text-[#F97316]">B</span>
    </div>
  );
}

// ─── Copy button ──────────────────────────────────────────────────────────────

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

// ─── Elapsed timer (BEO-386) ──────────────────────────────────────────────────

function useElapsedSeconds(buildStartedAt: number, buildFrozenAt?: number): number {
  const [elapsed, setElapsed] = useState(() =>
    Math.floor(((buildFrozenAt ?? Date.now()) - buildStartedAt) / 1000),
  );

  useEffect(() => {
    if (buildFrozenAt !== undefined) {
      setElapsed(Math.floor((buildFrozenAt - buildStartedAt) / 1000));
      return;
    }
    const tick = () => setElapsed(Math.floor((Date.now() - buildStartedAt) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [buildStartedAt, buildFrozenAt]);

  return elapsed;
}

function ElapsedTimer({
  buildStartedAt,
  buildFrozenAt,
}: {
  buildStartedAt: number;
  buildFrozenAt?: number;
}) {
  const elapsed = useElapsedSeconds(buildStartedAt, buildFrozenAt);
  const m = Math.floor(elapsed / 60);
  const s = elapsed % 60;
  return (
    <span className="tabular-nums font-mono text-sm text-zinc-400">
      {m}:{String(s).padStart(2, "0")}
    </span>
  );
}

// ─── Pending row (before first building message arrives) ─────────────────────

export function BuildingShimmer() {
  return (
    <div className="flex items-center gap-1.5 py-1">
      <span className="animate-pulse text-[#F97316]">◌</span>
      <span className="text-sm text-zinc-500">Starting…</span>
    </div>
  );
}

// ─── Checklist ───────────────────────────────────────────────────────────────

function ChecklistGlyph({ status }: { status: ChatChecklistStatus }) {
  switch (status) {
    case "pending":
      return <span className="text-zinc-300">○</span>;
    case "active":
      return <span className="animate-pulse text-[#F97316]">◌</span>;
    case "done":
      return <span className="text-emerald-600/70">✓</span>;
    case "failed":
      return <span className="text-red-500">✕</span>;
    default:
      return <span className="text-zinc-300">○</span>;
  }
}

type BuildingMsg = Extract<ChatMessage, { type: "building" }>;

function BuildingLiveCard({
  message,
  onPopulateInput,
}: {
  message: BuildingMsg;
  onPopulateInput?: (text: string) => void;
}) {
  const {
    preamble,
    checklist,
    summary,
    nextSteps,
    filesWritten,
    totalFiles,
    buildStartedAt,
    buildFrozenAt,
  } = message;

  const showFileCount =
    typeof filesWritten === "number" && typeof totalFiles === "number" && totalFiles > 0;
  const fileLine = showFileCount ? `Writing file ${filesWritten} of ${totalFiles}…` : null;

  const showPreamble =
    !!preamble &&
    (preamble.restatement.trim().length > 0 || preamble.bullets.length > 0);

  return (
    <div className="flex items-start gap-2">
      <BAvatar />
      <div className="min-w-0 flex-1 space-y-3 break-words">
        {showPreamble && (
          <div className="origin-top transition-[opacity,transform] duration-300 ease-out">
            {preamble!.restatement.trim().length > 0 && (
              <p className="text-sm leading-relaxed text-[#374151]">{preamble!.restatement}</p>
            )}
            {preamble!.bullets.length > 0 && (
              <ul className="mt-2 space-y-1">
                {preamble!.bullets.map((line, i) => (
                  <li
                    key={i}
                    className="flex gap-2 text-sm leading-relaxed text-zinc-600"
                  >
                    <span className="flex-shrink-0 select-none text-zinc-400">•</span>
                    <span className="min-w-0">{line}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {checklist && checklist.length > 0 && (
          <div
            className={`relative rounded-lg border border-[#e5e5e5] bg-white/80 px-3 py-2.5 pr-16 ${
              summary ? "opacity-90" : ""
            }`}
          >
            <ul className="space-y-1.5">
              {checklist.map(item => (
                <li key={item.id} className="flex items-start gap-2 text-sm">
                  <span className="mt-0.5 w-4 flex-shrink-0 text-center">
                    <ChecklistGlyph status={item.status} />
                  </span>
                  <span
                    className={
                      item.status === "pending"
                        ? "text-zinc-400"
                        : item.status === "active"
                          ? "font-medium text-[#374151]"
                          : item.status === "failed"
                            ? "text-red-600/90"
                            : "text-zinc-600"
                    }
                  >
                    {item.label}
                  </span>
                </li>
              ))}
            </ul>
            {typeof buildStartedAt === "number" && !summary && (
              <div className="pointer-events-none absolute bottom-2 right-3">
                <ElapsedTimer buildStartedAt={buildStartedAt} buildFrozenAt={buildFrozenAt} />
              </div>
            )}
            {fileLine && !summary && (
              <p className="mt-2 text-xs text-zinc-400">{fileLine}</p>
            )}
          </div>
        )}

        {summary && (
          <div className="space-y-1">
            <MarkdownText text={summary.content} />
            <SummaryFooterRow
              filesChanged={summary.filesChanged}
              durationMs={summary.durationMs}
              creditsUsed={summary.creditsUsed}
              copyContent={summary.content}
            />
            <NextStepsCard
              chips={nextSteps}
              summaryAnchoredAt={buildFrozenAt ?? null}
              onSelectPrompt={prompt => onPopulateInput?.(prompt)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Summary footer (shared) ───────────────────────────────────────────────────

function SummaryFooterRow({
  filesChanged,
  durationMs,
  creditsUsed,
  copyContent,
}: {
  filesChanged: string[];
  durationMs?: number;
  creditsUsed?: number;
  copyContent: string;
}) {
  const [filesExpanded, setFilesExpanded] = useState(false);
  const showFooter =
    typeof durationMs === "number" &&
    durationMs > 0 &&
    typeof creditsUsed === "number" &&
    creditsUsed > 0;
  const formatDuration = (ms: number) => {
    if (ms >= 60000) {
      const m = Math.floor(ms / 60000);
      const s = Math.floor((ms % 60000) / 1000);
      return `${m}m ${s}s`;
    }
    return `${Math.floor(ms / 1000)}s`;
  };

  return (
    <>
      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
        {filesChanged.length > 0 && (
          <button
            className="flex cursor-pointer items-center gap-1 hover:text-zinc-300 transition-colors"
            onClick={() => setFilesExpanded(p => !p)}
          >
            <FileCode className="h-2.5 w-2.5" />
            {filesChanged.length} files changed
            {filesExpanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </button>
        )}
        {showFooter && (
          <span>
            {formatDuration(durationMs!)} · {creditsUsed} credits used
          </span>
        )}
        <span className="ml-auto">
          <CopyButton content={copyContent} />
        </span>
      </div>
      {filesExpanded && filesChanged.length > 0 && (
        <div className="mt-1 space-y-0.5 pl-4">
          {filesChanged.map((filename, i) => (
            <p key={i} className="font-mono text-xs text-zinc-400">
              {filename}
            </p>
          ))}
        </div>
      )}
    </>
  );
}

// ─── Markdown-lite renderer ───────────────────────────────────────────────────

function renderInline(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*.*?\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={i} className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-[13px]">
          {part.slice(1, -1)}
        </code>
      );
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
      if (listBuffer?.type !== "ul") {
        flushList();
        listBuffer = { type: "ul", items: [] };
      }
      listBuffer!.items.push(ulMatch[1]);
    } else if (olMatch) {
      if (listBuffer?.type !== "ol") {
        flushList();
        listBuffer = { type: "ol", items: [] };
      }
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

function AIMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <BAvatar />
      <div className="min-w-0 flex-1 break-words">{children}</div>
    </div>
  );
}

function BuildSummaryMessage({
  message,
  onPopulateInput,
}: {
  message: Extract<ChatMessage, { type: "build_summary" }>;
  onPopulateInput?: (text: string) => void;
}) {
  const [summaryAnchoredAt] = useState(() => Date.now());
  return (
    <AIMessage>
      <MarkdownText text={message.content} />
      <SummaryFooterRow
        filesChanged={message.filesChanged}
        durationMs={message.durationMs}
        creditsUsed={message.creditsUsed}
        copyContent={message.content}
      />
      <NextStepsCard
        chips={message.nextSteps}
        summaryAnchoredAt={summaryAnchoredAt}
        onSelectPrompt={prompt => onPopulateInput?.(prompt)}
      />
    </AIMessage>
  );
}

// ─── ChatMessageView ──────────────────────────────────────────────────────────

export function ChatMessageView({
  message,
  onRetry,
  onPopulateInput,
}: {
  message: ChatMessage;
  onRetry?: () => void;
  onPopulateInput?: (text: string) => void;
}) {
  switch (message.type) {
    case "thinking":
      return (
        <div className="flex items-center gap-1 py-1">
          <span
            className="h-1.5 w-1.5 rounded-full bg-zinc-400 animate-pulse"
            style={{ animationDelay: "0ms" }}
          />
          <span
            className="h-1.5 w-1.5 rounded-full bg-zinc-400 animate-pulse"
            style={{ animationDelay: "150ms" }}
          />
          <span
            className="h-1.5 w-1.5 rounded-full bg-zinc-400 animate-pulse"
            style={{ animationDelay: "300ms" }}
          />
        </div>
      );

    case "user":
      return (
        <div className="flex flex-col items-end">
          <div className="max-w-[70%] min-w-0 rounded-2xl rounded-br-sm bg-[#0a0a0a] px-3.5 py-2 text-sm leading-relaxed text-white shadow-sm break-words">
            {message.content}
          </div>
        </div>
      );

    case "pre_build_ack":
      return (
        <p className="text-sm leading-relaxed text-[#374151] break-words">
          {message.content}
        </p>
      );

    case "building":
      return (
        <BuildingLiveCard message={message} onPopulateInput={onPopulateInput} />
      );

    case "question_answer":
      return (
        <AIMessage>
          <MarkdownText text={message.content} />
          <div className="mt-1.5 flex justify-end">
            <CopyButton content={message.content} />
          </div>
        </AIMessage>
      );

    case "build_summary":
      return (
        <BuildSummaryMessage message={message} onPopulateInput={onPopulateInput} />
      );

    case "clarifying_question":
      return (
        <AIMessage>
          <MarkdownText text={message.content} />
          <div className="mt-1.5 flex justify-end">
            <CopyButton content={message.content} />
          </div>
        </AIMessage>
      );

    case "error":
      return <p className="text-sm text-red-400">{message.content}</p>;

    case "server_restarting":
      return <ServerRestartedCard onRetry={onRetry ?? (() => {})} />;

    default:
      return null;
  }
}
