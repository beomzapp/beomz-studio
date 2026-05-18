import { useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { MarketingPageLayout } from "../../../components/marketing/MarketingPageLayout";
import {
  PageHero,
  PricingColumns,
  type PriceTier,
  FinalCtaSection,
} from "../../../components/marketing/sections";
import { AuthModal } from "../../../components/auth/AuthModal";

const TIERS: PriceTier[] = [
  {
    name: "Basic",
    amount: "$0",
    unit: " /mo",
    description: "Start building with AI — no credit card needed.",
    features: [
      { text: "30 free credits on signup (5/day cap)" },
      { text: "1 project" },
      { text: "Single-arch apps (frontend only)" },
      { text: "All templates included" },
      { text: "Community support" },
      { text: "Top-up credit packs available" },
      { text: "Design DNA customization & templates" },
      { text: "Browser dictation (free)" },
      { text: "Voice chat with AI", included: false },
      { text: "Multi-arch apps (frontend + backend)", included: false },
      { text: "Code editor access", included: false },
      { text: "Code export & download", included: false },
      { text: "GitHub sync & publish", included: false },
      { text: "Custom domains", included: false },
      { text: "50+ API integrations", included: false },
      { text: "Version history & restore", included: false },
    ],
    cta: { label: "Start free", variant: "outline" },
  },
  {
    name: "Pro",
    amount: "$29",
    unit: " /mo",
    description: "For builders and teams shipping consistently.",
    featured: true,
    features: [
      { text: "200 credits/month (no daily cap)" },
      { text: "Unlimited projects" },
      { text: "Multi-arch apps (frontend + backend)" },
      { text: "Code editor access" },
      { text: "Code export & download" },
      { text: "GitHub sync & publish" },
      { text: "Custom domains" },
      { text: "App sharing & collaboration" },
      { text: "No Myndlab branding" },
      { text: "50+ API integrations" },
      { text: "Version history & restore" },
      { text: "Voice chat with AI" },
      { text: "Priority build queue" },
      { text: "Email support" },
    ],
    cta: { label: "Upgrade to Pro", variant: "cyan" },
  },
  {
    name: "Enterprise",
    nameColor: "magenta",
    amount: "Custom",
    description: "Custom solutions for organisations at scale.",
    features: [
      { text: "All Pro features, plus:" },
      { text: "Volume-based credit pricing" },
      { text: "Dedicated support & onboarding" },
      { text: "Custom connectors" },
      { text: "Publishing + sharing controls" },
      { text: "Audit logs + advanced analytics" },
      { text: "Priority access to new features" },
    ],
    cta: { label: "Book a demo", variant: "magenta-outline" },
  },
];

const CREDIT_PACKS = [
  {
    credits: "50 Credits",
    price: "$10",
    rate: "$0.20 / credit",
    featured: false,
    bestValue: false,
    cta: "Buy",
  },
  {
    credits: "120 Credits",
    price: "$20",
    rate: "$0.17 / credit",
    featured: true,
    bestValue: true,
    cta: "Buy",
  },
  {
    credits: "350 Credits",
    price: "$50",
    rate: "$0.14 / credit",
    featured: false,
    bestValue: false,
    cta: "Buy",
  },
];

export function PricingPage() {
  const navigate = useNavigate();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const pricingRef = useRef<HTMLDivElement>(null);

  function openSignup() {
    setShowAuthModal(true);
  }

  function scrollToPricing() {
    pricingRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const tiersWithCallbacks: PriceTier[] = TIERS.map((tier) => ({
    ...tier,
    cta: {
      ...tier.cta,
      onClick:
        tier.name === "Enterprise"
          ? undefined
          : openSignup,
    },
  }));

  return (
    <MarketingPageLayout hideCta>
      <div style={{ background: "#131313" }}>
        {/* 1. Hero */}
        <PageHero
          variant="cyan"
          eyebrow={{ variant: "cyan", label: "Simple pricing" }}
          h1={
            <>
              Start free.{" "}
              <span style={{ color: "#00D5D8" }}>Scale when you do.</span>
            </>
          }
          sub="No credit card. 30 free credits on signup. Cancel anytime."
          primaryCta={{ label: "Get started — it's free", onClick: openSignup }}
          secondaryCta={{ label: "Compare plans ↓", onClick: scrollToPricing }}
          metrics={[
            { value: "$0", label: "to start" },
            { value: "30", label: "Free credits" },
            { value: "No CC", label: "required" },
          ]}
          showScrollCue
        />

        {/* 2. Pricing columns */}
        <div ref={pricingRef} style={{ scrollMarginTop: 80 }}>
          <PricingColumns
            tiers={tiersWithCallbacks}
            footnote="Auto-fix attempts never count against your credits. You only pay for what you ask for."
          />
        </div>

        {/* 3. Credit packs */}
        <section
          style={{
            maxWidth: 1280,
            margin: "96px auto 0",
            padding: "0 56px",
          }}
        >
          <div style={{ textAlign: "center", marginBottom: 8 }}>
            <p
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: "rgba(255,255,255,0.40)",
                marginBottom: 12,
              }}
            >
              More credits?
            </p>
            <h2
              style={{
                fontSize: "clamp(28px, 3.5vw, 40px)",
                fontWeight: 600,
                letterSpacing: "-0.02em",
                color: "#ffffff",
                marginBottom: 12,
              }}
            >
              Top-up credit packs.
            </h2>
            <p
              style={{
                fontSize: 15,
                color: "rgba(255,255,255,0.60)",
                maxWidth: 480,
                margin: "0 auto",
                lineHeight: 1.55,
              }}
            >
              Upgrade to a paid plan to purchase top-up credits.
            </p>
          </div>

          <div
            style={{
              maxWidth: 880,
              margin: "64px auto 0",
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 16,
            }}
          >
            {CREDIT_PACKS.map((pack, i) => (
              <div
                key={i}
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: pack.featured
                    ? "1px solid rgba(0,213,216,0.30)"
                    : "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 16,
                  padding: 24,
                  display: "flex",
                  flexDirection: "column",
                  gap: 0,
                }}
              >
                {pack.bestValue && (
                  <div style={{ marginBottom: 12 }}>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "3px 8px",
                        background: "#FFF500",
                        color: "#131313",
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        borderRadius: 999,
                      }}
                    >
                      Best Value
                    </span>
                  </div>
                )}
                <div
                  style={{
                    fontSize: 18,
                    fontWeight: 600,
                    color: "#ffffff",
                    marginBottom: 4,
                    letterSpacing: "-0.01em",
                  }}
                >
                  {pack.credits}
                </div>
                <div
                  style={{
                    fontSize: 32,
                    fontWeight: 600,
                    letterSpacing: "-0.02em",
                    color: "#ffffff",
                    lineHeight: 1.1,
                    marginBottom: 4,
                  }}
                >
                  {pack.price}
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: "rgba(255,255,255,0.40)",
                    marginBottom: 20,
                  }}
                >
                  {pack.rate}
                </div>
                <button
                  type="button"
                  onClick={openSignup}
                  style={{
                    width: "100%",
                    padding: "10px 20px",
                    borderRadius: 999,
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    marginTop: "auto",
                    ...(pack.featured
                      ? {
                          background: "#00D5D8",
                          color: "#131313",
                          border: 0,
                        }
                      : {
                          background: "transparent",
                          color: "#ffffff",
                          border: "1px solid rgba(255,255,255,0.18)",
                        }),
                  }}
                >
                  {pack.cta}
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* 4. Voice features */}
        <section
          style={{
            maxWidth: 1280,
            margin: "80px auto 0",
            padding: "0 56px",
          }}
        >
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <p
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: "rgba(255,255,255,0.40)",
                marginBottom: 12,
              }}
            >
              Voice features
            </p>
            <h2
              style={{
                fontSize: "clamp(28px, 3.5vw, 40px)",
                fontWeight: 600,
                letterSpacing: "-0.02em",
                color: "#ffffff",
                marginBottom: 12,
              }}
            >
              Voice features.
            </h2>
            <p
              style={{
                fontSize: 15,
                color: "rgba(255,255,255,0.60)",
                maxWidth: 520,
                margin: "0 auto",
                lineHeight: 1.55,
              }}
            >
              Voice features are available to all users with remaining credits or top-up credits.
            </p>
          </div>

          <div
            style={{
              maxWidth: 560,
              margin: "0 auto",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 16,
              padding: 24,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 600,
                  color: "#ffffff",
                  marginBottom: 4,
                  letterSpacing: "-0.01em",
                }}
              >
                Voice Chat
              </div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.50)" }}>
                Real-time AI conversation
              </div>
            </div>
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "#00D5D8",
                whiteSpace: "nowrap",
                padding: "4px 12px",
                background: "rgba(0,213,216,0.08)",
                borderRadius: 999,
              }}
            >
              1 credit / session
            </div>
          </div>
        </section>

        {/* 5. Final CTA */}
        <FinalCtaSection
          variant="cyan"
          h2={
            <>
              Free to start.{" "}
              <span style={{ color: "#00D5D8" }}>Pay only when you scale.</span>
            </>
          }
          sub="Auto-fix attempts never count against your credits. You only pay for what you ask for."
          primaryCta={{ label: "Get started", onClick: openSignup }}
        />

        <div style={{ height: 80 }} />
      </div>

      <AuthModal
        open={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onSuccess={() => void navigate({ to: "/studio/home" })}
        initialMode="signup"
      />
    </MarketingPageLayout>
  );
}
