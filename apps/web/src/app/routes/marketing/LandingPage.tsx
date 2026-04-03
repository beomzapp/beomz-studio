import { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Check, ToggleLeft, ToggleRight } from "lucide-react";
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
  const [annual, setAnnual] = useState(false);
  const editableRef = useRef<HTMLSpanElement>(null);
  const navigate = useNavigate();

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Tab") {
        e.preventDefault();
        setSuggestionIndex((i) => (i + 1) % SUGGESTIONS.length);
      }
      if (e.key === "Enter") {
        e.preventDefault();
        setIsTransitioning(true);
        setTimeout(() => navigate({ to: "/studio/home" }), 600);
      }
    },
    [navigate]
  );

  const handleInput = useCallback(() => {
    setSphereScale(1.05);
    setTimeout(() => setSphereScale(1), 150);
  }, []);

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

        {/* Prompt headline */}
        <h1 className="relative z-10 text-center font-sans font-bold text-white leading-tight" style={{ fontSize: "clamp(3rem, 6vw, 5rem)" }}>
          <span>Build </span>
          <span
            ref={editableRef}
            contentEditable
            suppressContentEditableWarning
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            className="outline-none caret-orange text-white/90"
            style={{ minWidth: "1ch", display: "inline-block" }}
          />
        </h1>

        {/* Suggestion strip */}
        <div className="relative z-10 mt-6 flex flex-wrap justify-center gap-3">
          {SUGGESTIONS.map((s, i) => (
            <button
              key={s}
              onClick={() => {
                setSuggestionIndex(i);
                if (editableRef.current) {
                  editableRef.current.textContent = s;
                  editableRef.current.focus();
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
          Press <kbd className="rounded border border-border px-1.5 py-0.5 text-xs text-white/50">Tab</kbd> to cycle suggestions · <kbd className="rounded border border-border px-1.5 py-0.5 text-xs text-white/50">Enter</kbd> to start building
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
          <span className={cn("text-sm", !annual ? "text-white" : "text-white/40")}>Monthly</span>
          <button onClick={() => setAnnual(!annual)} className="text-orange">
            {annual ? <ToggleRight size={32} /> : <ToggleLeft size={32} />}
          </button>
          <span className={cn("text-sm", annual ? "text-white" : "text-white/40")}>
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
                <span className="text-4xl font-bold text-white">{plan.price}</span>
                {plan.period && (
                  <span className="text-white/40">{plan.period}</span>
                )}
              </div>
              <ul className="mb-8 flex-1 space-y-2">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-white/60">
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
            <a href="https://beomz.com" className="hover:text-white transition-colors">beomz.com</a>
            <a href="https://crypto.beomz.com" className="hover:text-white transition-colors">crypto.beomz.com</a>
            <a href="https://token.beomz.com" className="hover:text-white transition-colors">token.beomz.com</a>
            <a href="https://token.beomz.com" className="hover:text-white transition-colors">$BEOMZ token</a>
          </div>
          <p className="text-sm text-white/30">&copy; Beomz 2026</p>
        </div>
      </footer>
    </div>
  );
}
