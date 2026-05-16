/**
 * PhaseIndicator — shown at the top of ChatPanel when a multi-phase build is in progress.
 * Displays "Phase X of Y complete" with a simple progress bar.
 */
import { CheckCircle2 } from "lucide-react";

interface PhaseIndicatorProps {
  current: number;
  total: number;
  summary?: string;
}

export function PhaseIndicator({ current, total, summary }: PhaseIndicatorProps) {
  const progress = (current / total) * 100;

  return (
    <div className="border-b border-[#e5e5e5] bg-white px-4 py-2.5">
      <div className="flex items-center gap-2">
        <CheckCircle2 size={14} className="text-emerald-500" />
        <span className="text-xs font-medium text-[#374151]">
          Phase {current} of {total} complete
        </span>
      </div>
      {/* Progress bar */}
      <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-[#e5e5e5]">
        <div
          className="h-full rounded-full bg-[#F97316] transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
      {summary && (
        <p className="mt-1 text-[11px] text-[#9ca3af] truncate">{summary}</p>
      )}
    </div>
  );
}
