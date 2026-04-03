import { useState, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { cn } from "../../../lib/cn";

const DREAM_STEPS = [
  {
    lbl: "what are we making",
    q: "What do you want to build?",
    choices: [
      { e: "🎮", l: "A game", s: "fun to play" },
      { e: "📱", l: "An app", s: "useful tool" },
      { e: "🌐", l: "A website", s: "share something" },
      { e: "🤖", l: "A bot", s: "automates stuff" },
    ],
  },
  {
    lbl: "who is it for",
    q: "Who's going to use it?",
    choices: [
      { e: "👦", l: "Just me", s: "personal" },
      { e: "👫", l: "Me & friends", s: "share it" },
      { e: "🏫", l: "School", s: "impress teacher" },
      { e: "🌍", l: "Everyone!", s: "publish live" },
    ],
  },
  {
    lbl: "the vibe",
    q: "How should it look?",
    choices: [
      { e: "🌈", l: "Bright & fun", s: "bold colours" },
      { e: "🖤", l: "Sleek & dark", s: "minimal" },
      { e: "🌸", l: "Soft & cute", s: "pastel" },
      { e: "💥", l: "Wild & bold", s: "go all out" },
    ],
  },
  {
    lbl: "must-have",
    q: "The ONE thing it must have?",
    choices: [
      { e: "🏆", l: "Scoreboard", s: "track winners" },
      { e: "👤", l: "User login", s: "who is who" },
      { e: "💬", l: "Comments", s: "let people talk" },
      { e: "🎁", l: "Surprise me", s: "beomz decides" },
    ],
  },
  {
    lbl: "one extra",
    q: "One bonus thing?",
    choices: [
      { e: "🔊", l: "Sound effects", s: "audio" },
      { e: "🌙", l: "Dark mode", s: "easy on eyes" },
      { e: "📊", l: "Stats", s: "show data" },
      { e: "⚡", l: "Super fast", s: "optimised" },
    ],
  },
];

const BUBBLE_STYLES = [
  { pos: "top-8 left-8", bg: "#fff4ee", text: "#e8580a" },
  { pos: "top-8 right-8", bg: "#f0f7ff", text: "#388bfd" },
  { pos: "bottom-28 left-8", bg: "#f0fff6", text: "#2db870" },
  { pos: "bottom-28 right-8", bg: "#fdf4ff", text: "#a855f7" },
  { pos: "bottom-28 left-1/2 -translate-x-1/2", bg: "#fffbf0", text: "#d97706" },
];

interface DreamItScreenProps {
  onBack: () => void;
}

export function DreamItScreen({ onBack }: DreamItScreenProps) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<(number | null)[]>(
    Array(DREAM_STEPS.length).fill(null)
  );
  const [ready, setReady] = useState(false);
  const navigate = useNavigate();

  const current = DREAM_STEPS[step];
  const isLastStep = step === DREAM_STEPS.length - 1;

  const pickAnswer = useCallback(
    (choiceIdx: number) => {
      setAnswers((prev) => {
        const next = [...prev];
        next[step] = choiceIdx;
        return next;
      });
      // Auto-advance after 500ms
      setTimeout(() => {
        if (step < DREAM_STEPS.length - 1) {
          setStep((s) => s + 1);
        } else {
          setReady(true);
        }
      }, 500);
    },
    [step]
  );

  const goBack = useCallback(() => {
    if (step > 0) setStep((s) => s - 1);
    else onBack();
  }, [step, onBack]);

  const skip = useCallback(() => {
    if (isLastStep) setReady(true);
    else setStep((s) => s + 1);
  }, [isLastStep]);

  const goNext = useCallback(() => {
    if (answers[step] === null) return;
    if (isLastStep) setReady(true);
    else setStep((s) => s + 1);
  }, [step, answers, isLastStep]);

  if (ready) {
    return (
      <div className="fixed inset-0 z-30 flex flex-col items-center justify-center bg-[#faf9f6]">
        {/* Top bar */}
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-6 py-4">
          <div className="text-lg font-bold text-[#1a1a1a]">
            beomz<span className="text-[#e8580a]">.</span>
          </div>
        </div>

        <div className="animate-bounce text-6xl">🚀</div>
        <h2 className="mt-6 text-2xl font-bold text-[#1a1a1a]">
          Your plan is ready.
        </h2>

        {/* Picks as pills */}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {answers.map((a, i) =>
            a !== null ? (
              <span
                key={i}
                className="rounded-full border border-[rgba(0,0,0,0.07)] bg-white px-3 py-1 text-sm text-[#1a1a1a]"
              >
                {DREAM_STEPS[i].choices[a].e} {DREAM_STEPS[i].choices[a].l}
              </span>
            ) : null
          )}
        </div>

        <button
          onClick={() => navigate({ to: "/studio/home" })}
          className="mt-8 rounded-xl bg-[#e8580a] px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#d14e09]"
        >
          ✨ Start building
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-[#faf9f6]">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4">
        <div className="text-lg font-bold text-[#1a1a1a]">
          beomz<span className="text-[#e8580a]">.</span>
        </div>
        <span className="rounded-full border border-[#e8580a]/30 bg-[#e8580a]/5 px-3 py-1 text-xs font-medium text-[#e8580a]">
          ✦ dream it
        </span>
      </div>

      {/* Progress dots */}
      <div className="flex justify-center gap-2 py-2">
        {DREAM_STEPS.map((_, i) => (
          <div
            key={i}
            className={cn(
              "rounded-full transition-all duration-300",
              i === step
                ? "h-2.5 w-2.5 bg-[#e8580a]"
                : i < step && answers[i] !== null
                  ? "h-2.5 w-5 bg-[#e8580a]"
                  : "h-2 w-2 bg-[rgba(0,0,0,0.15)]"
            )}
          />
        ))}
      </div>

      {/* Previous answers pills */}
      {step > 0 && (
        <div className="flex flex-wrap justify-center gap-2 px-6 py-2">
          {answers.slice(0, step).map((a, i) =>
            a !== null ? (
              <span
                key={i}
                className="rounded-full bg-[rgba(0,0,0,0.05)] px-3 py-1 text-xs text-[rgba(0,0,0,0.35)]"
              >
                {DREAM_STEPS[i].choices[a].e} {DREAM_STEPS[i].choices[a].l}
              </span>
            ) : null
          )}
        </div>
      )}

      {/* Thought bubbles */}
      {answers.map((a, i) =>
        a !== null && i < step ? (
          <div
            key={`bubble-${i}`}
            className={cn(
              "pointer-events-none absolute z-10 hidden lg:block",
              BUBBLE_STYLES[i].pos
            )}
            style={{ animation: "bubblePop 0.4s cubic-bezier(0.34,1.56,0.64,1) forwards" }}
          >
            <div
              className="relative rounded-2xl px-4 py-2.5 text-sm font-medium shadow-sm"
              style={{ backgroundColor: BUBBLE_STYLES[i].bg, color: BUBBLE_STYLES[i].text }}
            >
              {DREAM_STEPS[i].choices[a].e} {DREAM_STEPS[i].choices[a].l}
              {/* Tail dots */}
              <div
                className="absolute -bottom-2 left-4 h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: BUBBLE_STYLES[i].bg }}
              />
              <div
                className="absolute -bottom-4 left-2 h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: BUBBLE_STYLES[i].bg }}
              />
            </div>
          </div>
        ) : null
      )}

      {/* Main content */}
      <div className="flex flex-1 flex-col items-center justify-center px-6">
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-[rgba(0,0,0,0.35)]">
          {current.lbl}
        </p>
        <h2 className="mb-8 text-center text-2xl font-bold text-[#1a1a1a] sm:text-3xl">
          {current.q}
        </h2>

        {/* Choice cards */}
        <div className="grid w-full max-w-xl grid-cols-2 gap-4 sm:grid-cols-4">
          {current.choices.map((c, ci) => {
            const selected = answers[step] === ci;
            return (
              <button
                key={ci}
                onClick={() => pickAnswer(ci)}
                className={cn(
                  "relative flex flex-col items-center rounded-[20px] border p-5 transition-all duration-200",
                  selected
                    ? "border-[#e8580a] bg-[#e8580a]/5"
                    : "border-[rgba(0,0,0,0.07)] bg-white hover:border-[rgba(0,0,0,0.15)] hover:shadow-sm"
                )}
              >
                {selected && (
                  <div className="absolute top-2 right-2 flex h-5 w-5 items-center justify-center rounded-full bg-[#e8580a]">
                    <Check size={12} className="text-white" />
                  </div>
                )}
                <span className="text-3xl">{c.e}</span>
                <span className="mt-2 text-sm font-semibold text-[#1a1a1a]">
                  {c.l}
                </span>
                <span className="mt-0.5 text-xs text-[rgba(0,0,0,0.35)]">
                  {c.s}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Bottom bar */}
      <div className="flex items-center justify-between border-t border-[rgba(0,0,0,0.07)] px-6 py-4">
        <button
          onClick={goBack}
          className="flex items-center gap-1.5 text-sm text-[rgba(0,0,0,0.35)] transition-colors hover:text-[#1a1a1a]"
        >
          <ArrowLeft size={14} />
          back
        </button>
        <button
          onClick={skip}
          className="text-sm text-[rgba(0,0,0,0.35)] transition-colors hover:text-[#1a1a1a]"
        >
          skip
        </button>
        <button
          onClick={goNext}
          disabled={answers[step] === null}
          className={cn(
            "flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold transition-all",
            answers[step] !== null
              ? "bg-[#e8580a] text-white hover:bg-[#d14e09]"
              : "bg-[rgba(0,0,0,0.05)] text-[rgba(0,0,0,0.2)] cursor-not-allowed"
          )}
        >
          {isLastStep ? "✨ build it!" : "next"}
          {!isLastStep && <ArrowRight size={14} />}
        </button>
      </div>

      {/* Inline keyframes for bubble animation */}
      <style>{`
        @keyframes bubblePop {
          from { opacity: 0; transform: scale(0); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
