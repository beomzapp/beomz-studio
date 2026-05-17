import { useState, useEffect, useRef, useCallback, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import MyndlabLogo from "../../assets/myndlab-logo.svg?react";
import enterpriseIllustration from "../../assets/enterprise-illustration.jpg";
import { FEATURES_MEGA, SOLUTIONS_MEGA, type MegaConfig } from "./MarketingNav.config";
import { useTheme } from "../../lib/theme";

type MegaKey = "features" | "solutions";

// Slim chevron — rotates 180° when its menu is open
const ChevronDown = ({ open }: { open: boolean }) => (
  <svg
    viewBox="0 0 12 12"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`ml-1 inline-block h-[9px] w-[9px] transition-transform duration-200 ${
      open ? "rotate-180" : ""
    }`}
  >
    <path d="M3 5L6 8L9 5" />
  </svg>
);

const SunIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
  </svg>
);

const MoonIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);

const GlobeIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
    <circle cx="12" cy="12" r="10" />
    <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </svg>
);

// ─────────────────────────────────────────────────────────────────────────────
// Mega-item icons — thin monoline (1.4px stroke), 18px box, currentColor.
// Themes via the parent .group-hover (cyan tint on hover).
// ─────────────────────────────────────────────────────────────────────────────
const ICONS: Record<string, ReactNode> = {
  lightning: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
      <path d="M13 2L4.09 12.97a1 1 0 00.78 1.63h6.45L10 22l8.91-10.97a1 1 0 00-.78-1.63h-6.45L13 2z" />
    </svg>
  ),
  mic: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M19 11v1a7 7 0 0 1-14 0v-1M12 19v3M8 22h8" />
    </svg>
  ),
  palette: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
      <path d="M12 22a10 10 0 1 1 0-20 8 8 0 0 1 8 8c0 2-1 3-3 3h-2a2 2 0 0 0-2 2c0 1 1 2 1 3 0 2-1 4-2 4z" />
      <circle cx="7.5" cy="10.5" r="1" fill="currentColor" />
      <circle cx="12" cy="7.5" r="1" fill="currentColor" />
      <circle cx="16.5" cy="10.5" r="1" fill="currentColor" />
    </svg>
  ),
  history: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
      <path d="M3 12a9 9 0 1 0 9-9 9 9 0 0 0-7 3.5" />
      <path d="M3 4v4h4M12 7v5l3 3" />
    </svg>
  ),
  stack: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
      <path d="M12 2 2 7l10 5 10-5-10-5z" />
      <path d="M2 12l10 5 10-5M2 17l10 5 10-5" />
    </svg>
  ),
  globe: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20M12 2a15 15 0 0 1 4 10 15 15 0 0 1-4 10 15 15 0 0 1-4-10 15 15 0 0 1 4-10z" />
    </svg>
  ),
  export: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
      <path d="M12 16V4M7 9l5-5 5 5" />
      <path d="M4 20h16" />
    </svg>
  ),
  saas: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
      <path d="M4 18a3 3 0 1 1-3-3M9 8l4-4 7 7-4 4z" />
      <path d="M14.5 6.5l3 3M9 14l-3 3 3 3M5 16l3 3" />
    </svg>
  ),
  tools: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18M9 13h8M9 16h5" />
      <circle cx="6.5" cy="13" r="0.5" fill="currentColor" />
      <circle cx="6.5" cy="16" r="0.5" fill="currentColor" />
    </svg>
  ),
  agency: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18" />
    </svg>
  ),
  education: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
      <path d="M22 10L12 5 2 10l10 5 10-5z" />
      <path d="M6 12v5c0 1.5 2.5 3 6 3s6-1.5 6-3v-5M22 10v6" />
    </svg>
  ),
  prototype: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
      <path d="M9 3v6L5 21h14L15 9V3M9 3h6M9 14h6" />
    </svg>
  ),
};

// ─────────────────────────────────────────────────────────────────────────────
// Featured-card illustrations — larger SVG visuals, brand-tinted.
// ─────────────────────────────────────────────────────────────────────────────
const ILLUSTRATIONS: Record<string, ReactNode> = {
  voice: (
    <svg viewBox="0 0 160 110" fill="none" className="h-full w-full">
      {/* Outer pulse rings — animated via index.css class */}
      <circle cx="80" cy="55" r="48" stroke="#00D5D8" strokeWidth="1" strokeOpacity="0.15" className="mega-pulse" style={{ animationDelay: "0s" }} />
      <circle cx="80" cy="55" r="36" stroke="#00D5D8" strokeWidth="1" strokeOpacity="0.25" className="mega-pulse" style={{ animationDelay: "0.4s" }} />
      <circle cx="80" cy="55" r="26" stroke="#00D5D8" strokeWidth="1" strokeOpacity="0.4" className="mega-pulse" style={{ animationDelay: "0.8s" }} />
      {/* Mic body */}
      <rect x="72" y="38" width="16" height="26" rx="8" fill="none" stroke="#00D5D8" strokeWidth="1.4" />
      <path d="M64 55a16 16 0 0 0 32 0M80 71v6M73 77h14" stroke="#00D5D8" strokeWidth="1.4" strokeLinecap="round" fill="none" />
      {/* Tiny waveform bars off to the right */}
      <g stroke="#00D5D8" strokeWidth="1.4" strokeLinecap="round">
        <path d="M110 50v10" strokeOpacity="0.5" />
        <path d="M116 46v18" strokeOpacity="0.7" />
        <path d="M122 42v26" />
        <path d="M128 48v14" strokeOpacity="0.6" />
        <path d="M134 52v6" strokeOpacity="0.4" />
      </g>
    </svg>
  ),
  enterprise: (
    <div className="relative h-full w-full overflow-hidden rounded-xl">
      <img
        src={enterpriseIllustration}
        alt="Myndlab enterprise — glass prism over Dubai skyline"
        className="h-full w-full object-cover"
        loading="lazy"
      />
      {/* Subtle bottom gradient so the badge/title text below stays readable */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/30 to-transparent" />
    </div>
  ),
};

// ─────────────────────────────────────────────────────────────────────────────
// Full-width mega panel — brand-tinted background, monoline icons, illustration.
// ─────────────────────────────────────────────────────────────────────────────
function MegaPanel({ config, onClose }: { config: MegaConfig; onClose: () => void }) {
  return (
    <div
      className="border-t mega-panel-bg"
      style={{
        borderTopColor: "var(--myndlab-border)",
      }}
    >
      <div className="mx-auto max-w-[1440px] px-10 pb-7 pt-10">
        {/* Main row: feature list + featured card */}
        <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-12 border-b pb-7" style={{ borderBottomColor: "var(--myndlab-border)" }}>
          {/* Left — feature list with monoline icons */}
          <div>
            <div
              className="mb-5 text-[10px] font-medium uppercase tracking-[0.16em]"
              style={{ color: "var(--myndlab-fg-subtle)" }}
            >
              {config.eyebrow}
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1">
              {config.items.map((item) => (
                <Link
                  key={item.href}
                  to={item.href as "/"}
                  onClick={onClose}
                  className="group flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors"
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--myndlab-surface-hover)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  <span
                    className="mt-px shrink-0 transition-colors group-hover:text-[#00D5D8]"
                    style={{ color: "var(--myndlab-fg-subtle)" }}
                  >
                    {ICONS[item.icon] ?? null}
                  </span>
                  <span className="flex flex-col gap-0.5">
                    <span
                      className="text-sm font-medium whitespace-nowrap"
                      style={{ color: "var(--myndlab-fg-strong)" }}
                    >
                      {item.title}
                    </span>
                    <span
                      className="text-[12px] leading-snug"
                      style={{ color: "var(--myndlab-fg-subtle)" }}
                    >
                      {item.blurb}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          </div>

          {/* Right — featured card with illustration */}
          <div
            className="relative overflow-hidden rounded-2xl border p-6"
            style={{
              borderColor: "var(--myndlab-border)",
              background:
                "radial-gradient(ellipse at top right, rgba(0,213,216,0.10) 0%, transparent 60%), var(--myndlab-surface-hover)",
            }}
          >
            {/* Illustration band — top of card */}
            {config.featured.illustration && (
              <div className="mb-4 flex h-24 w-full items-center justify-center">
                {ILLUSTRATIONS[config.featured.illustration]}
              </div>
            )}

            <div className="mb-3 inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-[#00D5D8]">
              <span className="h-1 w-1 rounded-full bg-[#00D5D8]" />
              {config.featured.badge}
            </div>
            <div
              className="mb-2 text-base font-medium"
              style={{ color: "var(--myndlab-fg)" }}
            >
              {config.featured.title}
            </div>
            <div
              className="mb-5 text-[13px] leading-relaxed"
              style={{ color: "var(--myndlab-fg-muted)" }}
            >
              {config.featured.blurb}
            </div>
            <div className="flex items-center gap-4">
              <Link
                to={config.featured.primaryCta.href as "/"}
                onClick={onClose}
                className="rounded-full px-3 py-1.5 text-sm text-[#00D5D8] transition-all hover:bg-[#00D5D8]/15"
              >
                {config.featured.primaryCta.label}
              </Link>
              {config.featured.secondaryCta && (
                <Link
                  to={config.featured.secondaryCta.href as "/"}
                  onClick={onClose}
                  className="text-sm transition-colors"
                  style={{ color: "var(--myndlab-fg-muted)" }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--myndlab-fg-hover)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--myndlab-fg-muted)"; }}
                >
                  {config.featured.secondaryCta.label}
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* Bottom action strip */}
        <div className="flex items-center justify-between gap-6 pt-5">
          <div className="flex items-center gap-6">
            {config.bottomLinks.map((link) => (
              <Link
                key={link.href}
                to={link.href as "/"}
                onClick={onClose}
                className="text-sm transition-colors"
                style={{ color: "var(--myndlab-fg-muted)" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--myndlab-fg-hover)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--myndlab-fg-muted)"; }}
              >
                {link.label}
              </Link>
            ))}
          </div>
          {config.bottomNote && (
            <div className="text-[12.5px]" style={{ color: "var(--myndlab-fg-subtle)" }}>
              {config.bottomNote.text}{" "}
              <Link
                to={config.bottomNote.cta.href as "/"}
                onClick={onClose}
                className="text-[#00D5D8] transition-colors hover:opacity-80"
              >
                {config.bottomNote.cta.label}
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MarketingNav — absolute over the hero, transparent, minimal.
// ─────────────────────────────────────────────────────────────────────────────
export interface MarketingNavProps {
  onSignInClick?: () => void;
  onGetStartedClick?: () => void;
  /** Force a specific mega open (for dev preview). */
  forceOpen?: MegaKey | null;
}

export function MarketingNav({ onSignInClick, onGetStartedClick, forceOpen }: MarketingNavProps) {
  const [openMega, setOpenMega] = useState<MegaKey | null>(forceOpen ?? null);
  const navRef = useRef<HTMLElement>(null);
  const { theme, toggleTheme, lang, toggleLang } = useTheme();

  const closeMega = useCallback(() => setOpenMega(null), []);
  const toggleMega = useCallback((key: MegaKey) => {
    setOpenMega((prev) => (prev === key ? null : key));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeMega(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [closeMega]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!navRef.current) return;
      if (navRef.current.contains(e.target as Node)) return;
      closeMega();
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [closeMega]);

  useEffect(() => {
    if (forceOpen !== undefined) setOpenMega(forceOpen);
  }, [forceOpen]);

  const MEGA_MAP: Record<MegaKey, MegaConfig> = {
    features: FEATURES_MEGA,
    solutions: SOLUTIONS_MEGA,
  };

  const linkStyle = { color: "var(--myndlab-fg-muted)" } as const;
  const onLinkEnter = (e: React.MouseEvent<HTMLElement>) => {
    (e.currentTarget as HTMLElement).style.color = "var(--myndlab-fg-hover)";
  };
  const onLinkLeave = (e: React.MouseEvent<HTMLElement>) => {
    (e.currentTarget as HTMLElement).style.color = "var(--myndlab-fg-muted)";
  };

  return (
    <nav
      ref={navRef}
      className="absolute left-0 right-0 top-0 z-20"
    >
      {/* Nav bar */}
      <div className="flex items-center gap-8 px-6 py-4">
        {/* Logo — left */}
        <Link to="/" className="flex items-center" style={{ color: "var(--myndlab-fg)" }}>
          <MyndlabLogo className="h-6 w-auto" />
        </Link>

        {/* Nav items — left, immediately after logo */}
        <div className="flex items-center gap-6">
          <Link to="/about" className="text-sm transition-colors" style={linkStyle} onMouseEnter={onLinkEnter} onMouseLeave={onLinkLeave}>
            About
          </Link>
          <button
            type="button"
            onClick={() => toggleMega("features")}
            className="text-sm inline-flex items-center transition-colors"
            style={linkStyle}
            onMouseEnter={onLinkEnter}
            onMouseLeave={onLinkLeave}
          >
            Features
            <ChevronDown open={openMega === "features"} />
          </button>
          <button
            type="button"
            onClick={() => toggleMega("solutions")}
            className="text-sm inline-flex items-center transition-colors"
            style={linkStyle}
            onMouseEnter={onLinkEnter}
            onMouseLeave={onLinkLeave}
          >
            Solutions
            <ChevronDown open={openMega === "solutions"} />
          </button>
          <Link to="/pricing" className="text-sm transition-colors" style={linkStyle} onMouseEnter={onLinkEnter} onMouseLeave={onLinkLeave}>Pricing</Link>
          <Link to="/guide" className="text-sm transition-colors" style={linkStyle} onMouseEnter={onLinkEnter} onMouseLeave={onLinkLeave}>Guide</Link>
          <Link to="/enterprise" className="text-sm text-[#FF2FB3] transition-colors hover:opacity-80">
            Enterprise
          </Link>
        </div>

        {/* Right cluster — language, theme, auth */}
        <div className="ml-auto flex items-center gap-3">
          <button
            type="button"
            onClick={toggleLang}
            aria-label={lang === "en" ? "Switch to Arabic" : "Switch to English"}
            title={lang === "en" ? "Switch to Arabic" : "Switch to English"}
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[12px] transition-colors"
            style={linkStyle}
            onMouseEnter={onLinkEnter}
            onMouseLeave={onLinkLeave}
          >
            <GlobeIcon />
            <span className="font-medium tracking-wide">{lang === "en" ? "EN" : "ع"}</span>
          </button>

          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            className="inline-flex items-center justify-center rounded-full p-2 transition-colors"
            style={linkStyle}
            onMouseEnter={onLinkEnter}
            onMouseLeave={onLinkLeave}
          >
            {theme === "dark" ? <SunIcon /> : <MoonIcon />}
          </button>

          <button
            type="button"
            onClick={onSignInClick}
            className="text-sm transition-colors"
            style={linkStyle}
            onMouseEnter={onLinkEnter}
            onMouseLeave={onLinkLeave}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={onGetStartedClick}
            className="rounded-full px-3 py-1.5 text-sm text-[#00D5D8] transition-all hover:bg-[#00D5D8]/15"
          >
            Get started
          </button>
        </div>
      </div>

      {/* Full-width mega panel — anchored below nav, spans 100vw */}
      {openMega && (
        <div className="absolute left-0 right-0 top-full">
          <MegaPanel config={MEGA_MAP[openMega]} onClose={closeMega} />
        </div>
      )}
    </nav>
  );
}
