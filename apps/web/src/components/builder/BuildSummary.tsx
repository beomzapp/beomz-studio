/**
 * BuildSummary — the "Done — I've built ..." completion message.
 *
 * Contract (BEO-725):
 *   - Rendered for `build_summary` messages.
 *   - TypewriterText runs the message body when `isNewMessage` is true; on a
 *     hard refresh the same text shows instantly via MarkdownText.
 *   - After TypewriterText.onDone fires (or immediately if !isNew), the
 *     summary footer (file list, duration, credits) and contextual chips
 *     fade in.
 *   - Chips are filtered through DB_CHIP_FILTER so we never offer database /
 *     persistence prompts on a fresh build.
 *   - Chip styling: 11px text, 0.5px border, 20px radius, 3px x 10px padding
 *     — this matches the spec's "pill style" requirement exactly.
 */
import { useCallback, useState } from "react";
import type { ChatMessage } from "@beomz-studio/contracts";
import { ChevronDown, ChevronRight, FileCode } from "lucide-react";
import { BAvatar } from "./Avatars";
import { CopyButton, MarkdownText } from "./MarkdownText";
import { TypewriterText } from "./TypewriterText";
import { NextStepsCard } from "./NextStepsCard";

type BuildSummaryMsg = Extract<ChatMessage, { type: "build_summary" }>;

const DB_CHIP_FILTER = /database|supabase|neon|postgres|persist/i;

function formatDuration(ms: number): string {
  if (ms >= 60000) {
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${m}m ${s}s`;
  }
  return `${Math.floor(ms / 1000)}s`;
}

function SummaryFooter({
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
  const showStats =
    typeof durationMs === "number" &&
    durationMs > 0 &&
    typeof creditsUsed === "number" &&
    creditsUsed > 0;

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
        {showStats && (
          <span>
            {formatDuration(durationMs!)} · {creditsUsed!.toFixed(2)} credits used
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

interface BuildSummaryProps {
  message: BuildSummaryMsg;
  isNewMessage: boolean;
  onPopulateInput?: (text: string) => void;
}

export function BuildSummary({ message, isNewMessage, onPopulateInput }: BuildSummaryProps) {
  const [summaryAnchoredAt] = useState(() => Date.now());
  const [typewriterDone, setTypewriterDone] = useState(!isNewMessage);
  const handleDone = useCallback(() => setTypewriterDone(true), []);

  const filteredNextSteps = message.nextSteps?.filter(c => !DB_CHIP_FILTER.test(c.label) && !DB_CHIP_FILTER.test(c.prompt));

  return (
    <div className="flex items-start gap-2">
      <BAvatar />
      <div className="min-w-0 flex-1 break-words">
        {isNewMessage && !typewriterDone ? (
          <TypewriterText text={message.content} onDone={handleDone} />
        ) : (
          <MarkdownText text={message.content} />
        )}
        {typewriterDone && (
          <>
            <SummaryFooter
              filesChanged={message.filesChanged}
              durationMs={message.durationMs}
              creditsUsed={message.creditsUsed}
              copyContent={message.content}
            />
            <NextStepsCard
              chips={filteredNextSteps}
              summaryAnchoredAt={summaryAnchoredAt}
              onSelectPrompt={prompt => onPopulateInput?.(prompt)}
            />
          </>
        )}
      </div>
    </div>
  );
}
