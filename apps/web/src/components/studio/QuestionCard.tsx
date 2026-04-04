import type { ClarifyQuestion } from "@beomz-studio/contracts";

interface QuestionCardProps {
  onSelect: (answer: string) => void;
  question: ClarifyQuestion;
  revealed: boolean;
  selected: string | null;
}

export function QuestionCard({
  onSelect,
  question,
  revealed,
  selected,
}: QuestionCardProps) {
  if (!revealed) return null;

  return (
    <div className="rounded-3xl border border-[rgba(255,255,255,0.08)] bg-[#0d0d1a] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.25)]">
      <p className="text-base font-semibold text-white">{question.text}</p>
      <div className="mt-4 space-y-3">
        {question.options.map((option) => {
          const isSelected = selected === option.label;
          return (
            <button
              key={option.label}
              type="button"
              onClick={() => onSelect(option.label)}
              className={
                isSelected
                  ? "w-full rounded-2xl border border-[#F97316] bg-[rgba(249,115,22,0.12)] px-4 py-3 text-left text-white transition-colors"
                  : "w-full rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] px-4 py-3 text-left text-white/88 transition-colors hover:border-[rgba(249,115,22,0.45)] hover:bg-[rgba(249,115,22,0.06)]"
              }
            >
              <span className="block text-sm font-medium">{option.label}</span>
              {option.hint && (
                <span className="mt-1 block text-xs leading-5 text-white/50">
                  {option.hint}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
