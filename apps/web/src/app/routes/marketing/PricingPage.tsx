import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Check, ToggleLeft, ToggleRight } from "lucide-react";
import { cn } from "../../../lib/cn";
import BeomzLogo from "../../../assets/beomz-logo.svg?react";

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

export function PricingPage() {
  const [annual, setAnnual] = useState(false);

  return (
    <div className="min-h-screen bg-bg">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4">
        <Link to="/">
          <BeomzLogo className="h-6 w-auto text-white" />
        </Link>
        <div className="flex items-center gap-6">
          <Link
            to="/"
            className="text-sm text-white/50 transition-colors hover:text-white/80"
          >
            Home
          </Link>
          <a
            href="https://docs.beomz.com"
            className="text-sm text-white/50 transition-colors hover:text-white/80"
          >
            Docs
          </a>
          <button className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-white/50 transition-colors hover:border-white/20 hover:text-white/80">
            Sign in
          </button>
        </div>
      </nav>

      {/* Pricing */}
      <section className="mx-auto max-w-6xl px-4 py-24">
        <h1 className="mb-4 text-center text-4xl font-bold text-white">
          Simple, transparent pricing
        </h1>
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
