/**
 * Interactive plan step button (BEO-129).
 * Renders deferred items as clickable rows with animated status icons.
 */
import { ChevronRight } from "lucide-react";
import { PlanStepIcon } from "./PlanStepIcon";

export interface PlanStep {
  id: string;
  label: string;
  status: "pending" | "running" | "done";
}

interface PlanStepButtonProps {
  step: PlanStep;
  onClick: (step: PlanStep) => void;
  light?: boolean;
}

export function PlanStepButton({ step, onClick, light }: PlanStepButtonProps) {
  const isClickable = step.status !== "running";

  return (
    <button
      type="button"
      onClick={() => isClickable && onClick(step)}
      disabled={step.status === "running"}
      className={
        light
          ? "group flex w-full items-center gap-3 rounded-lg border border-[rgba(0,0,0,0.07)] bg-white px-4 py-3 text-left transition-colors hover:bg-[rgba(0,0,0,0.02)] disabled:cursor-default"
          : "group flex w-full items-center gap-3 rounded-lg border border-border bg-white/[0.02] px-4 py-3 text-left transition-colors hover:bg-[var(--color-surface-highlight)] disabled:cursor-default disabled:hover:bg-white/[0.02]"
      }
    >
      <PlanStepIcon status={step.status} />

      <span
        className={
          light
            ? step.status === "done"
              ? "flex-1 text-sm text-[rgba(0,0,0,0.6)]"
              : step.status === "running"
                ? "flex-1 text-sm font-medium text-[#1a1a1a]"
                : "flex-1 text-sm text-[rgba(0,0,0,0.4)]"
            : step.status === "done"
              ? "flex-1 text-sm text-white/70"
              : step.status === "running"
                ? "flex-1 text-sm font-medium text-white"
                : "flex-1 text-sm text-white/50"
        }
      >
        {step.label}
      </span>

      <ChevronRight
        size={14}
        className={light ? "text-[rgba(0,0,0,0)] transition-opacity duration-150 group-hover:text-[rgba(0,0,0,0.3)]" : "text-white/0 transition-opacity duration-150 group-hover:text-white/40"}
        aria-hidden
      />
    </button>
  );
}
