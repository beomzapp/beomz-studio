/**
 * ImplementBar — BEO-398.
 * Sticky zone pinned above the input bar. Never scrolls away.
 * Replaces the old implement_card chat message.
 */
import { X } from "lucide-react";

interface ImplementBarProps {
  summary: string;
  onImplement: () => void;
  onDismiss: () => void;
}

export function ImplementBar({ summary, onImplement, onDismiss }: ImplementBarProps) {
  return (
    <div className="relative mx-3 mb-2 rounded-xl border border-[#00D5D8]/30 bg-[#00D5D8]/5 px-3 py-2.5">
      {/* Dismiss button */}
      <button
        onClick={onDismiss}
        className="absolute right-2 top-2 rounded p-0.5 text-[#00D5D8]/60 transition-colors hover:bg-[#00D5D8]/10 hover:text-[#00D5D8]"
        title="Dismiss"
      >
        <X size={13} />
      </button>

      {/* Summary */}
      <p className="mb-2 line-clamp-2 pr-5 text-xs leading-relaxed text-[#6b7280]">
        {summary}
      </p>

      {/* Implement button */}
      <button
        onClick={onImplement}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#00D5D8] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#ea6c10] active:scale-[0.98]"
      >
        🚀 Implement this
      </button>
    </div>
  );
}
