/**
 * QuestionsCard — Lovable-style clarifying questions (BEO-68).
 * One question at a time, radio/checkbox, review screen, submit.
 */
import { useCallback, useState } from "react";
import { ChevronLeft, ChevronRight, Send } from "lucide-react";
import { cn } from "../../lib/cn";
import type { ClarifyQuestion } from "../../lib/planClarify";

interface QuestionsCardProps {
  questions: ClarifyQuestion[];
  onSubmit: (answers: Record<string, string[]>) => void;
  onSkipAll: () => void;
}

export function QuestionsCard({
  questions,
  onSubmit,
  onSkipAll,
}: QuestionsCardProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [otherText, setOtherText] = useState<Record<string, string>>({});

  const isReview = currentIndex >= questions.length;
  const isLast = currentIndex === questions.length - 1;
  const current = questions[currentIndex];

  const getAnswer = useCallback(
    (qId: string): string[] => answers[qId] ?? [],
    [answers],
  );

  const toggleOption = useCallback(
    (qId: string, label: string, type: "single" | "multi") => {
      setAnswers((prev) => {
        const current = prev[qId] ?? [];
        if (type === "single") {
          return { ...prev, [qId]: [label] };
        }
        // Multi toggle
        return {
          ...prev,
          [qId]: current.includes(label)
            ? current.filter((l) => l !== label)
            : [...current, label],
        };
      });

      // Auto-advance on single select after a short delay
      if (type === "single") {
        setTimeout(() => {
          setCurrentIndex((i) => Math.min(i + 1, questions.length));
        }, 300);
      }
    },
    [questions.length],
  );

  const handleOtherChange = useCallback(
    (qId: string, text: string) => {
      setOtherText((prev) => ({ ...prev, [qId]: text }));
      if (text.trim()) {
        setAnswers((prev) => {
          const current = (prev[qId] ?? []).filter((a) => !a.startsWith("Other: "));
          return { ...prev, [qId]: [...current, `Other: ${text.trim()}`] };
        });
      } else {
        setAnswers((prev) => ({
          ...prev,
          [qId]: (prev[qId] ?? []).filter((a) => !a.startsWith("Other: ")),
        }));
      }
    },
    [],
  );

  const goBack = useCallback(() => {
    setCurrentIndex((i) => Math.max(0, i - 1));
  }, []);

  const goNext = useCallback(() => {
    setCurrentIndex((i) => Math.min(i + 1, questions.length));
  }, [questions.length]);

  const skip = useCallback(() => {
    setCurrentIndex((i) => Math.min(i + 1, questions.length));
  }, [questions.length]);

  const handleSubmit = useCallback(() => {
    // Build answer map keyed by question text
    const result: Record<string, string[]> = {};
    for (const q of questions) {
      const ans = answers[q.id];
      if (ans && ans.length > 0) {
        result[q.question] = ans;
      }
    }
    onSubmit(result);
  }, [questions, answers, onSubmit]);

  // Review screen
  if (isReview) {
    return (
      <div className="mx-auto w-full max-w-xl">
        <div className="rounded-2xl border border-[#e5e7eb] bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[#6b7280]">Review</h3>
            <span className="text-xs text-[#6b7280]">
              {questions.length} question{questions.length !== 1 ? "s" : ""}
            </span>
          </div>

          <div className="space-y-4">
            {questions.map((q) => {
              const ans = getAnswer(q.id);
              return (
                <div key={q.id}>
                  <p className="text-sm font-medium text-[#1a1a1a]">
                    {q.question}
                  </p>
                  {ans.length > 0 ? (
                    <ul className="mt-1 space-y-0.5">
                      {ans.map((a) => (
                        <li
                          key={a}
                          className="text-sm font-semibold text-[#1a1a1a]"
                        >
                          {a}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-xs italic text-[#6b7280]">
                      Skipped
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-6 flex items-center justify-between border-t border-[#e5e7eb] pt-4">
            <button
              onClick={goBack}
              className="flex items-center gap-1 text-xs font-medium text-[#6b7280] transition-colors hover:text-[#1a1a1a]"
            >
              <ChevronLeft size={14} />
              Edit answers
            </button>
            <button
              onClick={handleSubmit}
              className="flex items-center gap-2 rounded-xl bg-[#F97316] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#ea6c10]"
            >
              <Send size={14} />
              Submit
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Question view
  const selected = getAnswer(current.id);

  return (
    <div className="mx-auto w-full max-w-xl">
      <div className="rounded-2xl border border-[#e5e7eb] bg-white p-6 shadow-sm">
        {/* Header */}
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs font-medium text-[#6b7280]">Questions</span>
          <span className="text-xs text-[#6b7280]">
            {current.type === "single"
              ? "Select one answer"
              : "Select multiple answers"}
          </span>
        </div>

        {/* Question */}
        <h3 className="mb-4 text-base font-semibold text-[#1a1a1a]">
          {current.question}
        </h3>

        {/* Options */}
        <div className="space-y-2">
          {current.options.map((opt) => {
            const isSelected = selected.includes(opt.label);
            const isSingle = current.type === "single";

            return (
              <button
                key={opt.label}
                onClick={() => toggleOption(current.id, opt.label, current.type)}
                className={cn(
                  "flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left transition-all",
                  isSelected
                    ? "border-[#F97316]/40 bg-[rgba(249,115,22,0.06)]"
                    : "border-[#e5e7eb] bg-white hover:border-[rgba(0,0,0,0.15)] hover:bg-[rgba(0,0,0,0.01)]",
                )}
              >
                {/* Radio / Checkbox indicator */}
                <div className="mt-0.5 shrink-0">
                  {isSingle ? (
                    <div
                      className={cn(
                        "flex h-4 w-4 items-center justify-center rounded-full border-2 transition-colors",
                        isSelected
                          ? "border-[#F97316]"
                          : "border-[#d1d5db]",
                      )}
                    >
                      {isSelected && (
                        <div className="h-2 w-2 rounded-full bg-[#F97316]" />
                      )}
                    </div>
                  ) : (
                    <div
                      className={cn(
                        "flex h-4 w-4 items-center justify-center rounded border-2 transition-colors",
                        isSelected
                          ? "border-[#F97316] bg-[#F97316]"
                          : "border-[#d1d5db]",
                      )}
                    >
                      {isSelected && (
                        <svg viewBox="0 0 12 12" width={10} height={10}>
                          <path
                            d="M3 6l2 2 4-4"
                            fill="none"
                            stroke="white"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </div>
                  )}
                </div>

                {/* Label + description */}
                <div className="min-w-0 flex-1">
                  <span className="text-sm font-semibold text-[#1a1a1a]">
                    {opt.label}
                  </span>
                  {opt.description && (
                    <p className="mt-0.5 text-xs text-[#6b7280]">
                      {opt.description}
                    </p>
                  )}
                </div>
              </button>
            );
          })}

          {/* Other text field */}
          <div
            className={cn(
              "flex items-start gap-3 rounded-xl border px-4 py-3 transition-all",
              (otherText[current.id] ?? "").trim()
                ? "border-[#F97316]/40 bg-[rgba(249,115,22,0.06)]"
                : "border-[#e5e7eb]",
            )}
          >
            <div className="mt-0.5 shrink-0">
              {current.type === "single" ? (
                <div className="flex h-4 w-4 items-center justify-center rounded-full border-2 border-[#d1d5db]" />
              ) : (
                <div className="flex h-4 w-4 items-center justify-center rounded border-2 border-[#d1d5db]" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-sm font-semibold text-[#1a1a1a]">
                Other
              </span>
              <input
                type="text"
                value={otherText[current.id] ?? ""}
                onChange={(e) =>
                  handleOtherChange(current.id, e.target.value)
                }
                placeholder="Type your answer..."
                className="mt-1 w-full bg-transparent text-xs text-[#1a1a1a] outline-none placeholder:text-[#9ca3af]"
              />
            </div>
          </div>
        </div>

        {/* Bottom navigation */}
        <div className="mt-5 flex items-center justify-between border-t border-[#e5e7eb] pt-4">
          {/* Left: arrows */}
          <div className="flex items-center gap-1">
            <button
              onClick={goBack}
              disabled={currentIndex === 0}
              className="rounded-lg p-1.5 text-[#6b7280] transition-colors hover:bg-[rgba(0,0,0,0.04)] hover:text-[#1a1a1a] disabled:invisible"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={goNext}
              className="rounded-lg p-1.5 text-[#6b7280] transition-colors hover:bg-[rgba(0,0,0,0.04)] hover:text-[#1a1a1a]"
            >
              <ChevronRight size={16} />
            </button>
            <span className="ml-2 text-[10px] tabular-nums text-[#9ca3af]">
              {currentIndex + 1} / {questions.length}
            </span>
          </div>

          {/* Right: skip buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={skip}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-[#6b7280] transition-colors hover:bg-[rgba(0,0,0,0.04)] hover:text-[#1a1a1a]"
            >
              {isLast ? "Review" : "Skip"}
            </button>
            <button
              onClick={onSkipAll}
              className="rounded-lg border border-[#e5e7eb] px-3 py-1.5 text-xs font-medium text-[#6b7280] transition-colors hover:border-[rgba(0,0,0,0.2)] hover:text-[#1a1a1a]"
            >
              Skip all
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
