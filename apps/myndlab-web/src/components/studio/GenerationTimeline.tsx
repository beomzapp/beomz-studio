import { ContinuationCard } from "./ContinuationCard";
import { PlanStepIcon } from "./PlanStepIcon";
import { ThinkingIndicator } from "./ThinkingIndicator";

export interface TimelineStep {
  label: string;
  status: "pending" | "running" | "done" | "error";
}

interface GenerationTimelineProps {
  steps: TimelineStep[];
  isComplete: boolean;
  isThinking: boolean;
  deferredItems: string[];
  originalPrompt: string;
  phase: number;
  completedItems: string[];
  onImplement: (prompt: string) => void;
  light?: boolean;
}

const LABEL_CLASS: Record<TimelineStep["status"], string> = {
  done: "text-sm text-white/70",
  running: "text-sm font-medium text-white",
  error: "text-sm text-red-400",
  pending: "text-sm text-white/30",
};

const LABEL_CLASS_LIGHT: Record<TimelineStep["status"], string> = {
  done: "text-sm text-[rgba(0,0,0,0.6)]",
  running: "text-sm font-medium text-[#1a1a1a]",
  error: "text-sm text-red-500",
  pending: "text-sm text-[rgba(0,0,0,0.25)]",
};

export function GenerationTimeline({
  steps,
  isComplete,
  isThinking,
  deferredItems,
  originalPrompt,
  phase,
  completedItems,
  onImplement,
  light,
}: GenerationTimelineProps) {
  const classes = light ? LABEL_CLASS_LIGHT : LABEL_CLASS;
  return (
    <div className="p-6">
      <ThinkingIndicator visible={isThinking} light={light} />

      <ul className="space-y-3">
        {steps.map((step, i) => (
          <li key={i} className="flex items-center gap-3">
            <PlanStepIcon status={step.status} />
            <span className={classes[step.status]}>
              {step.label}
            </span>
          </li>
        ))}
      </ul>

      {isComplete && deferredItems.length > 0 && (
        <ContinuationCard
          deferredItems={deferredItems}
          completedItems={completedItems}
          originalPrompt={originalPrompt}
          phase={phase}
          onImplement={onImplement}
          light={light}
        />
      )}
    </div>
  );
}
