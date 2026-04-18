/**
 * BEO-391 — contextual follow-up chips after a successful build.
 */
import { useEffect, useState } from "react";
import { NEXT_STEPS_FALLBACK } from "../../lib/buildStatusCopy";

export interface NextStepsChip {
  label: string;
  prompt: string;
}

interface NextStepsCardProps {
  chips: NextStepsChip[] | undefined;
  /** When the summary block appeared — starts the 8s window before static fallback. */
  summaryAnchoredAt: number | null;
  onSelectPrompt: (prompt: string) => void;
}

export function NextStepsCard({ chips, summaryAnchoredAt, onSelectPrompt }: NextStepsCardProps) {
  const [showFallback, setShowFallback] = useState(false);

  useEffect(() => {
    if (!summaryAnchoredAt) {
      setShowFallback(false);
      return;
    }
    if (chips && chips.length > 0) {
      setShowFallback(false);
      return;
    }
    const t = window.setTimeout(() => setShowFallback(true), 8_000);
    return () => window.clearTimeout(t);
  }, [summaryAnchoredAt, chips]);

  const effective: NextStepsChip[] =
    chips && chips.length > 0 ? chips : showFallback ? [...NEXT_STEPS_FALLBACK] : [];

  if (effective.length === 0) return null;

  return (
    <div className="mt-3 transition-opacity duration-300">
      <p className="text-xs font-medium text-zinc-500">What next?</p>
      <div className="mt-2 flex flex-col gap-2">
        {effective.map((c, i) => (
          <button
            key={`${c.label}-${i}`}
            type="button"
            className="rounded-lg border border-[#e5e5e5] bg-white px-3 py-2 text-left text-sm text-[#374151] transition-colors hover:border-[#F97316]/40 hover:bg-[#faf9f6]"
            onClick={() => onSelectPrompt(c.prompt)}
          >
            → {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}
