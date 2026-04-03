import { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Check,
  ToggleLeft,
  ToggleRight,
  ListChecks,
  Paperclip,
  X,
} from "lucide-react";
import { cn } from "../../../lib/cn";

const SUGGESTIONS = [
  "a SaaS dashboard",
  "a marketing website",
  "a task manager",
];

const PLANS = [
  {
    name: "Free",
    price: "$0",
    period: "",
    features: [
      "1 project",
      "Basic templates",
      "Community support",
      "500 AI generations/mo",
    ],
    cta: "Get Started",
    popular: false,
  },
  {
    name: "Pro Starter",
    price: "$19",
    period: "/mo",
    features: [
      "5 projects",
      "All templates",
      "Priority support",
      "2,000 AI generations/mo",
      "Custom domains",
    ],
    cta: "Start Free Trial",
    popular: false,
  },
  {
    name: "Pro Builder",
    price: "$39",
    period: "/mo",
    features: [
      "Unlimited projects",
      "All templates",
      "Priority support",
      "10,000 AI generations/mo",
      "Custom domains",
      "Team collaboration",
      "API access",
    ],
    cta: "Start Free Trial",
    popular: true,
  },
  {
    name: "Business",
    price: "$199",
    period: "/mo",
    features: [
      "Everything in Pro Builder",
      "Unlimited AI generations",
      "Dedicated support",
      "SSO & SAML",
      "Custom contracts",
      "SLA guarantee",
    ],
    cta: "Contact Sales",
    popular: false,
  },
];

export function LandingPage() {
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [sphereScale, setSphereScale] = useState(1);
  const [fontSize, setFontSize] = useState(72);
  const [fontWeight, setFontWeight] = useState(700);
  const [hasText, setHasText] = useState(false);
  const [planMode, setPlanMode] = useState(false);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [annual, setAnnual] = useState(false);
  const editableRef = useRef<HTMLSpanElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const rafRef = useRef<number>(0);
  const currentSizeRef = useRef(72);
  const navigate = useNavigate();

  const CHAR_TIERS = [
    { maxChars: 40, size: 72, weight: 700 },
    { maxChars: 80, size: 56, weight: 700 },
    { maxChars: 140, size: 40, weight: 600 },
    { maxChars: 220, size: 28, weight: 600 },
    { maxChars: 320, size: 20, weight: 500 },
    { maxChars: Infinity, size: 16, weight: 400 },
  ];

  const updateFontSize = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const el = editableRef.current;
      if (!el) return;
      const len = (el.textContent || "").length;
      setHasText(len > 0);

      if (!len) {
        currentSizeRef.current = 72;
        setFontSize(72);
        setFontWeight(700);
        return;
      }

      const tier = CHAR_TIERS.find((t) => len <= t.maxChars)!;

      // Hysteresis: only update if size differs by more than 2px
      if (Math.abs(tier.size - currentSizeRef.current) > 2) {
        currentSizeRef.current = tier.size;
        setFontSize(tier.size);
        setFontWeight(tier.weight);
      }
    });
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Tab") {
        e.preventDefault();
        if (editableRef.current) {
          editableRef.current.textContent = SUGGESTIONS[suggestionIndex];
          // Place caret at end
          const range = document.createRange();
          const sel = window.getSelection();
          range.selectNodeContents(editableRef.current);
          range.collapse(false);
          sel?.removeAllRanges();
          sel?.addRange(range);
          updateFontSize();
        }
        setSuggestionIndex((i) => (i + 1) % SUGGESTIONS.length);
      }
      if (e.key === "Enter" && e.shiftKey) {
        e.preventDefault();
        document.execCommand("insertLineBreak");
        updateFontSize();
      } else if (e.key === "Enter") {
        e.preventDefault();
        setIsTransitioning(true);
        setTimeout(() => navigate({ to: "/studio/home" }), 600);
      }
    },
    [navigate, suggestionIndex, updateFontSize]
  );

  const handleInput = useCallback(() => {
    setSphereScale(1.05);
    setTimeout(() => setSphereScale(1), 150);
    updateFontSize();
  }, [updateFontSize]);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) setAttachedFile(file);
      e.target.value = "";
    },
    []
  );

  useEffect(() => {
    editableRef.current?.focus();
  }, []);

  return (
    <div
      className={cn(
        "min-h-screen bg-bg transition-transform duration-600 ease-in-out",
        isTransitioning && "-translate-y-full"
      )}
    >
      {/* Hero */}
      <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4">
        {/* Gradient sphere */}
        <div
          className="pointer-events-none absolute h-[500px] w-[500px] rounded-full opacity-40 blur-[120px] transition-transform duration-150"
          style={{
            background:
              "radial-gradient(circle, var(--color-orange) 0%, var(--color-purple) 60%, transparent 100%)",
            transform: `scale(${sphereScale})`,
          }}
        />

        {/* Attached file pill */}
        {attachedFile && (
          <div className="relative z-10 mb-4 flex items-center gap-2 rounded-full border border-border bg-white/5 px-3 py-1.5 text-sm text-white/60">
            <Paperclip size={14} className="text-orange" />
            <span className="max-w-[200px] truncate">{attachedFile.name}</span>
            <button
              onClick={() => setAttachedFile(null)}
              className="ml-1 text-white/30 hover:text-white"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* Prompt headline — fully editable */}
        <h1
          className="relative z-10 w-full max-w-4xl overflow-hidden text-center font-sans text-white"
          style={{
            fontSize: `${fontSize}px`,
            fontWeight: fontWeight,
            lineHeight: 1.4,
            maxHeight: "60vh",
            transition: "font-size 0.15s ease",
          }}
        >
          <span
            ref={editableRef}
            contentEditable
            suppressContentEditableWarning
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            data-placeholder="Build "
            className={cn(
              "outline-none caret-orange inline-block min-w-[1ch] text-center",
              !hasText &&
                "before:content-[attr(data-placeholder)] before:text-white/30"
            )}
            style={{ paddingBottom: "0.5em", lineHeight: 1.4 }}
          />
        </h1>

        {/* Typing toolbar */}
        <div
          className={cn(
            "relative z-10 mt-4 flex items-center gap-4 transition-opacity duration-200",
            hasText ? "opacity-100" : "pointer-events-none opacity-0"
          )}
        >
          {/* Plan mode toggle */}
          <button
            onClick={() => setPlanMode(!planMode)}
            title="Review the build plan before generating"
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all",
              planMode
                ? "border-orange/50 bg-orange/10 text-orange"
                : "border-border text-white/40 hover:border-white/20 hover:text-white/60"
            )}
          >
            <ListChecks size={14} />
            Plan
          </button>

          {/* File upload */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs font-medium text-white/40 transition-all hover:border-white/20 hover:text-white/60"
          >
            <Paperclip size={14} />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.pdf,.fig"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>

        {/* Suggestion strip */}
        <div className="relative z-10 mt-4 flex flex-wrap justify-center gap-3">
          {SUGGESTIONS.map((s, i) => (
            <button
              key={s}
              onClick={() => {
                setSuggestionIndex(i);
                if (editableRef.current) {
                  editableRef.current.textContent = s;
                  editableRef.current.focus();
                  updateFontSize();
                }
              }}
              className={cn(
                "rounded-full border px-4 py-1.5 text-sm transition-all",
                i === suggestionIndex
                  ? "border-orange/50 bg-orange/10 text-orange"
                  : "border-border text-white/40 hover:border-white/20 hover:text-white/60"
              )}
            >
              {s}
            </button>
          ))}
        </div>

        <p className="relative z-10 mt-4 text-sm text-white/30">
          <kbd className="rounded border border-border px-1.5 py-0.5 text-xs text-white/50">
            Tab
          </kbd>{" "}
          to autocomplete ·{" "}
          <kbd className="rounded border border-border px-1.5 py-0.5 text-xs text-white/50">
            Enter
          </kbd>{" "}
          to build
        </p>
      </section>

      {/* Pricing */}
      <section className="mx-auto max-w-6xl px-4 py-24">
        <h2 className="mb-4 text-center text-4xl font-bold text-white">
          Simple, transparent pricing
        </h2>
        <p className="mb-8 text-center text-white/50">
          Start free. Scale when you're ready.
        </p>

        {/* Annual toggle */}
        <div className="mb-12 flex items-center justify-center gap-3">
          <span
            className={cn("text-sm", !annual ? "text-white" : "text-white/40")}
          >
            Monthly
          </span>
          <button onClick={() => setAnnual(!annual)} className="text-orange">
            {annual ? <ToggleRight size={32} /> : <ToggleLeft size={32} />}
          </button>
          <span
            className={cn("text-sm", annual ? "text-white" : "text-white/40")}
          >
            Annual <span className="text-orange text-xs">Save 20%</span>
          </span>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={cn(
                "relative flex flex-col rounded-2xl border p-6",
                plan.popular
                  ? "border-orange bg-orange/5"
                  : "border-border bg-bg-card"
              )}
            >
              {plan.popular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-orange px-3 py-0.5 text-xs font-semibold text-white">
                  Most Popular
                </span>
              )}
              <h3 className="text-lg font-semibold text-white">{plan.name}</h3>
              <div className="mt-3 mb-6">
                <span className="text-4xl font-bold text-white">
                  {plan.price}
                </span>
                {plan.period && (
                  <span className="text-white/40">{plan.period}</span>
                )}
              </div>
              <ul className="mb-8 flex-1 space-y-2">
                {plan.features.map((f) => (
                  <li
                    key={f}
                    className="flex items-start gap-2 text-sm text-white/60"
                  >
                    <Check size={16} className="mt-0.5 shrink-0 text-orange" />
                    {f}
                  </li>
                ))}
              </ul>
              <button
                className={cn(
                  "w-full rounded-lg py-2.5 text-sm font-semibold transition-colors",
                  plan.popular
                    ? "bg-orange text-white hover:bg-orange/90"
                    : "border border-border text-white hover:bg-white/5"
                )}
              >
                {plan.cta}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border px-4 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 sm:flex-row sm:justify-between">
          <div className="flex flex-wrap justify-center gap-6 text-sm text-white/40">
            <a
              href="https://beomz.com"
              className="hover:text-white transition-colors"
            >
              beomz.com
            </a>
            <a
              href="https://crypto.beomz.com"
              className="hover:text-white transition-colors"
            >
              crypto.beomz.com
            </a>
            <a
              href="https://token.beomz.com"
              className="hover:text-white transition-colors"
            >
              token.beomz.com
            </a>
            <a
              href="https://token.beomz.com"
              className="hover:text-white transition-colors"
            >
              $BEOMZ token
            </a>
          </div>
          <p className="text-sm text-white/30">&copy; Beomz 2026</p>
        </div>
      </footer>
    </div>
  );
}
