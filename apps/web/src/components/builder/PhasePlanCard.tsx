/**
 * PhasePlanCard — shows the phased build plan, tracks progress per phase,
 * and provides a CTA to continue to the next phase or skip remaining phases.
 * Designed for ~280px sidebar width. All content must fit without overflow.
 */
import { useState } from "react";
import { Check, ChevronDown, ChevronRight, Loader } from "lucide-react";
import { cn } from "../../lib/cn";

export interface Phase {
  index: number;
  title: string;
  description: string;
  focus: string[];
}

interface PhasePlanCardProps {
  phases: Phase[];
  currentPhase: number;
  isBuilding: boolean;
  onContinue: () => void;
  onSkip: () => void;
}

const MAX_VISIBLE_PILLS = 3;

// BEO-316: distinct colour per phase item (cycles if >5 phases)
const PHASE_DOT_COLOURS = [
  "bg-[#F97316]", // orange
  "bg-[#3b82f6]", // blue
  "bg-[#22c55e]", // green
  "bg-[#a855f7]", // purple
  "bg-[#eab308]", // yellow/amber
];

export function PhasePlanCard({
  phases,
  currentPhase,
  isBuilding,
  onContinue,
  onSkip,
}: PhasePlanCardProps) {
  const [expandedPhase, setExpandedPhase] = useState<number | null>(null);
  const allComplete = currentPhase >= phases.length && !isBuilding;
  const nextPhase = phases.find((p) => p.index === currentPhase + 1);
  const showContinue = !isBuilding && currentPhase < phases.length;

  return (
    <div className="mx-2 mb-2 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
        <div>
          <p className="text-[13px] font-semibold text-zinc-900" style={{ fontFamily: "DM Sans, sans-serif" }}>
            Build plan
          </p>
          <p className="mt-0.5 text-[11px] text-zinc-500">
            I'll build each phase and check in with you.
          </p>
        </div>
        <span className="flex-none rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-500">
          {phases.length} phases
        </span>
      </div>

      {/* Phase list */}
      <div className="divide-y divide-zinc-100">
        {phases.map((phase) => {
          const isCompleted = phase.index < currentPhase || (phase.index === currentPhase && !isBuilding);
          const isCurrent = phase.index === currentPhase && isBuilding;
          const isPending = !isCompleted && !isCurrent;
          const isExpanded = expandedPhase === phase.index;
          const visibleFocus = phase.focus.slice(0, MAX_VISIBLE_PILLS);
          const hiddenCount = phase.focus.length - MAX_VISIBLE_PILLS;
          const dotColor = PHASE_DOT_COLOURS[(phase.index - 1) % PHASE_DOT_COLOURS.length];

          return (
            <div
              key={phase.index}
              className={cn(
                "relative transition-all duration-200",
                isCurrent && "border-l-2 border-l-[#F97316] bg-orange-50/40",
                isPending && "opacity-60",
              )}
            >
              <button
                onClick={() => setExpandedPhase(isExpanded ? null : phase.index)}
                className="w-full px-3 py-2.5 text-left"
              >
                {/* Top row: coloured dot + title + status */}
                <div className="flex items-center gap-2.5">
                  {/* Coloured dot / check — compact 12px marker */}
                  <div className="flex h-3 w-3 min-w-[12px] flex-none items-center justify-center">
                    {isCompleted ? (
                      <div className="flex h-3 w-3 items-center justify-center rounded-full bg-[#22c55e]">
                        <Check size={8} className="text-white" strokeWidth={3} />
                      </div>
                    ) : (
                      <span className={cn("h-2.5 w-2.5 rounded-full", dotColor)} />
                    )}
                  </div>

                  {/* Title — truncates, takes remaining space */}
                  <p className={cn(
                    "min-w-0 flex-1 truncate text-[13px] font-medium",
                    isCompleted && "text-[#374151]",
                    isCurrent && "text-[#1a1a1a]",
                    isPending && "text-[#6b7280]",
                  )} style={{ fontFamily: "DM Sans, sans-serif" }}>
                    {phase.title}
                  </p>

                  {/* Status badge + chevron — right side, flex-none */}
                  <div className="flex flex-none items-center gap-1.5">
                    {isCurrent && isBuilding ? (
                      <span className="flex items-center gap-1 text-[10px] font-medium text-[#F97316]">
                        <Loader size={10} className="animate-spin" />
                        Building
                      </span>
                    ) : isCurrent && !isBuilding ? (
                      <span className="text-[10px] font-medium text-[#F97316]">Ready</span>
                    ) : isCompleted ? (
                      <Check size={12} className="text-[#22c55e]" />
                    ) : (
                      <span className="h-1.5 w-1.5 rounded-full bg-[#d1d5db]" />
                    )}
                    {isExpanded ? (
                      <ChevronDown size={12} className="text-[#9ca3af]" />
                    ) : (
                      <ChevronRight size={12} className="text-[#d1d5db]" />
                    )}
                  </div>
                </div>

                {/* Focus pills — below title, indented to align with title text */}
                {isCurrent && visibleFocus.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1 pl-[22px]">
                    {visibleFocus.map((f) => (
                      <span
                        key={f}
                        className="max-w-[120px] truncate rounded-full bg-[#f3f4f6] px-1.5 py-px text-[10px] font-medium text-[#6b7280]"
                      >
                        {f}
                      </span>
                    ))}
                    {hiddenCount > 0 && (
                      <span className="rounded-full bg-[#f3f4f6] px-1.5 py-px text-[10px] font-medium text-[#9ca3af]">
                        +{hiddenCount}
                      </span>
                    )}
                  </div>
                )}

                {/* Description — shown when expanded, 2-line clamp, indented */}
                {isExpanded && (
                  <p className="mt-1.5 line-clamp-2 break-words pl-[22px] text-[11px] leading-relaxed text-zinc-500">
                    {phase.description}
                  </p>
                )}
              </button>
            </div>
          );
        })}
      </div>

      {/* Footer CTA area */}
      <div className="border-t border-zinc-100 px-3 py-2.5">
        {allComplete ? (
          <div className="text-center">
            <p className="text-[13px] font-semibold text-[#22c55e]">
              All {phases.length} phases complete
            </p>
            <p className="mt-0.5 text-[11px] text-[#9ca3af]">
              Your app is fully built.
            </p>
          </div>
        ) : isBuilding ? (
          <div className="flex items-center justify-center gap-1.5 py-0.5">
            <Loader size={12} className="animate-spin text-[#F97316]" />
            <span className="text-[11px] font-medium text-[#6b7280]">
              Building phase {currentPhase} of {phases.length}...
            </span>
          </div>
        ) : showContinue && nextPhase ? (
          <>
            <button
              onClick={onContinue}
              className="w-full rounded-lg bg-[#F97316] px-3 py-2 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-[#ea6c0e] active:bg-[#d95f0a]"
              style={{ fontFamily: "DM Sans, sans-serif" }}
            >
              Continue to Phase {nextPhase.index}
            </button>
            <p className="mt-1.5 line-clamp-2 break-words text-center text-[11px] text-[#9ca3af]">
              {nextPhase.title} — {nextPhase.description}
            </p>
            <button
              onClick={onSkip}
              className="mt-1.5 w-full text-center text-[10px] text-[#9ca3af] transition-colors hover:text-[#6b7280]"
            >
              I'm done — skip remaining phases
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
