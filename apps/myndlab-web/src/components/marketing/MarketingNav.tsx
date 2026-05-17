import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "@tanstack/react-router";
import MyndlabLogo from "../../assets/myndlab-logo.svg?react";
import { FEATURES_MEGA, SOLUTIONS_MEGA, type MegaConfig } from "./MarketingNav.config";

// Monoline SVG icons matching megamenu-samples.html exactly
const ICONS: Record<string, string> = {
  lightning: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L4.09 12.97a1 1 0 00.78 1.63h6.45L10 22l8.91-10.97a1 1 0 00-.78-1.63h-6.45L13 2z"/></svg>`,
  mic: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 00-3 3v6a3 3 0 006 0V5a3 3 0 00-3-3zM19 10v1a7 7 0 01-14 0v-1M12 18v4M8 22h8"/></svg>`,
  palette: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r="1.5" fill="currentColor"/><circle cx="17.5" cy="10.5" r="1.5" fill="currentColor"/><circle cx="8.5" cy="7.5" r="1.5" fill="currentColor"/><circle cx="6.5" cy="12.5" r="1.5" fill="currentColor"/><path d="M12 2a10 10 0 1010 10c0-5-7-3-7-6s5-1 5-4-5-5-10-5z"/></svg>`,
  history: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 109-9M3 4v5h5M12 7v5l3 3"/></svg>`,
  stack: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16zM3.27 6.96L12 12.01l8.73-5.05M12 22.08V12"/></svg>`,
  globe: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>`,
  export: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 16.5l5.5-5.5 4 4 6-6"/><path d="M15 9h5v5"/></svg>`,
  saas: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 18l6-6 4 4 6-6M14 6h6v6"/></svg>`,
  tools: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M7 13h4"/></svg>`,
  agency: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 7l-8 4-8-4 8-4 8 4z"/><path d="M4 7v6l8 4 8-4V7"/></svg>`,
  education: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5-10-5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>`,
  prototype: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 2v6L3 22h18L15 8V2M9 2h6M8 14h8"/></svg>`,
  arrow: `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h8M7 3l4 4-4 4"/></svg>`,
  arrowSm: `<svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h8M7 3l4 4-4 4"/></svg>`,
};

type MegaKey = "features" | "solutions";

interface MegaPanelProps {
  config: MegaConfig;
  onClose: () => void;
}

function MegaPanel({ config, onClose }: MegaPanelProps) {
  return (
    <div className="mega-inner" style={{ maxWidth: 1440, margin: "0 auto", padding: "48px 40px 32px" }}>
      {/* Main grid: 2/3 features + 1/3 featured card */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0,2fr) minmax(0,1fr)",
          gap: 56,
          paddingBottom: 32,
          borderBottom: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        {/* Left: items */}
        <div>
          <div
            style={{
              fontSize: 11,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.4)",
              marginBottom: 24,
            }}
          >
            {config.eyebrow}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
            {config.items.map((item) => (
              <Link
                key={item.href}
                to={item.href as "/"}
                onClick={onClose}
                className="feature-row group"
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 14,
                  padding: "14px 16px",
                  borderRadius: 12,
                  cursor: "pointer",
                  transition: "background 0.15s ease",
                  textDecoration: "none",
                  color: "inherit",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)";
                  const icon = (e.currentTarget as HTMLElement).querySelector(".feature-icon") as HTMLElement | null;
                  if (icon) {
                    icon.style.background = "rgba(0,213,216,0.12)";
                    icon.style.color = "#00D5D8";
                  }
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = "transparent";
                  const icon = (e.currentTarget as HTMLElement).querySelector(".feature-icon") as HTMLElement | null;
                  if (icon) {
                    icon.style.background = "rgba(255,255,255,0.05)";
                    icon.style.color = "rgba(255,255,255,0.8)";
                  }
                }}
              >
                <div
                  className="feature-icon"
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: "rgba(255,255,255,0.05)",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    color: "rgba(255,255,255,0.8)",
                    transition: "background 0.15s ease, color 0.15s ease",
                  }}
                  dangerouslySetInnerHTML={{ __html: ICONS[item.icon as string] ?? "" }}
                />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: "#fff", marginBottom: 4 }}>
                    {item.title}
                  </div>
                  <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.55)", lineHeight: 1.5 }}>
                    {item.blurb}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Right: featured card */}
        <div
          style={{
            background: "linear-gradient(160deg, rgba(0,213,216,0.08) 0%, rgba(0,213,216,0.02) 50%, transparent 100%)",
            border: "1px solid rgba(0,213,216,0.18)",
            borderRadius: 16,
            padding: 24,
            display: "flex",
            flexDirection: "column",
            gap: 14,
            height: "100%",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* Radial glow blob */}
          <div
            style={{
              position: "absolute",
              top: "-40%",
              right: "-40%",
              width: 240,
              height: 240,
              background: "radial-gradient(circle, rgba(0,213,216,0.15) 0%, transparent 70%)",
              pointerEvents: "none",
            }}
          />
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 10,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "#00D5D8",
              fontWeight: 600,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                background: "#00D5D8",
                borderRadius: "50%",
                boxShadow: "0 0 8px #00D5D8",
              }}
            />
            {config.featured.badge}
          </div>
          <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.2 }}>
            {config.featured.title}
          </div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", lineHeight: 1.55, flex: 1 }}>
            {config.featured.blurb}
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
            <Link
              to={config.featured.primaryCta.href as "/"}
              onClick={onClose}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "9px 16px",
                background: "#00D5D8",
                color: "#131313",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                transition: "background 0.15s ease",
                textDecoration: "none",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#00BCC0"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "#00D5D8"; }}
            >
              {config.featured.primaryCta.label}
              <span dangerouslySetInnerHTML={{ __html: ICONS.arrow }} />
            </Link>
            {config.featured.secondaryCta && (
              <Link
                to={config.featured.secondaryCta.href as "/"}
                onClick={onClose}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "9px 14px",
                  color: "rgba(255,255,255,0.75)",
                  fontSize: 13,
                  fontWeight: 500,
                  textDecoration: "none",
                  transition: "color 0.15s ease",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "#00D5D8"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.75)"; }}
              >
                {config.featured.secondaryCta.label}
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Bottom action strip */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingTop: 24,
          gap: 24,
        }}
      >
        <div style={{ display: "flex", gap: 28, alignItems: "center" }}>
          {config.bottomLinks.map((link, i) => (
            <span key={link.href} style={{ display: "inline-flex", alignItems: "center", gap: 28 }}>
              {i > 0 && (
                <span
                  style={{
                    width: 4,
                    height: 4,
                    borderRadius: "50%",
                    background: "rgba(255,255,255,0.2)",
                    marginRight: -14,
                  }}
                />
              )}
              <Link
                to={link.href as "/"}
                onClick={onClose}
                style={{
                  fontSize: 13,
                  color: "rgba(255,255,255,0.55)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  transition: "color 0.15s ease",
                  textDecoration: "none",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "#00D5D8"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.55)"; }}
              >
                {link.label}
                {i === 0 && <span dangerouslySetInnerHTML={{ __html: ICONS.arrowSm }} />}
              </Link>
            </span>
          ))}
        </div>
        {config.bottomNote && (
          <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.4)" }}>
            {config.bottomNote.text}{" "}
            <Link
              to={config.bottomNote.cta.href as "/"}
              onClick={onClose}
              style={{ color: "#00D5D8", marginLeft: 6, textDecoration: "none" }}
            >
              {config.bottomNote.cta.label}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

export interface MarketingNavProps {
  onSignInClick?: () => void;
  onGetStartedClick?: () => void;
  /** Force a specific mega open (for dev preview). */
  forceOpen?: MegaKey | null;
}

export function MarketingNav({ onSignInClick, onGetStartedClick, forceOpen }: MarketingNavProps) {
  const [openMega, setOpenMega] = useState<MegaKey | null>(forceOpen ?? null);
  const navRef = useRef<HTMLDivElement>(null);

  const closeMega = useCallback(() => setOpenMega(null), []);

  const toggleMega = useCallback(
    (key: MegaKey) => {
      setOpenMega((prev) => (prev === key ? null : key));
    },
    [],
  );

  // ESC closes
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMega();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [closeMega]);

  // Click-outside closes
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!navRef.current) return;
      if (navRef.current.contains(e.target as Node)) return;
      closeMega();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [closeMega]);

  // Sync forceOpen prop (dev preview)
  useEffect(() => {
    if (forceOpen !== undefined) setOpenMega(forceOpen);
  }, [forceOpen]);

  const MEGA_MAP: Record<MegaKey, MegaConfig> = {
    features: FEATURES_MEGA,
    solutions: SOLUTIONS_MEGA,
  };

  return (
    <div
      ref={navRef}
      style={{
        position: "sticky",
        top: 0,
        zIndex: 100,
        background: "rgba(19,19,19,0.85)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      {/* Nav bar */}
      <nav
        style={{
          maxWidth: 1440,
          margin: "0 auto",
          display: "flex",
          alignItems: "center",
          padding: "18px 40px",
          gap: 48,
        }}
      >
        {/* Logo */}
        <Link
          to="/"
          style={{
            fontSize: 17,
            fontWeight: 600,
            letterSpacing: "-0.02em",
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexShrink: 0,
            color: "#fff",
            textDecoration: "none",
          }}
        >
          <MyndlabLogo style={{ width: 18, height: 20 }} />
          MYNDLAB
        </Link>

        {/* Center nav items */}
        <div style={{ display: "flex", alignItems: "center", gap: 4, flex: 1 }}>
          {(["features", "solutions"] as MegaKey[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => toggleMega(key)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 14px",
                borderRadius: 8,
                color: openMega === key ? "#00D5D8" : "rgba(255,255,255,0.7)",
                fontSize: 14,
                fontWeight: 500,
                cursor: "pointer",
                background: "transparent",
                border: 0,
                fontFamily: "inherit",
                transition: "color 0.15s ease",
              }}
              onMouseEnter={(e) => {
                if (openMega !== key) (e.currentTarget as HTMLElement).style.color = "#fff";
              }}
              onMouseLeave={(e) => {
                if (openMega !== key) (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.7)";
              }}
            >
              {key.charAt(0).toUpperCase() + key.slice(1)}
              {/* Slim 12×12 chevron — 1.5px stroke, rotates on active */}
              <svg
                width="10"
                height="10"
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{
                  transition: "transform 0.2s ease",
                  transform: openMega === key ? "rotate(180deg)" : "rotate(0deg)",
                  opacity: openMega === key ? 1 : 0.6,
                }}
              >
                <path d="M3 5L6 8L9 5" />
              </svg>
            </button>
          ))}
          <Link
            to="/pricing"
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "8px 14px",
              borderRadius: 8,
              color: "rgba(255,255,255,0.7)",
              fontSize: 14,
              fontWeight: 500,
              textDecoration: "none",
              transition: "color 0.15s ease",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "#fff"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.7)"; }}
          >
            Pricing
          </Link>
          <Link
            to="/guide"
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "8px 14px",
              borderRadius: 8,
              color: "rgba(255,255,255,0.7)",
              fontSize: 14,
              fontWeight: 500,
              textDecoration: "none",
              transition: "color 0.15s ease",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "#fff"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.7)"; }}
          >
            Guide
          </Link>
          <Link
            to="/enterprise"
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "8px 14px",
              borderRadius: 8,
              color: "#00D5D8",
              fontSize: 14,
              fontWeight: 500,
              textDecoration: "none",
            }}
          >
            Enterprise
          </Link>
          <Link
            to="/about"
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "8px 14px",
              borderRadius: 8,
              color: "rgba(255,255,255,0.7)",
              fontSize: 14,
              fontWeight: 500,
              textDecoration: "none",
              transition: "color 0.15s ease",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "#fff"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.7)"; }}
          >
            About
          </Link>
        </div>

        {/* Right: Sign in + Get started */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginLeft: "auto" }}>
          <button
            type="button"
            onClick={onSignInClick}
            style={{
              color: "rgba(255,255,255,0.7)",
              fontSize: 14,
              padding: "8px 14px",
              background: "transparent",
              border: 0,
              cursor: "pointer",
              fontFamily: "inherit",
              transition: "color 0.15s ease",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "#fff"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.7)"; }}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={onGetStartedClick}
            style={{
              background: "#00D5D8",
              color: "#131313",
              padding: "9px 18px",
              borderRadius: 9,
              fontSize: 14,
              fontWeight: 600,
              border: 0,
              cursor: "pointer",
              fontFamily: "inherit",
              transition: "background 0.15s ease",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#00BCC0"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "#00D5D8"; }}
          >
            Get started
          </button>
        </div>
      </nav>

      {/* Mega panels — render both, toggle visibility via opacity/pointer-events */}
      {(["features", "solutions"] as MegaKey[]).map((key) => {
        const isOpen = openMega === key;
        return (
          <div
            key={key}
            style={{
              position: "absolute",
              top: "100%",
              left: 0,
              right: 0,
              width: "100vw",
              background: "linear-gradient(180deg, rgba(17,17,20,0.98) 0%, rgba(13,13,15,0.98) 100%)",
              backdropFilter: "blur(28px)",
              WebkitBackdropFilter: "blur(28px)",
              borderBottom: "1px solid rgba(255,255,255,0.08)",
              boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
              transform: isOpen ? "translateY(0)" : "translateY(-12px)",
              opacity: isOpen ? 1 : 0,
              pointerEvents: isOpen ? "auto" : "none",
              transition: "opacity 0.25s cubic-bezier(0.4,0,0.2,1), transform 0.25s cubic-bezier(0.4,0,0.2,1)",
              zIndex: 95,
            }}
          >
            <MegaPanel config={MEGA_MAP[key]} onClose={closeMega} />
          </div>
        );
      })}
    </div>
  );
}
