/**
 * PlanCard — V1 plan summary card ported to V2.
 * Shows app summary with typewriter, then plan steps.
 * Light mode, cream bg.
 */
import { useState } from "react";
import { Rocket, Loader2 } from "lucide-react";
import { PlanTypewriter } from "./PlanTypewriter";
import type { PlanBullet } from "../../lib/planClarify";

interface PlanCardProps {
  appName: string;
  summary: string;
  steps: PlanBullet[];
  onBuild: () => void;
  isBuilding?: boolean;
}

export function PlanCard({
  appName,
  summary,
  steps,
  onBuild,
  isBuilding,
}: PlanCardProps) {
  const [summaryDone, setSummaryDone] = useState(false);

  return (
    <div className="mx-auto w-full max-w-xl">
      <div className="rounded-2xl border border-[#e5e7eb] bg-white p-6 shadow-sm">
        {/* Header */}
        <h3 className="mb-1 text-base font-semibold text-[#1a1a1a]">
          {appName}
        </h3>

        {/* Summary with typewriter */}
        <p className="mb-4 text-sm leading-relaxed text-[#6b7280]">
          <PlanTypewriter
            text={summary}
            speed={12}
            onComplete={() => setSummaryDone(true)}
          />
        </p>

        {/* Steps — fade in after summary */}
        {summaryDone && steps.length > 0 && (
          <div className="space-y-2 animate-[fadeIn_300ms_ease-out]">
            <p className="text-xs font-medium text-[#9ca3af]">Build plan</p>
            {steps.map((step, i) => (
              <div
                key={i}
                className="flex items-start gap-3 rounded-lg border border-[rgba(0,0,0,0.05)] bg-[rgba(0,0,0,0.01)] px-3 py-2"
              >
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#F97316]/10 text-[10px] font-bold text-[#F97316]">
                  {i + 1}
                </span>
                <div>
                  <span className="text-sm font-medium text-[#1a1a1a]">
                    {step.label}
                  </span>
                  {step.description && (
                    <p className="text-xs text-[#9ca3af]">
                      {step.description}
                    </p>
                  )}
                </div>
              </div>
            ))}

            {/* Build button */}
            <button
              onClick={onBuild}
              disabled={isBuilding}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[#F97316] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#ea6c10] disabled:opacity-60"
            >
              {isBuilding ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Rocket size={14} />
              )}
              {isBuilding ? "Building..." : "Start building"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
