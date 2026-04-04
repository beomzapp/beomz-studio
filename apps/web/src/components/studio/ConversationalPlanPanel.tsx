import type { ClarifyQuestion, PlanPhase } from "@beomz-studio/contracts";

import type { EditablePlanStep } from "../../lib/planSteps";
import { QuestionCard } from "./QuestionCard";
import { StreamingBubble } from "./StreamingBubble";
import { TaskPlanEditor } from "./TaskPlanEditor";

interface ConversationalPlanPanelProps {
  answers: Record<string, string>;
  error?: string | null;
  intro: string;
  light?: boolean;
  onAnswer: (questionId: string, answer: string) => void;
  onApprove: () => void;
  onRevise: () => void;
  onStepsChange: (steps: EditablePlanStep[]) => void;
  phase: PlanPhase | "idle";
  questions: readonly ClarifyQuestion[];
  steps: EditablePlanStep[];
  streamingText: string;
  summary: string;
  visibleUpTo: number;
}

export function ConversationalPlanPanel({
  answers,
  error,
  intro,
  light,
  onAnswer,
  onApprove,
  onRevise,
  onStepsChange,
  phase,
  questions,
  steps,
  streamingText,
  summary,
  visibleUpTo,
}: ConversationalPlanPanelProps) {
  if (phase === "idle") return null;

  const answeredQuestions = questions.filter((question) => answers[question.id]);
  const isReady = phase === "ready" || phase === "approved";

  return (
    <div className="space-y-4">
      {phase === "streaming_intro" && (
        <StreamingBubble done={false} light={light} text={streamingText} />
      )}

      {(phase === "awaiting_answers" || phase === "streaming_summary" || isReady) && (
        <StreamingBubble done light={light} text={intro} />
      )}

      {phase === "awaiting_answers" && (
        <div className="space-y-4">
          {questions.map((question, index) => (
            <QuestionCard
              key={question.id}
              question={question}
              revealed={index <= visibleUpTo}
              selected={answers[question.id] ?? null}
              onSelect={(answer) => onAnswer(question.id, answer)}
            />
          ))}
        </div>
      )}

      {phase === "streaming_summary" && (
        <div className="space-y-4">
          <div
            className={
              light
                ? "rounded-3xl border border-[rgba(0,0,0,0.08)] bg-white p-5 shadow-sm"
                : "rounded-3xl border border-white/10 bg-white/[0.03] p-5"
            }
          >
            <p className={light ? "text-xs font-semibold uppercase tracking-[0.18em] text-[rgba(0,0,0,0.35)]" : "text-xs font-semibold uppercase tracking-[0.18em] text-white/35"}>
              Confirmed
            </p>
            <div className="mt-3 space-y-2">
              {answeredQuestions.map((question) => (
                <div
                  key={question.id}
                  className={light ? "rounded-2xl bg-[rgba(0,0,0,0.03)] px-4 py-3" : "rounded-2xl bg-black/20 px-4 py-3"}
                >
                  <p className={light ? "text-xs font-medium text-[rgba(0,0,0,0.45)]" : "text-xs font-medium text-white/40"}>
                    {question.text}
                  </p>
                  <p className={light ? "mt-1 text-sm font-semibold text-[#1a1a1a]" : "mt-1 text-sm font-semibold text-white"}>
                    {answers[question.id]}
                  </p>
                </div>
              ))}
            </div>
          </div>
          <StreamingBubble done={false} light={light} text={streamingText} />
        </div>
      )}

      {isReady && (
        <div className="space-y-4">
          <StreamingBubble done light={light} text={summary} />
          <TaskPlanEditor
            tasks={steps}
            onTasksChange={onStepsChange}
            showApproveButton={false}
            summary={summary}
          />
          <div
            className={
              light
                ? "sticky bottom-0 z-10 flex items-center justify-end gap-3 rounded-2xl border border-[rgba(0,0,0,0.08)] bg-[rgba(250,249,246,0.96)] px-4 py-3 backdrop-blur"
                : "sticky bottom-0 z-10 flex items-center justify-end gap-3 rounded-2xl border border-white/10 bg-[rgba(6,6,18,0.92)] px-4 py-3 backdrop-blur"
            }
          >
            <button
              type="button"
              onClick={onRevise}
              className={light ? "rounded-xl border border-[rgba(0,0,0,0.12)] px-4 py-2 text-sm font-medium text-[rgba(0,0,0,0.6)] transition-colors hover:border-[rgba(0,0,0,0.2)] hover:text-[#1a1a1a]" : "rounded-xl border border-white/15 px-4 py-2 text-sm font-medium text-white/70 transition-colors hover:border-white/30 hover:text-white"}
            >
              Revise
            </button>
            <button
              type="button"
              onClick={onApprove}
              className="rounded-xl bg-[#F97316] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#ea6a0c]"
            >
              Build this plan
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className={light ? "rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600" : "rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200"}>
          {error}
        </div>
      )}
    </div>
  );
}
