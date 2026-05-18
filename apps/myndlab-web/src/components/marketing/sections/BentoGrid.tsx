import type { ReactNode } from "react";

export type BentoVariant = "dark" | "cyan" | "magenta" | "yellow";
export type IconAccent = "cyan" | "magenta" | "yellow";

export interface Tile {
  icon: ReactNode;
  title: string;
  body: string;
  /** Background variant. Default: "dark" (glass surface). */
  variant?: BentoVariant;
  /** For `variant: "dark"` tiles only — colors the icon chip. Default: "cyan". */
  iconAccent?: IconAccent;
}

interface Props {
  tiles: Tile[];
}

/* ─── Variant token tables ─────────────────────────────────────────── */

interface VariantStyle {
  background: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  iconBg: string;
  iconColor: string;
  hoverBorder: string;
  hoverShadow: string;
  defaultBorderOnLeave: string;
  cornerBg?: string;
}

const VARIANT_STYLES: Record<BentoVariant, VariantStyle> = {
  dark: {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.10)",
    textPrimary: "#ffffff",
    textSecondary: "rgba(255,255,255,0.70)",
    iconBg: "rgba(0,213,216,0.10)",
    iconColor: "#00D5D8",
    hoverBorder: "rgba(0,213,216,0.40)",
    hoverShadow: "none",
    defaultBorderOnLeave: "rgba(255,255,255,0.10)",
  },
  cyan: {
    background: "#00D5D8",
    border: "1px solid #00D5D8",
    textPrimary: "#131313",
    textSecondary: "rgba(19,19,19,0.75)",
    iconBg: "rgba(19,19,19,0.08)",
    iconColor: "#131313",
    hoverBorder: "#00D5D8",
    hoverShadow: "0 8px 24px rgba(0,213,216,0.25)",
    defaultBorderOnLeave: "#00D5D8",
    cornerBg: "rgba(19,19,19,0.06)",
  },
  magenta: {
    background: "#FF2FB3",
    border: "1px solid #FF2FB3",
    textPrimary: "#131313",
    textSecondary: "rgba(19,19,19,0.75)",
    iconBg: "rgba(19,19,19,0.10)",
    iconColor: "#131313",
    hoverBorder: "#FF2FB3",
    hoverShadow: "0 8px 24px rgba(255,47,179,0.30)",
    defaultBorderOnLeave: "#FF2FB3",
    cornerBg: "rgba(19,19,19,0.06)",
  },
  yellow: {
    background: "#FFF500",
    border: "1px solid #FFF500",
    textPrimary: "#131313",
    textSecondary: "rgba(19,19,19,0.75)",
    iconBg: "rgba(19,19,19,0.08)",
    iconColor: "#131313",
    hoverBorder: "#FFF500",
    hoverShadow: "0 8px 24px rgba(255,245,0,0.30)",
    defaultBorderOnLeave: "#FFF500",
    cornerBg: "rgba(19,19,19,0.06)",
  },
};

const ICON_ACCENT_TOKENS: Record<IconAccent, { bg: string; color: string }> = {
  cyan:    { bg: "rgba(0,213,216,0.10)",  color: "#00D5D8" },
  magenta: { bg: "rgba(255,47,179,0.12)", color: "#FF2FB3" },
  yellow:  { bg: "rgba(255,245,0,0.12)",  color: "#FFF500" },
};

/* ─── BentoTile ────────────────────────────────────────────────────── */

function BentoTile({ tile }: { tile: Tile }) {
  const variant = tile.variant ?? "dark";
  const v = VARIANT_STYLES[variant];

  // Only dark tiles honor `iconAccent` (banded tiles use the variant's own icon styling).
  const iconChip =
    variant === "dark" && tile.iconAccent
      ? ICON_ACCENT_TOKENS[tile.iconAccent]
      : { bg: v.iconBg, color: v.iconColor };

  return (
    <div
      className="bento-tile"
      style={{
        position: "relative",
        padding: 28,
        background: v.background,
        border: v.border,
        borderRadius: 20,
        overflow: "hidden",
        transition: "border-color 200ms, transform 200ms, box-shadow 200ms",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        cursor: "pointer",
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLElement;
        el.style.transform = "translateY(-3px)";
        if (v.hoverShadow !== "none") el.style.boxShadow = v.hoverShadow;
        if (variant === "dark") el.style.borderColor = v.hoverBorder;
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLElement;
        el.style.transform = "translateY(0)";
        el.style.boxShadow = "none";
        if (variant === "dark") el.style.borderColor = v.defaultBorderOnLeave;
      }}
    >
      {v.cornerBg && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            right: -40,
            bottom: -40,
            width: 160,
            height: 160,
            borderRadius: "50%",
            background: v.cornerBg,
            pointerEvents: "none",
          }}
        />
      )}
      <div style={{ position: "relative", zIndex: 1 }}>
        <div
          style={{
            width: 44,
            height: 44,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            background: iconChip.bg,
            color: iconChip.color,
            borderRadius: 10,
            marginBottom: 24,
            flexShrink: 0,
          }}
        >
          {tile.icon}
        </div>
        <div
          style={{
            fontSize: 19,
            fontWeight: 600,
            letterSpacing: "-0.01em",
            marginBottom: 8,
            color: v.textPrimary,
          }}
        >
          {tile.title}
        </div>
        <div
          style={{
            fontSize: 14,
            color: v.textSecondary,
            lineHeight: 1.5,
            maxWidth: 360,
          }}
        >
          {tile.body}
        </div>
      </div>
    </div>
  );
}

/* ─── BentoGrid ────────────────────────────────────────────────────── */

export function BentoGrid({ tiles }: Props) {
  return (
    <>
      <style>{`
        @media (max-width: 980px) {
          .bento-grid {
            grid-template-columns: 1fr !important;
            grid-template-rows: auto !important;
          }
        }
      `}</style>
      <div
        className="bento-grid"
        style={{
          maxWidth: 1280,
          margin: "96px auto 0",
          padding: "0 56px",
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gridTemplateRows: "repeat(2, 260px)",
          gap: 16,
        }}
      >
        {tiles.map((tile, i) => (
          <BentoTile key={i} tile={tile} />
        ))}
      </div>
    </>
  );
}
