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
    <div className="mx-2 mb-2 overflow-hidden rounded-xl border border-[#e5e5e5] bg-white shadow-sm">
      {/* Header */}
      <div className="border-b border-[#f0eeeb] px-3 py-2.5">
        <p className="text-[13px] font-semibold text-[#1a1a1a]" style={{ fontFamily: "DM Sans, sans-serif" }}>
          Building in {phases.length} phases
        </p>
        <p className="mt-0.5 text-[11px] text-[#9ca3af]">
          I'll build each phase and check in with you.
        </p>
      </div>

      {/* Phase list */}
      <div className="divide-y divide-[#f5f3f0]">
        {phases.map((phase) => {
          const isCompleted = phase.index < currentPhase || (phase.index === currentPhase && !isBuilding);
          const isCurrent = phase.index === currentPhase && isBuilding;
          const isPending = !isCompleted && !isCurrent;
          const isExpanded = expandedPhase === phase.index;
          const visibleFocus = phase.focus.slice(0, MAX_VISIBLE_PILLS);
          const hiddenCount = phase.focus.length - MAX_VISIBLE_PILLS;

          return (
            <div
              key={phase.index}
              className={cn(
                "relative transition-all duration-200",
                isCompleted && "border-l-2 border-l-[#22c55e]",
                isCurrent && "border-l-2 border-l-[#F97316] bg-[#fffbf7]",
                isPending && "opacity-60",
              )}
            >
              <button
                onClick={() => setExpandedPhase(isExpanded ? null : phase.index)}
                className="w-full px-3 py-2.5 text-left"
              >
                {/* Top row: circle + title + status */}
                <div className="flex items-center gap-2">
                  {/* Phase circle — fixed 24px, never shrinks */}
                  <div className="h-6 w-6 min-w-[24px] flex-none">
                    {isCompleted ? (
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#22c55e]">
                        <Check size={12} className="text-white" />
                      </div>
                    ) : isCurrent ? (
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#F97316]">
                        <span className="text-[10px] font-bold text-white">{phase.index}</span>
                      </div>
                    ) : (
                      <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-[#d1d5db]">
                        <span className="text-[10px] font-medium text-[#9ca3af]">{phase.index}</span>
                      </div>
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
                  <div className="mt-1.5 flex flex-wrap gap-1 pl-8">
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
                  <p className="mt-1.5 line-clamp-2 break-words pl-8 text-[11px] leading-relaxed text-[#9ca3af]">
                    {phase.description}
                  </p>
                )}
              </button>
            </div>
          );
        })}
      </div>

      {/* Footer CTA area */}
      <div className="border-t border-[#f0eeeb] px-3 py-2.5">
        {allComplete ? (
          <div className="text-center">
            <p className="text-[13px] font-semibold text-[#22c55e]">
              All {phases.length} phases complete
            </p>
            <p className="mt-0.5 text-[11px] text-[#9ca3af]">
              Your app is fully built.
            </p>
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
        ) : isBuilding ? (
          <div className="flex items-center justify-center gap-1.5 py-0.5">
            <Loader size={12} className="animate-spin text-[#F97316]" />
            <span className="text-[11px] font-medium text-[#6b7280]">
              Building phase {currentPhase} of {phases.length}...
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
