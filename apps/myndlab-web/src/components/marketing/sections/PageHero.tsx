import type { ReactNode } from "react";
import { PrismBeams } from "./PrismBeams";
import { Eyebrow } from "./Eyebrow";
import type { PrismVariant } from "./PrismBeams";

interface PillConfig {
  kind?: "new" | "info";
  badge: string;
  text: string;
  arrow?: boolean;
}

interface EyebrowConfig {
  variant?: PrismVariant;
  label: string;
}

interface CtaConfig {
  label: string;
  onClick?: () => void;
}

interface MetricConfig {
  value: string;
  label: string;
}

export interface PageHeroProps {
  variant: PrismVariant;
  eyebrow?: EyebrowConfig;
  pill?: PillConfig;
  h1: ReactNode;
  sub: string;
  primaryCta: CtaConfig;
  secondaryCta?: CtaConfig;
  metrics?: MetricConfig[];
  showScrollCue?: boolean;
}

export function PageHero({
  variant,
  eyebrow,
  pill,
  h1,
  sub,
  primaryCta,
  secondaryCta,
  metrics,
  showScrollCue = false,
}: PageHeroProps) {
  const accentColor = variant === "cyan" ? "#00D5D8" : "#FF2FB3";

  return (
    <>
      <style>{`
        @keyframes hero-bounce {
          0%, 100% { transform: translateX(-50%) translateY(0); opacity: 0.6; }
          50%       { transform: translateX(-50%) translateY(4px); opacity: 1; }
        }
        .hero-scroll-cue::after {
          content: "";
          display: block;
          width: 1px;
          height: 22px;
          background: linear-gradient(180deg, rgba(255,255,255,0.3), transparent);
          margin: 0 auto;
        }
        .hero-cta-secondary:hover {
          border-color: ${accentColor} !important;
          color: ${accentColor} !important;
        }
      `}</style>
      <section
        style={{
          position: "relative",
          minHeight: "100vh",
          maxWidth: 1280,
          margin: "0 auto",
          padding: "0 24px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          overflow: "hidden",
        }}
      >
        <PrismBeams variant={variant} />

        {/* Content */}
        <div
          style={{
            position: "relative",
            zIndex: 2,
            padding: "40px 0",
          }}
        >
          {/* Eyebrow */}
          {eyebrow && (
            <Eyebrow variant={eyebrow.variant}>{eyebrow.label}</Eyebrow>
          )}

          {/* Pill */}
          {pill && (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 14px",
                marginBottom: 28,
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.10)",
                borderRadius: 999,
                fontSize: 12,
                color: "rgba(255,255,255,0.70)",
                backdropFilter: "blur(8px)",
              }}
            >
              <span
                style={{
                  padding: "2px 8px",
                  background: pill.kind === "info" ? accentColor : "#FFF500",
                  color: "#131313",
                  fontSize: 10,
                  fontWeight: 700,
                  borderRadius: 4,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                {pill.badge}
              </span>
              <span>{pill.text}</span>
              {pill.arrow && (
                <span style={{ color: "rgba(255,255,255,0.50)", marginLeft: 4 }}>→</span>
              )}
            </div>
          )}

          {/* H1 */}
          <h1
            style={{
              fontSize: "clamp(48px, 7vw, 80px)",
              fontWeight: 600,
              letterSpacing: "-0.030em",
              lineHeight: 1.02,
              marginBottom: 28,
              maxWidth: 920,
              marginLeft: "auto",
              marginRight: "auto",
              color: "#ffffff",
            }}
          >
            {h1}
          </h1>

          {/* Sub */}
          <p
            style={{
              fontSize: 21,
              lineHeight: 1.5,
              color: "rgba(255,255,255,0.70)",
              maxWidth: 660,
              margin: "0 auto 40px",
            }}
          >
            {sub}
          </p>

          {/* CTA row */}
          <div
            style={{
              display: "flex",
              gap: 12,
              justifyContent: "center",
              marginBottom: metrics ? 56 : 0,
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              onClick={primaryCta.onClick}
              style={{
                padding: "14px 28px",
                background: accentColor,
                color: "#131313",
                border: 0,
                borderRadius: 999,
                fontSize: 15,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {primaryCta.label}
            </button>
            {secondaryCta && (
              <button
                type="button"
                onClick={secondaryCta.onClick}
                className="hero-cta-secondary"
                style={{
                  padding: "13px 24px",
                  background: "transparent",
                  color: "#ffffff",
                  border: "1px solid rgba(255,255,255,0.10)",
                  borderRadius: 999,
                  fontSize: 15,
                  fontWeight: 500,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  transition: "border-color 150ms, color 150ms",
                }}
              >
                {secondaryCta.label}
              </button>
            )}
          </div>

          {/* Metrics */}
          {metrics && metrics.length > 0 && (
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                gap: 32,
                flexWrap: "wrap",
              }}
            >
              {metrics.map((m, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 32 }}>
                  {i > 0 && (
                    <div
                      style={{
                        width: 1,
                        height: 32,
                        background: "rgba(255,255,255,0.10)",
                        marginRight: -16,
                      }}
                    />
                  )}
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 2,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 30,
                        fontWeight: 600,
                        letterSpacing: "-0.02em",
                        color: "#ffffff",
                      }}
                    >
                      {m.value}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: "rgba(255,255,255,0.50)",
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                      }}
                    >
                      {m.label}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Scroll cue */}
        {showScrollCue && (
          <div
            className="hero-scroll-cue"
            style={{
              position: "absolute",
              bottom: 32,
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 2,
              fontSize: 11,
              color: "rgba(255,255,255,0.30)",
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 8,
              animation: "hero-bounce 2.4s ease-in-out infinite",
            }}
          >
            Scroll
          </div>
        )}
      </section>
    </>
  );
}
