import type { ReactNode } from "react";
import { PrismBeams } from "./PrismBeams";
import type { PrismVariant } from "./PrismBeams";

interface Props {
  variant: PrismVariant;
  h2: ReactNode;
  sub: string;
  primaryCta: { label: string; onClick?: () => void };
}

export function FinalCtaSection({ variant, h2, sub, primaryCta }: Props) {
  const accentColor = variant === "cyan" ? "#00D5D8" : "#FF2FB3";

  return (
    <div
      style={{
        position: "relative",
        maxWidth: 1280,
        margin: "120px auto 0",
        padding: "96px 56px",
        textAlign: "center",
        overflow: "hidden",
        borderTop: "1px solid rgba(255,255,255,0.10)",
      }}
    >
      <PrismBeams variant={variant} style={{ maxWidth: 800, opacity: 0.5 }} />

      <h2
        style={{
          fontSize: "clamp(36px, 4.5vw, 56px)",
          fontWeight: 600,
          letterSpacing: "-0.025em",
          lineHeight: 1.1,
          marginBottom: 16,
          position: "relative",
          zIndex: 2,
          color: "#ffffff",
        }}
      >
        {h2}
      </h2>

      <p
        style={{
          fontSize: 17,
          color: "rgba(255,255,255,0.70)",
          maxWidth: 540,
          margin: "0 auto 28px",
          position: "relative",
          zIndex: 2,
        }}
      >
        {sub}
      </p>

      <div style={{ position: "relative", zIndex: 2 }}>
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
      </div>
    </div>
  );
}
