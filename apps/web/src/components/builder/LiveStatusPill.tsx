/**
 * LiveStatusPill — BEO-798
 *
 * Replaces the iteration shimmer in ChatPanel with a single-line live action
 * label driven by the SSE stream.  Renders alongside the B-avatar (consistent
 * with other inline assistant messages) but with NO card/badge/chip wrapper.
 *
 * Shimmer: left-to-right gradient pass over the text (~2s loop, low contrast).
 * The `.live-status-shimmer` keyframe is defined in index.css.
 *
 * Typography: 14px / leading-[1.55] / tracking-[-0.01em] — BEO-797 Body ladder.
 * Colour: #6b7280 (muted grey, matches text nearby in ChatPanel).
 */
import { BAvatar } from "./Avatars";

interface LiveStatusPillProps {
  currentAction?: string | null;
}

export function LiveStatusPill({ currentAction }: LiveStatusPillProps) {
  const text = currentAction ?? "Working\u2026";

  return (
    <div className="flex items-center gap-2 py-1">
      <BAvatar />
      <span className="live-status-shimmer min-w-0 text-[14px] leading-[1.55] tracking-[-0.01em]">
        {text}
      </span>
    </div>
  );
}
