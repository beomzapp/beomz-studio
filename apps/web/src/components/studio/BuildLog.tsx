/**
 * Collapsible build activity feed (BEO-89).
 * Auto-scrolls to latest entry while streaming; pauses on manual scroll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AlignJustify } from "lucide-react";
import { LogEntry, type LogEntryData } from "./LogEntry";

interface BuildLogProps {
  entries: LogEntryData[];
  light?: boolean;
}

export function BuildLog({ entries, light }: BuildLogProps) {
  const [expanded, setExpanded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const userScrolledUp = useRef(false);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    // If user is within 40px of bottom, auto-scroll is still active
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    userScrolledUp.current = !atBottom;
  }, []);

  useEffect(() => {
    if (userScrolledUp.current || !scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [entries.length]);

  return (
    <div className={light ? "border-t border-[rgba(0,0,0,0.07)]" : "border-t border-border"}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className={
          light
            ? "flex w-full items-center gap-2 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-[rgba(0,0,0,0.3)] transition-colors hover:text-[rgba(0,0,0,0.5)]"
            : "flex w-full items-center gap-2 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-white/30 transition-colors hover:text-white/50"
        }
      >
        <AlignJustify size={12} />
        Log
        {entries.length > 0 && (
          <span className={light ? "ml-1 text-[rgba(0,0,0,0.2)]" : "ml-1 text-white/20"}>
            · {entries.length} action{entries.length !== 1 ? "s" : ""}
          </span>
        )}
      </button>

      {expanded && (
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className={light ? "max-h-[40vh] overflow-y-auto border-t border-[rgba(0,0,0,0.07)]" : "max-h-[40vh] overflow-y-auto border-t border-border"}
        >
          {entries.length === 0 ? (
            <p className={light ? "px-4 py-6 text-center text-xs text-[rgba(0,0,0,0.2)]" : "px-4 py-6 text-center text-xs text-white/20"}>
              No activity yet — start a generation
            </p>
          ) : (
            <div className={light ? "divide-y divide-[rgba(0,0,0,0.07)]" : "divide-y divide-border"}>
              {entries.map((entry) => (
                <LogEntry key={entry.id} entry={entry} light={light} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
