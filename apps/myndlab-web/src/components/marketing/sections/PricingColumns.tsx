export interface PriceFeature {
  text: string;
  included?: boolean;
}

export interface PriceCta {
  label: string;
  variant?: "outline" | "cyan" | "magenta-outline";
  onClick?: () => void;
}

export interface PriceTier {
  name: string;
  nameColor?: "cyan" | "magenta";
  amount: string;
  unit?: string;
  description: string;
  featured?: boolean;
  features: PriceFeature[];
  cta: PriceCta;
}

interface Props {
  tiers: PriceTier[];
  footnote?: string;
}

function CtaButton({ cta }: { cta: PriceCta }) {
  const styles: React.CSSProperties = {
    width: "100%",
    padding: "12px 20px",
    borderRadius: 999,
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
    transition: "opacity 150ms",
    textAlign: "center" as const,
    display: "block",
  };

  if (cta.variant === "cyan") {
    Object.assign(styles, {
      background: "#00D5D8",
      color: "#131313",
      border: 0,
    });
  } else if (cta.variant === "magenta-outline") {
    Object.assign(styles, {
      background: "transparent",
      color: "#FF2FB3",
      border: "1px solid #FF2FB3",
    });
  } else {
    Object.assign(styles, {
      background: "transparent",
      color: "#ffffff",
      border: "1px solid rgba(255,255,255,0.18)",
    });
  }

  return (
    <button type="button" onClick={cta.onClick} style={styles}>
      {cta.label}
    </button>
  );
}

function TierCard({ tier }: { tier: PriceTier }) {
  const nameColorMap: Record<string, string> = {
    cyan: "#00D5D8",
    magenta: "#FF2FB3",
  };
  const nameColor = tier.nameColor ? nameColorMap[tier.nameColor] : "#ffffff";

  const cardStyle: React.CSSProperties = tier.featured
    ? {
        padding: 28,
        border: "1px solid rgba(0,213,216,0.30)",
        borderRadius: 20,
        background: "rgba(0,213,216,0.03)",
        marginTop: -28,
        marginBottom: -28,
        display: "flex",
        flexDirection: "column",
      }
    : {
        display: "flex",
        flexDirection: "column",
      };

  return (
    <div className={tier.featured ? "pricing-tier-featured" : undefined} style={cardStyle}>
      {/* Most Popular pill */}
      {tier.featured && (
        <div style={{ marginBottom: 20 }}>
          <span
            style={{
              display: "inline-block",
              padding: "4px 10px",
              background: "#00D5D8",
              color: "#131313",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              borderRadius: 999,
            }}
          >
            Most Popular
          </span>
        </div>
      )}

      {/* Tier name */}
      <div
        style={{
          fontSize: 28,
          fontWeight: 600,
          letterSpacing: "-0.02em",
          color: nameColor,
          marginBottom: 12,
        }}
      >
        {tier.name}
      </div>

      {/* Amount + unit */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 2, marginBottom: 0 }}>
        <span
          style={{
            fontSize: 44,
            fontWeight: 600,
            letterSpacing: "-0.02em",
            color: "#ffffff",
            lineHeight: 1,
          }}
        >
          {tier.amount}
        </span>
        {tier.unit && (
          <span
            style={{
              fontSize: 17,
              fontWeight: 400,
              color: "rgba(255,255,255,0.40)",
              marginLeft: 2,
            }}
          >
            {tier.unit}
          </span>
        )}
      </div>

      {/* Description */}
      <p
        style={{
          fontSize: 14,
          color: "rgba(255,255,255,0.60)",
          marginTop: 12,
          marginBottom: 24,
          lineHeight: 1.5,
        }}
      >
        {tier.description}
      </p>

      {/* Divider */}
      <div
        style={{
          height: 1,
          background: "rgba(255,255,255,0.08)",
          marginBottom: 20,
        }}
      />

      {/* Features */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          flex: 1,
          marginBottom: 28,
        }}
      >
        {tier.features.map((f, i) => {
          const isIncluded = f.included !== false;
          return (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
                fontSize: 14,
                color: isIncluded ? "rgba(255,255,255,0.60)" : "rgba(255,255,255,0.25)",
              }}
            >
              <span
                style={{
                  flexShrink: 0,
                  fontSize: 13,
                  color: isIncluded ? "#00D5D8" : "rgba(255,255,255,0.25)",
                  lineHeight: "20px",
                  fontWeight: isIncluded ? 600 : 400,
                }}
              >
                {isIncluded ? "✓" : "—"}
              </span>
              <span style={{ lineHeight: 1.45 }}>{f.text}</span>
            </div>
          );
        })}
      </div>

      {/* CTA */}
      <CtaButton cta={tier.cta} />
    </div>
  );
}

export function PricingColumns({ tiers, footnote }: Props) {
  return (
    <>
      <style>{`
        .pricing-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 48px;
          align-items: start;
        }
        @media (max-width: 979px) {
          .pricing-grid {
            grid-template-columns: 1fr;
            gap: 32px;
          }
          .pricing-tier-featured {
            margin-top: 0 !important;
            margin-bottom: 0 !important;
          }
        }
      `}</style>
      <div
        style={{
          maxWidth: 1280,
          margin: "96px auto 0",
          padding: "0 56px",
        }}
      >
        <div className="pricing-grid">
          {tiers.map((tier, i) => (
            <TierCard key={i} tier={tier} />
          ))}
        </div>
        {footnote && (
          <p
            style={{
              fontSize: 13,
              color: "rgba(255,255,255,0.40)",
              textAlign: "center",
              marginTop: 32,
              lineHeight: 1.5,
            }}
          >
            {footnote}
          </p>
        )}
      </div>
    </>
  );
}
