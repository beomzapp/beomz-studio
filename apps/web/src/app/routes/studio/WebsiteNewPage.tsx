/**
 * WebsiteNewPage — BEO-664 / BEO-667
 * Guided brief onboarding flow for the Websites module.
 * Step 1: Site type picker (6 cards 3×2)
 * Step 2: 3 sequential questions with typewriter effect + Custom vibe input
 * Step 3: Color theme picker (8 swatches + Custom hex + Skip)
 * Step 4: Animated generate → save launch intent → navigate to builder
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
type VibeOption = "Minimal" | "Bold" | "Playful" | "Luxury" | "Corporate" | "Custom";
type Step = 1 | 2 | 3 | 4;

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

const VIBE_OPTIONS: VibeOption[] = ["Minimal", "Bold", "Playful", "Luxury", "Corporate", "Custom"];

interface ColorSwatch {
  id: string;
  label: string;
  hex: string;
}

const COLOR_SWATCHES: ColorSwatch[] = [
  { id: "slate",    label: "Slate",    hex: "#64748b" },
  { id: "sand",     label: "Sand",     hex: "#c4a882" },
  { id: "ocean",    label: "Ocean",    hex: "#0ea5e9" },
  { id: "forest",   label: "Forest",   hex: "#16a34a" },
  { id: "rose",     label: "Rose",     hex: "#f43f5e" },
  { id: "violet",   label: "Violet",   hex: "#8b5cf6" },
  { id: "amber",    label: "Amber",    hex: "#f59e0b" },
  { id: "charcoal", label: "Charcoal", hex: "#374151" },
];

const QUESTIONS = [
  "What's your business or project name?",
  "Describe what you do in one sentence.",
  "Pick a vibe:",
] as const;

// Total wizard steps for progress dots (Q1, Q2, Q3/vibe, color)
const TOTAL_DOTS = 4;

// ─── Typewriter hook ─────────────────────────────────────────────────────────

function useTypewriter(text: string, speed = 28): string {
  const [displayed, setDisplayed] = useState("");
  const prevText = useRef("");

  useEffect(() => {
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

// ─── Progress dots component ──────────────────────────────────────────────────

function ProgressDots({ filled }: { filled: number }) {
  return (
    <div className="mb-12 flex items-center gap-2.5">
      {Array.from({ length: TOTAL_DOTS }, (_, i) => (
        <span
          key={i}
          className={cn(
            "h-2 w-2 rounded-full transition-all duration-300",
            i < filled ? "bg-[#F97316] scale-110" : "bg-[#d1d5db]",
          )}
        />
      ))}
    </div>
  );
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
    if (showDirectInput) directInputRef.current?.focus();
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
              if (e.key === "Enter" && directText.trim()) onDescribeDirect(directText.trim());
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
  onComplete: (name: string, description: string, vibeValue: string) => void;
  onBack: () => void;
}

function Step2({ siteType: _siteType, onComplete, onBack }: Step2Props) {
  const [questionIdx, setQuestionIdx] = useState(0);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [vibe, setVibe] = useState<VibeOption | null>(null);
  const [customVibeText, setCustomVibeText] = useState("");
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const customVibeInputRef = useRef<HTMLInputElement>(null);

  const currentQuestion = QUESTIONS[questionIdx];
  const typedQuestion = useTypewriter(currentQuestion ?? "", 30);

  useEffect(() => {
    const t = setTimeout(() => {
      (inputRef.current as HTMLElement | null)?.focus();
    }, currentQuestion.length * 30 + 100);
    return () => clearTimeout(t);
  }, [questionIdx, currentQuestion]);

  // Focus custom vibe input when Custom is selected
  useEffect(() => {
    if (vibe === "Custom") {
      const t = setTimeout(() => customVibeInputRef.current?.focus(), 80);
      return () => clearTimeout(t);
    }
  }, [vibe]);

  const resolvedVibeValue = vibe === "Custom" ? customVibeText.trim() : (vibe ?? "");

  const canAdvance =
    questionIdx === 0 ? name.trim().length > 0 :
    questionIdx === 1 ? description.trim().length > 0 :
    vibe !== null && (vibe !== "Custom" || customVibeText.trim().length > 0);

  const handleAdvance = useCallback(() => {
    if (!canAdvance) return;
    if (questionIdx < 2) {
      setQuestionIdx((i) => i + 1);
    } else {
      onComplete(name.trim(), description.trim(), resolvedVibeValue);
    }
  }, [canAdvance, questionIdx, name, description, resolvedVibeValue, onComplete]);

  const handleBack = useCallback(() => {
    if (questionIdx > 0) {
      setQuestionIdx((i) => i - 1);
    } else {
      onBack();
    }
  }, [questionIdx, onBack]);

  // dots 1-filled for Q0, 2-filled for Q1, 3-filled for Q2
  const filledDots = questionIdx + 1;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#faf9f6] px-6 py-16">
      <ProgressDots filled={filledDots} />

      <div className="w-full max-w-lg">
        <h2 className="mb-8 min-h-[2em] text-[22px] font-semibold leading-snug text-[#1a1a1a]">
          {typedQuestion}
          {typedQuestion.length < currentQuestion.length && (
            <span className="animate-pulse text-[#F97316]">|</span>
          )}
        </h2>

        {/* Q0: name */}
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

        {/* Q1: description */}
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

        {/* Q2: vibe pills + Custom text input */}
        {questionIdx === 2 && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-3">
              {VIBE_OPTIONS.map((v) => (
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
            {vibe === "Custom" && (
              <input
                ref={customVibeInputRef}
                value={customVibeText}
                onChange={(e) => setCustomVibeText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAdvance()}
                placeholder="Describe your vibe e.g. dark and moody, high-end fashion..."
                className="w-full rounded-xl border border-[#e5e5e5] bg-white px-4 py-3 text-[14px] text-[#1a1a1a] placeholder-[#9ca3af] outline-none transition-colors focus:border-[#F97316]/60 focus:ring-2 focus:ring-[#F97316]/10"
              />
            )}
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
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Step 3: Color Theme Picker ───────────────────────────────────────────────

interface Step3Props {
  onComplete: (colorTheme: string | null) => void;
  onBack: () => void;
}

function Step3({ onComplete, onBack }: Step3Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [showCustomHex, setShowCustomHex] = useState(false);
  const [customHex, setCustomHex] = useState("#");
  const customHexRef = useRef<HTMLInputElement>(null);

  const typedQuestion = useTypewriter("Pick a color theme:", 30);

  useEffect(() => {
    if (showCustomHex) customHexRef.current?.focus();
  }, [showCustomHex]);

  const handleSwatchClick = (swatchId: string) => {
    setSelected(swatchId);
    setShowCustomHex(false);
  };

  const handleCustomClick = () => {
    setSelected("custom");
    setShowCustomHex(true);
  };

  const handleSkip = () => onComplete(null);

  const handleAdvance = () => {
    if (selected === null) return;
    if (selected === "custom") {
      const hex = customHex.trim();
      onComplete(hex.length > 1 ? hex : null);
    } else {
      const swatch = COLOR_SWATCHES.find((s) => s.id === selected);
      onComplete(swatch ? `${swatch.label} (${swatch.hex})` : selected);
    }
  };

  const canAdvance = selected !== null && (selected !== "custom" || customHex.trim().length > 1);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#faf9f6] px-6 py-16">
      <ProgressDots filled={4} />

      <div className="w-full max-w-lg">
        <h2 className="mb-8 min-h-[2em] text-[22px] font-semibold leading-snug text-[#1a1a1a]">
          {typedQuestion}
          {typedQuestion.length < "Pick a color theme:".length && (
            <span className="animate-pulse text-[#F97316]">|</span>
          )}
        </h2>

        {/* Swatches */}
        <div className="flex flex-wrap gap-3">
          {COLOR_SWATCHES.map((swatch) => (
            <button
              key={swatch.id}
              onClick={() => handleSwatchClick(swatch.id)}
              className={cn(
                "flex items-center gap-2 rounded-full border px-4 py-2 text-[14px] font-medium transition-all duration-150",
                selected === swatch.id
                  ? "border-[#F97316] bg-white shadow-sm"
                  : "border-[#e5e5e5] bg-white text-[#6b7280] hover:border-[#F97316]/40 hover:text-[#1a1a1a]",
              )}
            >
              <span
                className="h-4 w-4 flex-shrink-0 rounded-full ring-1 ring-black/10"
                style={{ backgroundColor: swatch.hex }}
              />
              <span className={selected === swatch.id ? "text-[#1a1a1a]" : undefined}>
                {swatch.label}
              </span>
            </button>
          ))}

          {/* Custom swatch */}
          <button
            onClick={handleCustomClick}
            className={cn(
              "flex items-center gap-2 rounded-full border px-4 py-2 text-[14px] font-medium transition-all duration-150",
              selected === "custom"
                ? "border-[#F97316] bg-white shadow-sm text-[#1a1a1a]"
                : "border-[#e5e5e5] bg-white text-[#6b7280] hover:border-[#F97316]/40 hover:text-[#1a1a1a]",
            )}
          >
            <span
              className="h-4 w-4 flex-shrink-0 rounded-full border border-dashed border-[#9ca3af]"
              style={
                customHex.length > 1
                  ? { backgroundColor: customHex }
                  : { background: "linear-gradient(135deg, #f97316 50%, #8b5cf6 50%)" }
              }
            />
            Custom
          </button>
        </div>

        {/* Custom hex input */}
        {showCustomHex && (
          <div className="mt-4">
            <input
              ref={customHexRef}
              value={customHex}
              onChange={(e) => {
                let v = e.target.value;
                if (!v.startsWith("#")) v = "#" + v.replace(/#/g, "");
                setCustomHex(v.slice(0, 7));
              }}
              onKeyDown={(e) => e.key === "Enter" && handleAdvance()}
              placeholder="#1a1a1a"
              maxLength={7}
              className="w-40 rounded-xl border border-[#e5e5e5] bg-white px-4 py-2.5 text-[14px] font-mono text-[#1a1a1a] placeholder-[#9ca3af] outline-none transition-colors focus:border-[#F97316]/60 focus:ring-2 focus:ring-[#F97316]/10"
            />
          </div>
        )}

        {/* Navigation */}
        <div className="mt-8 flex items-center justify-between">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-[13px] text-[#9ca3af] transition-colors hover:text-[#6b7280]"
          >
            <ArrowLeft size={14} />
            Back
          </button>
          <div className="flex items-center gap-3">
            <button
              onClick={handleSkip}
              className="text-[13px] text-[#9ca3af] transition-colors hover:text-[#6b7280]"
            >
              Skip
            </button>
            <button
              onClick={handleAdvance}
              disabled={!canAdvance}
              className="rounded-xl bg-[#F97316] px-6 py-2.5 text-[14px] font-semibold text-white transition-colors hover:bg-[#EA580C] disabled:opacity-40"
            >
              Generate →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Step 4: Generate Loading ─────────────────────────────────────────────────

interface Step4Props {
  siteType: SiteType;
  name: string;
  description: string;
  vibeValue: string;
  colorTheme: string | null;
  onDone: () => void;
}

function Step4({ siteType, name, description, vibeValue, colorTheme, onDone }: Step4Props) {
  useEffect(() => {
    const prompt = buildPrompt(siteType, name, description, vibeValue, colorTheme);
    saveProjectLaunchIntent({ prompt });
    const t = setTimeout(() => onDone(), 1600);
    return () => clearTimeout(t);
  }, [siteType, name, description, vibeValue, colorTheme, onDone]);

  const label = SITE_TYPE_LABELS[siteType];

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#faf9f6]">
      <div className="relative mb-8 flex h-20 w-20 items-center justify-center">
        <span className="absolute inset-0 animate-ping rounded-full bg-[#F97316]/20" />
        <span className="absolute inset-2 animate-ping rounded-full bg-[#F97316]/15" />
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
  vibeValue: string,
  colorTheme: string | null,
): string {
  const typeLabel = SITE_TYPE_LABELS[siteType];

  const presetVibeNotes: Record<string, string> = {
    Minimal: "clean and minimal — generous whitespace, muted palette, simple typography",
    Bold: "bold and high-contrast — strong typography, punchy colors, impactful layout",
    Playful: "playful and energetic — fun colors, rounded shapes, light-hearted tone",
    Luxury: "luxury and premium — dark tones or rich neutrals, elegant serif fonts, refined spacing",
    Corporate: "corporate and professional — structured layout, trustworthy colors, formal tone",
  };

  const vibeDesc = presetVibeNotes[vibeValue] ?? vibeValue;
  const colorNote = colorTheme ? ` Use ${colorTheme} as the primary color direction.` : "";

  return (
    `Build a ${typeLabel} website for "${name}". ` +
    `${description} ` +
    `Visual style: ${vibeDesc}.${colorNote} ` +
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
  const [collectedVibe, setCollectedVibe] = useState("");
  const [collectedColor, setCollectedColor] = useState<string | null>(null);

  const handleTypeSelect = useCallback((type: SiteType) => {
    setSiteType(type);
    setStep(2);
  }, []);

  const handleDescribeDirect = useCallback((text: string) => {
    saveProjectLaunchIntent({ prompt: text });
    void navigate({ to: "/studio/project/$id", params: { id: "new" } });
  }, [navigate]);

  const handleQuestionsComplete = useCallback(
    (name: string, description: string, vibeValue: string) => {
      setCollectedName(name);
      setCollectedDescription(description);
      setCollectedVibe(vibeValue);
      setStep(3);
    },
    [],
  );

  const handleColorComplete = useCallback((colorTheme: string | null) => {
    setCollectedColor(colorTheme);
    setStep(4);
  }, []);

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

  if (step === 3) {
    return (
      <Step3
        onComplete={handleColorComplete}
        onBack={() => setStep(2)}
      />
    );
  }

  if (step === 4 && siteType) {
    return (
      <Step4
        siteType={siteType}
        name={collectedName}
        description={collectedDescription}
        vibeValue={collectedVibe}
        colorTheme={collectedColor}
        onDone={handleGenerateDone}
      />
    );
  }

  return null;
}
