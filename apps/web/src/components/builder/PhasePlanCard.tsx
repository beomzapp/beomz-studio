/**
 * PhasePlanCard — shows the phased build plan, tracks progress per phase,
 * and provides a CTA to continue to the next phase or skip remaining phases.
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
    <div className="mx-3 mb-3 overflow-hidden rounded-xl border border-[#e5e5e5] bg-white shadow-sm">
      {/* Header */}
      <div className="border-b border-[#f0eeeb] px-4 py-3">
        <p className="text-sm font-semibold text-[#1a1a1a]" style={{ fontFamily: "DM Sans, sans-serif" }}>
          Building in {phases.length} phases
        </p>
        <p className="mt-0.5 text-xs text-[#9ca3af]">
          I'll build each phase and check in with you.
        </p>
      </div>

      {/* Phase list */}
      <div className="divide-y divide-[#f5f3f0]">
        {phases.map((phase) => {
          const isCurrent = phase.index === currentPhase;
          const isCompleted = phase.index < currentPhase;
          const isPending = phase.index > currentPhase;
          const isExpanded = expandedPhase === phase.index;

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
                className="flex w-full items-start gap-3 px-4 py-3 text-left"
              >
                {/* Phase circle */}
                <div className="mt-0.5 flex-none">
                  {isCompleted ? (
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#22c55e]">
                      <Check size={12} className="text-white" />
                    </div>
                  ) : isCurrent ? (
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#F97316]">
                      <span className="text-[10px] font-bold text-white">{phase.index}</span>
                    </div>
                  ) : (
                    <div className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-[#d1d5db]">
                      <span className="text-[10px] font-medium text-[#9ca3af]">{phase.index}</span>
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <p className={cn(
                    "text-sm font-medium",
                    isCompleted && "text-[#374151]",
                    isCurrent && "text-[#1a1a1a]",
                    isPending && "text-[#6b7280]",
                  )} style={{ fontFamily: "DM Sans, sans-serif" }}>
                    {phase.title}
                  </p>

                  {/* Focus pills — only on current phase */}
                  {isCurrent && phase.focus.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {phase.focus.map((f) => (
                        <span
                          key={f}
                          className="inline-block rounded-full bg-[#f3f4f6] px-2 py-0.5 text-[10px] font-medium text-[#6b7280]"
                        >
                          {f}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Description — shown when expanded */}
                  {isExpanded && (
                    <p className="mt-1.5 text-xs leading-relaxed text-[#9ca3af]">
                      {phase.description}
                    </p>
                  )}
                </div>

                {/* Right: status + expand chevron */}
                <div className="flex flex-none items-center gap-2">
                  {isCurrent && isBuilding ? (
                    <span className="flex items-center gap-1 text-[11px] font-medium text-[#F97316]">
                      <Loader size={12} className="animate-spin" />
                      Building...
                    </span>
                  ) : isCurrent && !isBuilding ? (
                    <span className="text-[11px] font-medium text-[#F97316]">
                      Ready
                    </span>
                  ) : isCompleted ? (
                    <span className="flex items-center gap-1 text-[11px] font-medium text-[#22c55e]">
                      <Check size={11} />
                      Complete
                    </span>
                  ) : (
                    <span className="h-1.5 w-1.5 rounded-full bg-[#d1d5db]" />
                  )}
                  {isExpanded ? (
                    <ChevronDown size={14} className="text-[#9ca3af]" />
                  ) : (
                    <ChevronRight size={14} className="text-[#d1d5db]" />
                  )}
                </div>
              </button>
            </div>
          );
        })}
      </div>

      {/* Footer CTA area */}
      <div className="border-t border-[#f0eeeb] px-4 py-3">
        {allComplete ? (
          <div className="text-center">
            <p className="text-sm font-semibold text-[#22c55e]">
              All {phases.length} phases complete
            </p>
            <p className="mt-0.5 text-xs text-[#9ca3af]">
              Your app is fully built.
            </p>
          </div>
        ) : showContinue && nextPhase ? (
          <>
            <button
              onClick={onContinue}
              className="w-full rounded-lg bg-[#F97316] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#ea6c0e] active:bg-[#d95f0a]"
              style={{ fontFamily: "DM Sans, sans-serif" }}
            >
              Continue to Phase {nextPhase.index}
            </button>
            <p className="mt-2 text-center text-xs text-[#9ca3af]">
              {nextPhase.title} — {nextPhase.description}
            </p>
            <button
              onClick={onSkip}
              className="mt-2 w-full text-center text-[11px] text-[#9ca3af] transition-colors hover:text-[#6b7280]"
            >
              I'm done — skip remaining phases
            </button>
          </>
        ) : isBuilding ? (
          <div className="flex items-center justify-center gap-2 py-1">
            <Loader size={14} className="animate-spin text-[#F97316]" />
            <span className="text-xs font-medium text-[#6b7280]">
              Building phase {currentPhase} of {phases.length}...
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
