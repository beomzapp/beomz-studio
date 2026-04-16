/**
 * PricingModal — dark centred overlay showing the 4 plan tiers.
 * Triggered via usePricingModal().openPricingModal() from anywhere.
 * Dismissable via click-outside, Escape, or X button.
 */
import { useEffect, useState } from "react";
import { Check, Info, Loader, X } from "lucide-react";
import { cn } from "../lib/cn";
import { usePricingModal } from "../contexts/PricingModalContext";
import { createCheckoutSession } from "../lib/api";

interface Plan {
  id: "free" | "starter" | "builder" | "business";
  name: string;
  priceMonthly: number;
  credits: string;
  bonus: string;
  features: string[];
  cta: string;
  popular?: boolean;
}

const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    priceMonthly: 0,
    credits: "10 credits on signup",
    bonus: "one-time grant",
    features: [
      "1 project",
      "Basic templates",
      "Community support",
    ],
    cta: "Get Started",
  },
  {
    id: "starter",
    name: "Pro Starter",
    priceMonthly: 19,
    credits: "500 credits/mo",
    bonus: "+ 500 rollover",
    features: [
      "5 projects",
      "All templates",
      "Priority support",
      "Custom domains",
    ],
    cta: "Start Free Trial",
  },
  {
    id: "builder",
    name: "Pro Builder",
    priceMonthly: 39,
    credits: "1,200 credits/mo",
    bonus: "+ 2,400 rollover",
    features: [
      "Unlimited projects",
      "All templates",
      "Priority support",
      "Custom domains",
      "Team collaboration",
      "API access",
    ],
    cta: "Start Free Trial",
    popular: true,
  },
  {
    id: "business",
    name: "Business",
    priceMonthly: 199,
    credits: "6,000 credits/mo",
    bonus: "+ 18,000 rollover",
    features: [
      "Everything in Pro Builder",
      "Dedicated support",
      "SSO & SAML",
      "Custom contracts",
      "SLA guarantee",
    ],
    cta: "Contact Sales",
  },
];

const CREDITS_TOOLTIP =
  "1 credit ≈ a small edit or tweak. A full app build uses 3–30 credits depending on complexity.";

const ANNUAL_DISCOUNT = 0.8; // 20% off

function formatPrice(plan: Plan, annual: boolean): { price: string; period: string } {
  if (plan.priceMonthly === 0) return { price: "$0", period: "" };
  if (annual) {
    const yearly = Math.round(plan.priceMonthly * 12 * ANNUAL_DISCOUNT);
    return { price: `$${yearly}`, period: "/yr" };
  }
  return { price: `$${plan.priceMonthly}`, period: "/mo" };
}

export function PricingModal() {
  const { isOpen, closePricingModal } = usePricingModal();
  // Annual pricing disabled until STRIPE_*_YEARLY_PRICE_IDs are configured (BEO-327)
  const annual = false;
  // BEO-327: loading + error state for Stripe checkout redirect
  const [loadingPlanId, setLoadingPlanId] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePricingModal();
    };
    window.addEventListener("keydown", onKey);
    // Lock body scroll while open
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen, closePricingModal]);

  // Reset checkout state each time the modal opens
  useEffect(() => {
    if (isOpen) {
      setLoadingPlanId(null);
      setCheckoutError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // BEO-327: Wire plan select to Stripe checkout.
  // - free → close modal (user already signed up)
  // - business → mailto contact-sales
  // - starter / builder → POST /payments/checkout, redirect to Stripe
  const handlePlanSelect = async (plan: Plan) => {
    if (plan.id === "business") {
      window.location.href = "mailto:hello@beomz.com?subject=Business plan enquiry";
      return;
    }
    if (plan.id === "free") {
      closePricingModal();
      return;
    }

    setCheckoutError(null);
    setLoadingPlanId(plan.id);
    try {
      const { url } = await createCheckoutSession(
        plan.id,
        annual ? "yearly" : "monthly",
      );
      window.location.href = url;
    } catch (err) {
      console.error("[PricingModal] Checkout failed:", err);
      setCheckoutError("Something went wrong. Please try again.");
      setLoadingPlanId(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center overflow-y-auto bg-black/80 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) closePricingModal();
      }}
    >
      <div className="relative my-8 w-full max-w-6xl rounded-2xl border border-white/10 bg-[#0a0a0a] shadow-2xl">
        {/* Close button */}
        <button
          onClick={closePricingModal}
          className="absolute right-4 top-4 z-10 rounded-lg p-2 text-white/50 transition-colors hover:bg-white/5 hover:text-white"
          aria-label="Close"
        >
          <X size={18} />
        </button>

        <div className="px-6 py-10 sm:px-10">
          {/* Header */}
          <h2 className="text-center text-3xl font-bold text-white">
            Simple, transparent pricing
          </h2>
          <p className="mt-2 text-center text-sm text-white/50">
            Start free. Scale when you're ready.
          </p>

          {/* Annual toggle hidden — no yearly price IDs configured yet (BEO-327) */}

          {/* Plan grid */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PLANS.map((plan) => {
              const { price, period } = formatPrice(plan, annual);
              return (
                <div
                  key={plan.id}
                  className={cn(
                    "relative flex flex-col rounded-xl border p-5 transition-colors",
                    plan.popular
                      ? "border-[#F97316] bg-[#F97316]/5"
                      : "border-white/10 bg-white/[0.02] hover:border-white/20",
                  )}
                >
                  {plan.popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#F97316] px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                      Most Popular
                    </div>
                  )}

                  <div className="mb-1 text-sm font-semibold text-white">{plan.name}</div>
                  <div className="mb-4 flex items-baseline gap-1">
                    <span className="text-3xl font-bold text-white">{price}</span>
                    {period && <span className="text-sm text-white/50">{period}</span>}
                  </div>

                  {/* Credits lines with tooltip */}
                  <div className="mb-4 space-y-1">
                    <div className="flex items-center gap-1.5 text-sm text-white/80">
                      <span>{plan.credits}</span>
                      <span className="group relative">
                        <Info size={12} className="text-white/30" />
                        <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-56 -translate-x-1/2 rounded-md bg-[#1a1a1a] px-2.5 py-1.5 text-[11px] text-white/80 opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                          {CREDITS_TOOLTIP}
                        </span>
                      </span>
                    </div>
                    <div className="text-xs text-white/40">{plan.bonus}</div>
                  </div>

                  {/* Features */}
                  <ul className="mb-6 flex-1 space-y-2">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-xs text-white/70">
                        <Check size={12} className="mt-0.5 flex-none text-[#F97316]" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>

                  {/* CTA */}
                  <button
                    onClick={() => handlePlanSelect(plan)}
                    disabled={loadingPlanId !== null}
                    className={cn(
                      "flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                      plan.popular
                        ? "bg-[#F97316] text-white hover:bg-[#ea6c0e]"
                        : plan.id === "business"
                          ? "border border-white/20 text-white hover:bg-white/5"
                          : "bg-white/10 text-white hover:bg-white/15",
                    )}
                  >
                    {loadingPlanId === plan.id ? (
                      <>
                        <Loader size={14} className="animate-spin" />
                        Redirecting&hellip;
                      </>
                    ) : (
                      plan.cta
                    )}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Checkout error */}
          {checkoutError && (
            <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-center text-sm text-red-400">
              {checkoutError}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
