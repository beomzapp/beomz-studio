/**
 * MarketingSectionsPage — BEO-827
 *
 * DEV-ONLY preview route for Section Kit v2 components.
 * Accessible at /dev/marketing-sections in development builds, or in
 * production when localStorage "beomz:devMode" === "true".
 */

import { ArrowUpRight, History, Layers, Mic, Palette, Zap } from "lucide-react";
import {
  PrismBeams,
  PageHero,
  Eyebrow,
  CheckList,
  SectionRow,
  BentoGrid,
  type Tile,
  CodeMock,
  FinalCtaSection,
  PricingColumns,
  type PriceTier,
} from "../../../components/marketing/sections";

const BENTO_ICON_PROPS = { size: 22, strokeWidth: 1.5 } as const;

function isDevPreviewEnabled(): boolean {
  if (import.meta.env.DEV) return true;
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem("beomz:devMode") === "true";
  } catch {
    return false;
  }
}

function SectionLabel({ name, variant }: { name: string; variant?: string }) {
  return (
    <p
      style={{
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: "rgba(255,255,255,0.30)",
        marginBottom: 12,
        fontFamily: "ui-monospace, monospace",
      }}
    >
      {name}{variant ? ` · ${variant}` : ""}
    </p>
  );
}

function PreviewBlock({
  name,
  variant,
  children,
  dark = false,
  height,
}: {
  name: string;
  variant?: string;
  children: React.ReactNode;
  dark?: boolean;
  height?: number;
}) {
  return (
    <div style={{ marginBottom: 40 }}>
      <SectionLabel name={name} variant={variant} />
      <div
        style={{
          background: dark ? "#131313" : "#1a1a1a",
          border: "1px solid rgba(255,255,255,0.10)",
          borderRadius: 12,
          overflow: "hidden",
          height,
          position: "relative",
        }}
      >
        {children}
      </div>
    </div>
  );
}

const DEMO_CHECKS = [
  "First checklist item here",
  "Second item with a longer description",
  "Third item demonstrating the pattern",
  "Fourth item — last one in the list",
];

const DEMO_CODE_LINES = [
  { ln: 1,  tokens: [{ kind: "com" as const, text: "// Generating CRM app…" }] },
  { ln: 2,  tokens: [{ kind: "kw" as const, text: "import" }, { kind: "txt" as const, text: " React " }, { kind: "kw" as const, text: "from" }, { kind: "txt" as const, text: " " }, { kind: "str" as const, text: '"react"' }, { kind: "txt" as const, text: ";" }] },
  { ln: 3,  tokens: [{ kind: "kw" as const, text: "import" }, { kind: "txt" as const, text: " { supabase } " }, { kind: "kw" as const, text: "from" }, { kind: "txt" as const, text: " " }, { kind: "str" as const, text: '"./lib/db"' }, { kind: "txt" as const, text: ";" }] },
  { ln: 4,  tokens: [{ kind: "txt" as const, text: " " }] },
  { ln: 5,  tokens: [{ kind: "kw" as const, text: "export const" }, { kind: "txt" as const, text: " Dashboard = () => {" }] },
  { ln: 6,  tokens: [{ kind: "txt" as const, text: "  " }, { kind: "kw" as const, text: "const" }, { kind: "txt" as const, text: " [contacts, setContacts] = useState<Contact[]>([]);" }] },
  { ln: 7,  tokens: [{ kind: "txt" as const, text: " " }] },
  { ln: 8,  tokens: [{ kind: "txt" as const, text: "  useEffect(() => {" }] },
  { ln: 9,  tokens: [{ kind: "txt" as const, text: "    supabase." }, { kind: "kw" as const, text: "from" }, { kind: "txt" as const, text: "(" }, { kind: "str" as const, text: "'contacts'" }, { kind: "txt" as const, text: ").select(" }, { kind: "str" as const, text: "'*'" }, { kind: "txt" as const, text: ");" }] },
  { ln: 10, tokens: [{ kind: "txt" as const, text: "  }, []);" }] },
  { ln: 11, tokens: [{ kind: "txt" as const, text: " " }] },
  { ln: 12, tokens: [{ kind: "txt" as const, text: "  " }, { kind: "kw" as const, text: "return" }, { kind: "txt" as const, text: " <Dashboard data={contacts} />;" }] },
];

const BENTO_TILES: Tile[] = [
  { icon: <Zap          {...BENTO_ICON_PROPS} />, title: "AI Code Generation",   body: "Describe your app in plain English. Myndlab generates the complete full-stack application — frontend, API, database schema, auth — all in one shot.", variant: "cyan" },
  { icon: <Mic          {...BENTO_ICON_PROPS} />, title: "Voice Brainstorming",  body: "Talk through your idea — Myndlab listens, asks the right follow-ups, and shapes the prompt.", variant: "dark", iconAccent: "cyan" },
  { icon: <Palette      {...BENTO_ICON_PROPS} />, title: "Design DNA",           body: "Set your brand once — every app inherits the system.", variant: "yellow" },
  { icon: <Layers       {...BENTO_ICON_PROPS} />, title: "Full Stack Output",    body: "10+ frontend × backend stack combinations. Frontend, API, DB schema, auth — all generated together.", variant: "dark", iconAccent: "magenta" },
  { icon: <History      {...BENTO_ICON_PROPS} />, title: "Version History",      body: "Every prompt is a snapshot. Restore anytime.", variant: "magenta" },
  { icon: <ArrowUpRight {...BENTO_ICON_PROPS} />, title: "Export & Deploy",      body: "Your code, your repo, any server. Zero lock-in.", variant: "dark", iconAccent: "yellow" },
];

const DEMO_TIERS: PriceTier[] = [
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
      { text: "Voice chat with AI", included: false },
      { text: "Code export & download", included: false },
      { text: "GitHub sync & publish", included: false },
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
      { text: "Voice chat with AI" },
      { text: "Priority build queue" },
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
      { text: "Audit logs + advanced analytics" },
    ],
    cta: { label: "Book a demo", variant: "magenta-outline" },
  },
];

const PLACEHOLDER_VISUAL = (
  <div
    style={{
      minHeight: 320,
      background: "rgba(255,255,255,0.04)",
      border: "1px solid rgba(255,255,255,0.10)",
      borderRadius: 20,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: "rgba(255,255,255,0.30)",
      fontSize: 13,
      letterSpacing: "0.06em",
      textTransform: "uppercase",
    }}
  >
    [placeholder visual]
  </div>
);

export function MarketingSectionsPage() {
  if (!isDevPreviewEnabled()) return null;

  return (
    <div style={{ background: "#0d0d0d", minHeight: "100vh", color: "#fff" }}>
      {/* Sticky nav */}
      <nav
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          background: "rgba(13,13,13,0.95)",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          backdropFilter: "blur(12px)",
          padding: "8px 24px",
          display: "flex",
          gap: 4,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.30)",
            marginRight: 8,
          }}
        >
          Section Kit v2
        </span>
        {[
          "#prism-beams",
          "#page-hero",
          "#eyebrow",
          "#checklist",
          "#section-row",
          "#bento-grid",
          "#code-mock",
          "#final-cta",
          "#pricing-columns",
        ].map((href) => (
          <a
            key={href}
            href={href}
            style={{
              padding: "4px 10px",
              borderRadius: 999,
              fontSize: 12,
              color: "rgba(255,255,255,0.50)",
              textDecoration: "none",
              transition: "background 150ms, color 150ms",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)";
              (e.currentTarget as HTMLElement).style.color = "#fff";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = "transparent";
              (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.50)";
            }}
          >
            {href.replace("#", "")}
          </a>
        ))}
      </nav>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "40px 40px 120px" }}>
        <div style={{ marginBottom: 40 }}>
          <h1 style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.02em", marginBottom: 6 }}>
            Section Kit v2 — dev preview
          </h1>
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.50)" }}>
            BEO-827 · BEO-831 · 9 components · All states
          </p>
        </div>

        {/* ── 1. PrismBeams ────────────────────────────────────────── */}
        <section id="prism-beams" style={{ marginBottom: 64 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 24, letterSpacing: "-0.01em" }}>
            1 · PrismBeams
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <PreviewBlock name="PrismBeams" variant="cyan" height={360} dark>
              <div style={{ position: "relative", height: 360, overflow: "hidden" }}>
                <PrismBeams variant="cyan" />
              </div>
            </PreviewBlock>
            <PreviewBlock name="PrismBeams" variant="magenta" height={360} dark>
              <div style={{ position: "relative", height: 360, overflow: "hidden" }}>
                <PrismBeams variant="magenta" />
              </div>
            </PreviewBlock>
          </div>
        </section>

        {/* ── 2. PageHero ─────────────────────────────────────────── */}
        <section id="page-hero" style={{ marginBottom: 64 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 24, letterSpacing: "-0.01em" }}>
            2 · PageHero
          </h2>
          <PreviewBlock name="PageHero" variant="cyan — full height" dark>
            <PageHero
              variant="cyan"
              pill={{ kind: "new", badge: "New", text: "Voice brainstorming is live", arrow: true }}
              h1={<>Built to build <span style={{ color: "#00D5D8" }}>differently.</span></>}
              sub="Every feature purpose-built so you ship production-ready apps faster — without the lock-in, without the boilerplate."
              primaryCta={{ label: "Get started" }}
              secondaryCta={{ label: "See it in action ↗" }}
              metrics={[
                { value: "10+", label: "Frameworks" },
                { value: "Minutes", label: "From prompt" },
                { value: "100%", label: "Code you own" },
              ]}
              showScrollCue
            />
          </PreviewBlock>
          <PreviewBlock name="PageHero" variant="magenta — compressed 80vh" dark>
            <div style={{ maxHeight: "80vh", overflow: "hidden" }}>
              <PageHero
                variant="magenta"
                pill={{ kind: "info", badge: "Enterprise", text: "Sovereign cloud, ISO-certified" }}
                h1={<>Built for <span style={{ color: "#FF2FB3" }}>regulated industries.</span></>}
                sub="GCC sovereign infrastructure. ISO 9001 + 27001. Custom deployment options."
                primaryCta={{ label: "Book a demo" }}
                secondaryCta={{ label: "Read case study ↗" }}
                metrics={[
                  { value: "ISO 9001", label: "Quality" },
                  { value: "ISO 27001", label: "Security" },
                  { value: "GCC", label: "Sovereign" },
                ]}
                showScrollCue
              />
            </div>
          </PreviewBlock>
        </section>

        {/* ── 3. Eyebrow ──────────────────────────────────────────── */}
        <section id="eyebrow" style={{ marginBottom: 64 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 24, letterSpacing: "-0.01em" }}>
            3 · Eyebrow
          </h2>
          <PreviewBlock name="Eyebrow" variant="cyan + magenta">
            <div style={{ padding: 32, display: "flex", flexDirection: "column", gap: 20 }}>
              <div>
                <SectionLabel name="cyan variant" />
                <Eyebrow variant="cyan">Feature 01 · Generation</Eyebrow>
                <Eyebrow variant="cyan">Section heading label</Eyebrow>
                <Eyebrow variant="cyan">Sovereign Security</Eyebrow>
              </div>
              <div>
                <SectionLabel name="magenta variant" />
                <Eyebrow variant="magenta">Enterprise · Compliance</Eyebrow>
                <Eyebrow variant="magenta">Arabic-First · RTL</Eyebrow>
                <Eyebrow variant="magenta">Feature 03 · Deployment</Eyebrow>
              </div>
            </div>
          </PreviewBlock>
        </section>

        {/* ── 4. CheckList ────────────────────────────────────────── */}
        <section id="checklist" style={{ marginBottom: 64 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 24, letterSpacing: "-0.01em" }}>
            4 · CheckList
          </h2>
          <PreviewBlock name="CheckList" variant="cyan + magenta">
            <div style={{ padding: 32, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32 }}>
              <div>
                <SectionLabel name="cyan variant" />
                <CheckList variant="cyan" items={DEMO_CHECKS} />
              </div>
              <div>
                <SectionLabel name="magenta variant" />
                <CheckList variant="magenta" items={DEMO_CHECKS} />
              </div>
            </div>
          </PreviewBlock>
        </section>

        {/* ── 5. SectionRow ───────────────────────────────────────── */}
        <section id="section-row" style={{ marginBottom: 64 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 24, letterSpacing: "-0.01em" }}>
            5 · SectionRow
          </h2>
          <div
            style={{
              background: "#131313",
              border: "1px solid rgba(255,255,255,0.10)",
              borderRadius: 12,
              overflow: "hidden",
              marginBottom: 16,
            }}
          >
            <SectionLabel name="standard (text left, visual right)" />
            <SectionRow
              eyebrow={{ variant: "cyan", label: "Feature 01 · Generation" }}
              h2={<>From prompt to <span style={{ color: "#00D5D8" }}>working app in minutes.</span></>}
              body="Describe your app in plain English. Myndlab generates a complete full-stack application in one shot."
              checks={["Generates frontend + backend simultaneously", "React, Next.js, Vue + 10 more", "Auto-wires routing, state, and API calls"]}
              visual={PLACEHOLDER_VISUAL}
            />
          </div>
          <div
            style={{
              background: "#131313",
              border: "1px solid rgba(255,255,255,0.10)",
              borderRadius: 12,
              overflow: "hidden",
            }}
          >
            <SectionLabel name="reverse (text right, visual left)" />
            <SectionRow
              reverse
              eyebrow={{ variant: "cyan", label: "Feature 02 · Stacks" }}
              h2={<>Every layer, every stack. <span style={{ color: "#00D5D8" }}>Zero lock-in.</span></>}
              body="Choose your stack and Myndlab generates all four layers in one pass."
              checks={["10+ framework combos", "Real DB schemas with migrations", "Export to any server"]}
              visual={PLACEHOLDER_VISUAL}
            />
          </div>
        </section>

        {/* ── 6. BentoGrid ────────────────────────────────────────── */}
        <section id="bento-grid" style={{ marginBottom: 64 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 24, letterSpacing: "-0.01em" }}>
            6 · BentoGrid — full 6-tile
          </h2>
          <div
            style={{
              background: "#131313",
              border: "1px solid rgba(255,255,255,0.10)",
              borderRadius: 12,
              overflow: "hidden",
              paddingBottom: 40,
            }}
          >
            <BentoGrid tiles={BENTO_TILES} />
          </div>
        </section>

        {/* ── 7. CodeMock ─────────────────────────────────────────── */}
        <section id="code-mock" style={{ marginBottom: 64 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 24, letterSpacing: "-0.01em" }}>
            7 · CodeMock
          </h2>
          <PreviewBlock name="CodeMock" variant="App.tsx snippet · liveLabel=true" dark>
            <div style={{ padding: 32, maxWidth: 620 }}>
              <CodeMock
                filename="App.tsx — generating…"
                liveLabel
                lines={DEMO_CODE_LINES}
              />
            </div>
          </PreviewBlock>
        </section>

        {/* ── 9. PricingColumns ───────────────────────────────────── */}
        <section id="pricing-columns" style={{ marginBottom: 64 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 24, letterSpacing: "-0.01em" }}>
            9 · PricingColumns
          </h2>
          <div
            style={{
              background: "#131313",
              border: "1px solid rgba(255,255,255,0.10)",
              borderRadius: 12,
              overflow: "hidden",
              paddingTop: 48,
              paddingBottom: 64,
            }}
          >
            <SectionLabel name="3-tier grid · Basic / Pro (featured) / Enterprise" />
            <PricingColumns
              tiers={DEMO_TIERS}
              footnote="Auto-fix attempts never count against your credits. You only pay for what you ask for."
            />
          </div>
        </section>

        {/* ── 8. FinalCtaSection ──────────────────────────────────── */}
        <section id="final-cta" style={{ marginBottom: 64 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 24, letterSpacing: "-0.01em" }}>
            8 · FinalCtaSection
          </h2>
          <div
            style={{
              background: "#131313",
              border: "1px solid rgba(255,255,255,0.10)",
              borderRadius: 12,
              overflow: "hidden",
              marginBottom: 16,
            }}
          >
            <SectionLabel name="cyan variant" />
            <FinalCtaSection
              variant="cyan"
              h2={<>Stop shipping slow. <span style={{ color: "#00D5D8" }}>Start building differently.</span></>}
              sub="Every feature on this page is live right now. Sign up free and build your first app in minutes."
              primaryCta={{ label: "Get started" }}
            />
          </div>
          <div
            style={{
              background: "#131313",
              border: "1px solid rgba(255,255,255,0.10)",
              borderRadius: 12,
              overflow: "hidden",
            }}
          >
            <SectionLabel name="magenta variant" />
            <FinalCtaSection
              variant="magenta"
              h2={<>Talk to the <span style={{ color: "#FF2FB3" }}>regional team.</span></>}
              sub="Custom deployment, dedicated support, and onboarding services for enterprise teams across the GCC."
              primaryCta={{ label: "Book a demo" }}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
