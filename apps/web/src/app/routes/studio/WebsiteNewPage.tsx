/**
 * WebsiteNewPage — BEO-664
 * Guided brief onboarding flow for the Websites module.
 * Step 1: Site type picker (6 cards 3×2)
 * Step 2: 3 sequential questions with typewriter effect
 * Step 3: Animated generate → save launch intent → navigate to builder
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Globe,
  Briefcase,
  UtensilsCrossed,
  ShoppingBag,
  Building2,
  BookOpen,
  ArrowLeft,
  ChevronRight,
} from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { cn } from "../../../lib/cn";
import { saveProjectLaunchIntent } from "../../../lib/projectLaunchIntent";

// ─── Types ───────────────────────────────────────────────────────────────────

type SiteType = "landing" | "portfolio" | "restaurant" | "ecommerce" | "agency" | "blog";
type Vibe = "Minimal" | "Bold" | "Playful" | "Luxury" | "Corporate";
type Step = 1 | 2 | 3;

// ─── Config ──────────────────────────────────────────────────────────────────

const SITE_TYPES: { id: SiteType; label: string; icon: React.ReactNode }[] = [
  { id: "landing", label: "Landing Page", icon: <Globe size={28} /> },
  { id: "portfolio", label: "Portfolio", icon: <Briefcase size={28} /> },
  { id: "restaurant", label: "Restaurant / Café", icon: <UtensilsCrossed size={28} /> },
  { id: "ecommerce", label: "E-commerce", icon: <ShoppingBag size={28} /> },
  { id: "agency", label: "Agency", icon: <Building2 size={28} /> },
  { id: "blog", label: "Blog", icon: <BookOpen size={28} /> },
];

const SITE_TYPE_LABELS: Record<SiteType, string> = {
  landing: "landing page",
  portfolio: "portfolio",
  restaurant: "restaurant",
  ecommerce: "e-commerce",
  agency: "agency",
  blog: "blog",
};

const VIBES: Vibe[] = ["Minimal", "Bold", "Playful", "Luxury", "Corporate"];

// ─── Typewriter hook ─────────────────────────────────────────────────────────

function useTypewriter(text: string, speed = 28): string {
  const [displayed, setDisplayed] = useState("");
  const prevText = useRef("");

  useEffect(() => {
    // Reset when the question changes
    if (prevText.current !== text) {
      prevText.current = text;
      setDisplayed("");
    }

    let idx = 0;
    const interval = setInterval(() => {
      idx++;
      setDisplayed(text.slice(0, idx));
      if (idx >= text.length) clearInterval(interval);
    }, speed);
    return () => clearInterval(interval);
  }, [text, speed]);

  return displayed;
}

// ─── Animated dots component ─────────────────────────────────────────────────

function AnimatedDots() {
  const [count, setCount] = useState(1);
  useEffect(() => {
    const t = setInterval(() => setCount((c) => (c % 3) + 1), 500);
    return () => clearInterval(t);
  }, []);
  return <span>{".".repeat(count)}</span>;
}

// ─── Step 1: Site Type Picker ─────────────────────────────────────────────────

interface Step1Props {
  onSelect: (type: SiteType) => void;
  onDescribeDirect: (text: string) => void;
}

function Step1({ onSelect, onDescribeDirect }: Step1Props) {
  const [showDirectInput, setShowDirectInput] = useState(false);
  const [directText, setDirectText] = useState("");
  const directInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showDirectInput) {
      directInputRef.current?.focus();
    }
  }, [showDirectInput]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#faf9f6] px-6 py-16">
      <h1 className="mb-2 text-center text-3xl font-bold tracking-tight text-[#1a1a1a]">
        What are you building?
      </h1>
      <p className="mb-10 text-center text-[15px] text-[#9ca3af]">
        Choose the type of site you want to create
      </p>

      {/* 3×2 grid */}
      <div className="grid w-full max-w-2xl grid-cols-3 gap-4">
        {SITE_TYPES.map(({ id, label, icon }) => (
          <button
            key={id}
            onClick={() => onSelect(id)}
            className="group flex flex-col items-center justify-center gap-3 rounded-2xl border border-[#e5e5e5] bg-white px-4 py-8 text-center transition-all duration-150 hover:border-[#F97316]/40 hover:bg-orange-50/40 hover:shadow-sm active:scale-[0.97]"
          >
            <span className="text-[#6b7280] transition-colors group-hover:text-[#F97316]">
              {icon}
            </span>
            <span className="text-[14px] font-medium text-[#1a1a1a]">{label}</span>
          </button>
        ))}
      </div>

      {/* Escape hatch */}
      {!showDirectInput ? (
        <button
          onClick={() => setShowDirectInput(true)}
          className="mt-8 flex items-center gap-1 text-[13px] text-[#9ca3af] transition-colors hover:text-[#F97316]"
        >
          or describe your site directly
          <ChevronRight size={14} />
        </button>
      ) : (
        <div className="mt-8 flex w-full max-w-lg flex-col gap-3">
          <input
            ref={directInputRef}
            value={directText}
            onChange={(e) => setDirectText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && directText.trim()) {
                onDescribeDirect(directText.trim());
              }
            }}
            placeholder="e.g. A modern portfolio for a UX designer..."
            className="w-full rounded-xl border border-[#e5e5e5] bg-white px-4 py-3 text-[14px] text-[#1a1a1a] placeholder-[#9ca3af] outline-none transition-colors focus:border-[#F97316]/60 focus:ring-2 focus:ring-[#F97316]/10"
          />
          <button
            onClick={() => directText.trim() && onDescribeDirect(directText.trim())}
            disabled={!directText.trim()}
            className="self-end rounded-xl bg-[#F97316] px-5 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#EA580C] disabled:opacity-40"
          >
            Generate →
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Step 2: Sequential Questions ────────────────────────────────────────────

interface Step2Props {
  siteType: SiteType;
  onComplete: (name: string, description: string, vibe: Vibe) => void;
  onBack: () => void;
}

const QUESTIONS = [
  "What's your business or project name?",
  "Describe what you do in one sentence.",
  "Pick a vibe:",
] as const;

function Step2({ siteType: _siteType, onComplete, onBack }: Step2Props) {
  const [questionIdx, setQuestionIdx] = useState(0);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [vibe, setVibe] = useState<Vibe | null>(null);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  const currentQuestion = QUESTIONS[questionIdx];
  const typedQuestion = useTypewriter(currentQuestion ?? "", 30);

  useEffect(() => {
    // Focus input after typewriter finishes (slight delay)
    const t = setTimeout(() => {
      (inputRef.current as HTMLElement | null)?.focus();
    }, currentQuestion.length * 30 + 100);
    return () => clearTimeout(t);
  }, [questionIdx, currentQuestion]);

  const canAdvance =
    questionIdx === 0 ? name.trim().length > 0 :
    questionIdx === 1 ? description.trim().length > 0 :
    vibe !== null;

  const handleAdvance = useCallback(() => {
    if (!canAdvance) return;
    if (questionIdx < 2) {
      setQuestionIdx((i) => i + 1);
    } else {
      if (vibe) onComplete(name.trim(), description.trim(), vibe);
    }
  }, [canAdvance, questionIdx, vibe, name, description, onComplete]);

  const handleBack = useCallback(() => {
    if (questionIdx > 0) {
      setQuestionIdx((i) => i - 1);
    } else {
      onBack();
    }
  }, [questionIdx, onBack]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#faf9f6] px-6 py-16">
      {/* Progress dots */}
      <div className="mb-12 flex items-center gap-2.5">
        {QUESTIONS.map((_, i) => (
          <span
            key={i}
            className={cn(
              "h-2 w-2 rounded-full transition-all duration-300",
              i <= questionIdx ? "bg-[#F97316] scale-110" : "bg-[#d1d5db]",
            )}
          />
        ))}
      </div>

      {/* Question */}
      <div className="w-full max-w-lg">
        <h2 className="mb-8 text-[22px] font-semibold leading-snug text-[#1a1a1a] min-h-[2em]">
          {typedQuestion}
          {typedQuestion.length < currentQuestion.length && (
            <span className="animate-pulse text-[#F97316]">|</span>
          )}
        </h2>

        {/* Question 0: name */}
        {questionIdx === 0 && (
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdvance()}
            placeholder="e.g. Bloom Studio"
            className="w-full rounded-xl border border-[#e5e5e5] bg-white px-4 py-3.5 text-[15px] text-[#1a1a1a] placeholder-[#9ca3af] outline-none transition-colors focus:border-[#F97316]/60 focus:ring-2 focus:ring-[#F97316]/10"
          />
        )}

        {/* Question 1: description */}
        {questionIdx === 1 && (
          <textarea
            ref={inputRef as React.RefObject<HTMLTextAreaElement>}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleAdvance();
              }
            }}
            placeholder="e.g. We help brands grow through strategic content and social media"
            rows={3}
            className="w-full resize-none rounded-xl border border-[#e5e5e5] bg-white px-4 py-3.5 text-[15px] text-[#1a1a1a] placeholder-[#9ca3af] outline-none transition-colors focus:border-[#F97316]/60 focus:ring-2 focus:ring-[#F97316]/10"
          />
        )}

        {/* Question 2: vibe pills */}
        {questionIdx === 2 && (
          <div className="flex flex-wrap gap-3">
            {VIBES.map((v) => (
              <button
                key={v}
                onClick={() => setVibe(v)}
                className={cn(
                  "rounded-full border px-5 py-2 text-[14px] font-medium transition-all duration-150",
                  vibe === v
                    ? "border-[#F97316] bg-[#F97316] text-white shadow-sm"
                    : "border-[#e5e5e5] bg-white text-[#6b7280] hover:border-[#F97316]/40 hover:text-[#1a1a1a]",
                )}
              >
                {v}
              </button>
            ))}
          </div>
        )}

        {/* Navigation */}
        <div className="mt-8 flex items-center justify-between">
          <button
            onClick={handleBack}
            className="flex items-center gap-1.5 text-[13px] text-[#9ca3af] transition-colors hover:text-[#6b7280]"
          >
            <ArrowLeft size={14} />
            Back
          </button>
          <button
            onClick={handleAdvance}
            disabled={!canAdvance}
            className="rounded-xl bg-[#F97316] px-6 py-2.5 text-[14px] font-semibold text-white transition-colors hover:bg-[#EA580C] disabled:opacity-40"
          >
            {questionIdx < 2 ? "Continue" : "Generate →"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Step 3: Generate Loading ─────────────────────────────────────────────────

interface Step3Props {
  siteType: SiteType;
  name: string;
  description: string;
  vibe: Vibe;
  onDone: () => void;
}

function Step3({ siteType, name, description, vibe, onDone }: Step3Props) {
  useEffect(() => {
    const prompt = buildPrompt(siteType, name, description, vibe);
    saveProjectLaunchIntent({ prompt });

    // Brief moment to let the loading animation breathe before navigating
    const t = setTimeout(() => {
      onDone();
    }, 1600);
    return () => clearTimeout(t);
  }, [siteType, name, description, vibe, onDone]);

  const label = SITE_TYPE_LABELS[siteType];

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#faf9f6]">
      {/* Pulsing orange ring */}
      <div className="relative mb-8 flex h-20 w-20 items-center justify-center">
        <span className="absolute inset-0 animate-ping rounded-full bg-[#F97316]/20" />
        <span className="absolute inset-2 animate-ping rounded-full bg-[#F97316]/15 animation-delay-150" />
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#F97316]">
          <Globe size={28} className="text-white" />
        </span>
      </div>
      <p className="text-[18px] font-semibold text-[#1a1a1a]">
        Building your {label} site<AnimatedDots />
      </p>
      <p className="mt-2 text-[13px] text-[#9ca3af]">
        Assembling your brief and firing up the AI
      </p>
    </div>
  );
}

// ─── Prompt builder ───────────────────────────────────────────────────────────

function buildPrompt(
  siteType: SiteType,
  name: string,
  description: string,
  vibe: Vibe,
): string {
  const typeLabel = SITE_TYPE_LABELS[siteType];
  const vibeNotes: Record<Vibe, string> = {
    Minimal: "clean and minimal — generous whitespace, muted palette, simple typography",
    Bold: "bold and high-contrast — strong typography, punchy colors, impactful layout",
    Playful: "playful and energetic — fun colors, rounded shapes, light-hearted tone",
    Luxury: "luxury and premium — dark tones or rich neutrals, elegant serif fonts, refined spacing",
    Corporate: "corporate and professional — structured layout, trustworthy colors, formal tone",
  };

  return (
    `Build a ${typeLabel} website for "${name}". ` +
    `${description} ` +
    `Visual style: ${vibeNotes[vibe]}. ` +
    `Make it modern, responsive, and production-ready with clear sections, ` +
    `compelling copy, and a prominent call-to-action.`
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function WebsiteNewPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(1);
  const [siteType, setSiteType] = useState<SiteType | null>(null);
  const [collectedName, setCollectedName] = useState("");
  const [collectedDescription, setCollectedDescription] = useState("");
  const [collectedVibe, setCollectedVibe] = useState<Vibe | null>(null);

  const handleTypeSelect = useCallback((type: SiteType) => {
    setSiteType(type);
    setStep(2);
  }, []);

  const handleDescribeDirect = useCallback((text: string) => {
    saveProjectLaunchIntent({ prompt: text });
    void navigate({ to: "/studio/project/$id", params: { id: "new" } });
  }, [navigate]);

  const handleQuestionsComplete = useCallback(
    (name: string, description: string, vibe: Vibe) => {
      setCollectedName(name);
      setCollectedDescription(description);
      setCollectedVibe(vibe);
      setStep(3);
    },
    [],
  );

  const handleGenerateDone = useCallback(() => {
    void navigate({ to: "/studio/project/$id", params: { id: "new" } });
  }, [navigate]);

  if (step === 1) {
    return <Step1 onSelect={handleTypeSelect} onDescribeDirect={handleDescribeDirect} />;
  }

  if (step === 2 && siteType) {
    return (
      <Step2
        siteType={siteType}
        onComplete={handleQuestionsComplete}
        onBack={() => setStep(1)}
      />
    );
  }

  if (step === 3 && siteType && collectedVibe) {
    return (
      <Step3
        siteType={siteType}
        name={collectedName}
        description={collectedDescription}
        vibe={collectedVibe}
        onDone={handleGenerateDone}
      />
    );
  }

  return null;
}
