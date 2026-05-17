import { useState } from "react";
import { Link } from "@tanstack/react-router";
import MyndlabLogo from "../../assets/myndlab-logo.svg?react";

const COLUMNS = [
  {
    heading: "PRODUCT",
    links: [
      { label: "Features", to: "/features" },
      { label: "Solutions", to: "/solutions" },
      { label: "Pricing", to: "/pricing" },
      { label: "Guide", to: "/guide" },
      { label: "FAQs", to: "/faq" },
    ],
  },
  {
    heading: "RESOURCES",
    links: [
      { label: "Discord", to: "https://discord.gg/myndlab", external: true },
      { label: "Reddit", to: "https://reddit.com/r/myndlab", external: true },
    ],
  },
  {
    heading: "COMPANY",
    links: [
      { label: "About", to: "/about" },
      { label: "Privacy", to: "/privacy" },
      { label: "Terms", to: "/terms" },
    ],
  },
] as const;

export function MarketingFooter() {
  const [email, setEmail] = useState("");

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("[MarketingFooter] newsletter subscribe:", email);
    setEmail("");
  };

  return (
    <footer
      style={{
        background: "#0a0a0a",
        borderTop: "1px solid rgba(255,255,255,0.08)",
        color: "#fff",
      }}
    >
      <div
        style={{
          maxWidth: 1440,
          margin: "0 auto",
          padding: "64px 40px",
        }}
      >
        {/* 4-column grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr) 320px",
            gap: 48,
          }}
        >
          {COLUMNS.map((col) => (
            <div key={col.heading}>
              <p
                style={{
                  fontSize: 11,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "rgba(255,255,255,0.35)",
                  fontWeight: 600,
                  marginBottom: 20,
                }}
              >
                {col.heading}
              </p>
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 12 }}>
                {col.links.map((link) => (
                  <li key={link.label}>
                    {"external" in link && link.external ? (
                      <a
                        href={link.to}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          fontSize: 14,
                          color: "rgba(255,255,255,0.55)",
                          textDecoration: "none",
                          transition: "color 0.15s ease",
                        }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "#fff"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.55)"; }}
                      >
                        {link.label}
                      </a>
                    ) : (
                      <Link
                        to={link.to as "/"}
                        style={{
                          fontSize: 14,
                          color: "rgba(255,255,255,0.55)",
                          textDecoration: "none",
                          transition: "color 0.15s ease",
                        }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "#fff"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.55)"; }}
                      >
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* Newsletter column */}
          <div>
            <p
              style={{
                fontSize: 11,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "rgba(255,255,255,0.35)",
                fontWeight: 600,
                marginBottom: 20,
              }}
            >
              STAY UPDATED
            </p>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginBottom: 14, lineHeight: 1.5 }}>
              Product updates, new features, and GCC launches — straight to your inbox.
            </p>
            <form onSubmit={handleSubscribe} style={{ display: "flex", gap: 8 }}>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
                style={{
                  flex: 1,
                  fontSize: 13,
                  padding: "9px 14px",
                  borderRadius: 8,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(255,255,255,0.05)",
                  color: "#fff",
                  outline: "none",
                  fontFamily: "inherit",
                  transition: "border-color 0.15s ease",
                }}
                onFocus={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "#00D5D8"; }}
                onBlur={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.12)"; }}
              />
              <button
                type="submit"
                style={{
                  background: "#00D5D8",
                  color: "#131313",
                  fontSize: 13,
                  fontWeight: 600,
                  padding: "9px 16px",
                  borderRadius: 8,
                  border: 0,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  flexShrink: 0,
                  transition: "background 0.15s ease",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#00BCC0"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "#00D5D8"; }}
              >
                Subscribe
              </button>
            </form>
          </div>
        </div>

        {/* Bottom rule */}
        <div
          style={{
            marginTop: 56,
            paddingTop: 28,
            borderTop: "1px solid rgba(255,255,255,0.08)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <MyndlabLogo style={{ height: 20, width: "auto", color: "rgba(255,255,255,0.5)" }} />
          </div>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>
            © 2026 Myndlab. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
