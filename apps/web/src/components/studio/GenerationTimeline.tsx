import { CheckCircle, Circle, Loader2, XCircle } from "lucide-react";
import { ContinuationCard } from "./ContinuationCard";

export interface TimelineStep {
  label: string;
  status: "pending" | "running" | "done" | "error";
}

interface GenerationTimelineProps {
  steps: TimelineStep[];
  isComplete: boolean;
  deferredItems: string[];
  originalPrompt: string;
  phase: number;
  completedItems: string[];
  onImplement: (prompt: string) => void;
}

const STATUS_ICON = {
  pending: <Circle size={16} className="text-white/20" />,
  running: <Loader2 size={16} className="animate-spin text-orange" />,
  done: <CheckCircle size={16} className="text-green-400" />,
  error: <XCircle size={16} className="text-red-400" />,
} as const;

export function GenerationTimeline({
  steps,
  isComplete,
  deferredItems,
  originalPrompt,
  phase,
  completedItems,
  onImplement,
}: GenerationTimelineProps) {
  return (
    <div className="p-6">
      <ul className="space-y-3">
        {steps.map((step, i) => (
          <li key={i} className="flex items-center gap-3">
            {STATUS_ICON[step.status]}
            <span
              className={
                step.status === "done"
                  ? "text-sm text-white/70"
                  : step.status === "running"
                    ? "text-sm font-medium text-white"
                    : step.status === "error"
                      ? "text-sm text-red-400"
                      : "text-sm text-white/30"
              }
            >
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
        />
      )}
    </div>
  );
}
