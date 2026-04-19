/**
 * ChatMessage — BEO-364 / BEO-373 / BEO-378 / BEO-379 / BEO-386 / BEO-391.
 * Building state: single evolving card — preamble, checklist + timer, summary + next-steps.
 */
import { useEffect, useState } from "react";
import type { ChatChecklistStatus, ChatMessage } from "@beomz-studio/contracts";
import { Check, ChevronDown, ChevronRight, ChevronUp, Copy, FileCode, Send } from "lucide-react";
import { CHECKLIST_LABELS } from "../../lib/buildStatusCopy";
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

// ─── Pending card (before stage_preamble arrives) ────────────────────────────

export function BuildingShimmer() {
  return (
    <div className="flex items-start gap-2 py-1">
      <BAvatar />
      <div className="min-w-0 flex-1">
        <div className="rounded-lg border border-[#e5e5e5] bg-white/80 px-3 py-1 pr-16 opacity-60">
          <ul className="space-y-0">
            {(
              [
                ["planning", CHECKLIST_LABELS.planning],
                ["writing", CHECKLIST_LABELS.writing],
                ["polishing", CHECKLIST_LABELS.polishing],
                ["deploying", CHECKLIST_LABELS.deploying],
              ] as const
            ).map(([id, label]) => (
              <li key={id} className="flex min-h-[40px] items-center gap-3">
                <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center">
                  <span className="h-3 w-3 rounded-full border-[1.5px] border-zinc-300" />
                </span>
                <span className="text-[15px] text-zinc-400">{label}</span>
              </li>
            ))}
          </ul>
          <p className="pb-1 text-xs text-zinc-400">Starting…</p>
        </div>
      </div>
    </div>
  );
}

// ─── Checklist ───────────────────────────────────────────────────────────────

function ChecklistGlyph({ status }: { status: ChatChecklistStatus }) {
  switch (status) {
    case "pending":
      return (
        <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center">
          <span className="h-3 w-3 rounded-full border-[1.5px] border-zinc-300" />
        </span>
      );
    case "active":
      return (
        <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center">
          <span className="checklist-orb-active h-5 w-5 rounded-full bg-[#F97316]" />
        </span>
      );
    case "done":
      return (
        <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center text-[15px] text-emerald-600/70">
          ✓
        </span>
      );
    case "failed":
      return (
        <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center text-[15px] text-red-500">
          ✕
        </span>
      );
    default:
      return (
        <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center">
          <span className="h-3 w-3 rounded-full border-[1.5px] border-zinc-300" />
        </span>
      );
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
        {!summary && showPreamble && (
          <div className="origin-top transition-[opacity,transform] duration-300 ease-out">
            {preamble!.restatement.trim().length > 0 && (
              <p className="text-sm leading-relaxed text-[#374151]">{preamble!.restatement}</p>
            )}
            {preamble!.bullets.length > 0 && (
              <ul className="mt-2 space-y-1">
                {preamble!.bullets.map((line, i) => (
                  <li key={i} className="flex gap-2 text-sm leading-relaxed text-zinc-600">
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
            <ul className="space-y-0">
              {checklist.map(item => (
                <li key={item.id} className="flex min-h-[40px] items-center gap-3">
                  <ChecklistGlyph status={item.status} />
                  <span
                    className={
                      item.status === "pending"
                        ? "text-[15px] text-zinc-400"
                        : item.status === "active"
                          ? "text-[15px] font-medium text-[#374151]"
                          : item.status === "failed"
                            ? "text-[15px] text-red-600/90"
                            : "text-[15px] text-zinc-600"
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
            {formatDuration(durationMs!)} · {creditsUsed.toFixed(2)} credits used
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

// ─── Image Intent Confirmation Card (BEO-182) ─────────────────────────────────

type ImageIntentMsg = Extract<ChatMessage, { type: "image_intent" }>;

const INTENT_PRIMARY_LABEL: Record<ImageIntentMsg["intent"], string | null> = {
  logo: "Yes, use it in the header and favicon",
  reference: "Yes, match this layout and style",
  error: "Yes, diagnose and fix this",
  theme: "Yes, apply these colors and fonts",
  general: null, // shows text input instead
};

function ImageIntentCard({
  message,
  onConfirm,
}: {
  message: ImageIntentMsg;
  onConfirm?: (prompt: string, imageUrl: string) => void;
}) {
  const [dismissed, setDismissed] = useState(false);
  const [generalInput, setGeneralInput] = useState("");

  if (dismissed) {
    return (
      <AIMessage>
        <p className="text-sm text-zinc-400 italic">Image attached for context.</p>
      </AIMessage>
    );
  }

  const primaryLabel = INTENT_PRIMARY_LABEL[message.intent];

  const handlePrimary = (prompt: string) => {
    setDismissed(true);
    onConfirm?.(prompt, message.imageUrl);
  };

  const handleDismiss = () => setDismissed(true);

  return (
    <AIMessage>
      <div className="space-y-2.5">
        {/* Thumbnail */}
        <img
          src={message.imageUrl}
          alt="Uploaded"
          className="h-20 w-auto max-w-[160px] rounded-lg object-cover"
        />

        {/* Description */}
        <p className="text-sm leading-relaxed text-[#374151]">{message.description}</p>

        <div className="flex flex-col gap-2">
          {/* Primary action */}
          {primaryLabel ? (
            <button
              onClick={() => handlePrimary(primaryLabel)}
              className="w-full rounded-lg bg-[#F97316] px-3 py-2 text-left text-sm font-medium text-white transition-colors hover:bg-[#ea6c10]"
            >
              {primaryLabel}
            </button>
          ) : (
            /* General: free-text input */
            <div className="flex gap-2">
              <input
                type="text"
                value={generalInput}
                onChange={e => setGeneralInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" && generalInput.trim()) {
                    handlePrimary(generalInput.trim());
                  }
                }}
                placeholder="What would you like me to do with this image?"
                className="min-w-0 flex-1 rounded-lg border border-[#e5e5e5] px-3 py-2 text-sm outline-none focus:border-[#F97316]/50"
              />
              <button
                onClick={() => generalInput.trim() && handlePrimary(generalInput.trim())}
                disabled={!generalInput.trim()}
                className="rounded-lg bg-[#F97316] p-2 text-white transition-colors hover:bg-[#ea6c10] disabled:opacity-40"
              >
                <Send size={14} />
              </button>
            </div>
          )}

          {/* Secondary: dismiss */}
          <button
            onClick={handleDismiss}
            className="w-full rounded-lg border border-[#e5e5e5] bg-white px-3 py-2 text-sm text-[#6b7280] transition-colors hover:bg-[rgba(0,0,0,0.02)]"
          >
            No, just attach it
          </button>
        </div>
      </div>
    </AIMessage>
  );
}

// ─── Collapsible user message (long text or system instructions) ─────────────

const USER_COLLAPSE_THRESHOLD = 200;
const USER_PREVIEW_LENGTH = 150;

type UserMsg = Extract<ChatMessage, { type: "user" }>;

function CollapsibleUserMessage({ message }: { message: UserMsg }) {
  const [expanded, setExpanded] = useState(false);
  const isSystem = message.isSystem === true;

  return (
    <div className="flex flex-col items-end">
      <button
        className="max-w-[80%] min-w-0 cursor-pointer rounded-2xl rounded-br-sm bg-[#0a0a0a] px-3.5 py-2 text-left shadow-sm"
        onClick={() => setExpanded(e => !e)}
      >
        {expanded ? (
          <div className="flex items-start gap-2">
            <span className="min-w-0 flex-1 break-words text-sm leading-relaxed text-white">
              {message.content}
            </span>
            <ChevronUp size={14} className="mt-0.5 flex-shrink-0 text-zinc-400" />
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-sm text-zinc-400">
              {isSystem
                ? "System instructions"
                : `${message.content.slice(0, USER_PREVIEW_LENGTH)}…`}
            </span>
            <ChevronDown size={14} className="flex-shrink-0 text-zinc-400" />
          </div>
        )}
      </button>
    </div>
  );
}

// ─── ChatMessageView ──────────────────────────────────────────────────────────

export function ChatMessageView({
  message,
  onRetry,
  onPopulateInput,
  onConfirmImageIntent,
}: {
  message: ChatMessage;
  onRetry?: () => void;
  onPopulateInput?: (text: string) => void;
  onConfirmImageIntent?: (prompt: string, imageUrl: string) => void;
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
      if (message.isSystem || message.content.length > USER_COLLAPSE_THRESHOLD) {
        return <CollapsibleUserMessage message={message} />;
      }
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

    case "chat_response":
      return (
        <AIMessage>
          <div className="text-sm leading-relaxed text-[#374151] break-words">
            <MarkdownText text={message.content} />
            {message.streaming && (
              <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-[#F97316] align-middle" />
            )}
          </div>
          {!message.streaming && message.content && (
            <div className="mt-1.5 flex justify-end">
              <CopyButton content={message.content} />
            </div>
          )}
        </AIMessage>
      );

    case "image_intent":
      return (
        <ImageIntentCard
          message={message}
          onConfirm={onConfirmImageIntent}
        />
      );

    default:
      return null;
  }
}
