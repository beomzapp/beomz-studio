import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowUpRight, History, Layers, Mic, Palette, Zap } from "lucide-react";
import { MarketingPageLayout } from "../../../components/marketing/MarketingPageLayout";
import {
  PageHero,
  BentoGrid,
  type Tile,
  SectionRow,
  CodeMock,
  FinalCtaSection,
} from "../../../components/marketing/sections";
import { AuthModal } from "../../../components/auth/AuthModal";

const ICON_PROPS = { size: 22, strokeWidth: 1.5 } as const;

// Tile order matches the locked mockup (apps/myndlab-web/public/mockup-bento.html):
// Row 1: [AI Code CYAN] [Voice dark/cyan-icon] [Design DNA YELLOW]
// Row 2: [Full Stack dark/magenta-icon] [Version History MAGENTA] [Export dark/yellow-icon]
const BENTO_TILES: Tile[] = [
  {
    icon: <Zap {...ICON_PROPS} />,
    title: "AI Code Generation",
    body: "Describe your app in plain English. Myndlab generates the complete full-stack application — frontend, API, database schema, auth — all in one shot.",
    variant: "cyan",
  },
  {
    icon: <Mic {...ICON_PROPS} />,
    title: "Voice Brainstorming",
    body: "Talk through your idea — Myndlab listens, asks the right follow-ups, and shapes the prompt.",
    variant: "dark",
    iconAccent: "cyan",
  },
  {
    icon: <Palette {...ICON_PROPS} />,
    title: "Design DNA",
    body: "Set your brand once — every app inherits the system.",
    variant: "yellow",
  },
  {
    icon: <Layers {...ICON_PROPS} />,
    title: "Full Stack Output",
    body: "10+ frontend × backend stack combinations. Frontend, API, DB schema, auth — all generated together.",
    variant: "dark",
    iconAccent: "magenta",
  },
  {
    icon: <History {...ICON_PROPS} />,
    title: "Version History",
    body: "Every prompt is a snapshot. Restore anytime.",
    variant: "magenta",
  },
  {
    icon: <ArrowUpRight {...ICON_PROPS} />,
    title: "Export & Deploy",
    body: "Your code, your repo, any server. Zero lock-in.",
    variant: "dark",
    iconAccent: "yellow",
  },
];

const CODE_MOCK_LINES = [
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

export function FeaturesPage() {
  const navigate = useNavigate();
  const [showAuthModal, setShowAuthModal] = useState(false);

  function openSignup() {
    setShowAuthModal(true);
  }

  return (
    <MarketingPageLayout hideCta>
      <div style={{ background: "#131313" }}>
        {/* 1. Hero */}
        <PageHero
          variant="cyan"
          pill={{ kind: "new", badge: "New", text: "Voice brainstorming is live", arrow: true }}
          h1={
            <>
              Built to build{" "}
              <span style={{ color: "#00D5D8" }}>differently.</span>
            </>
          }
          sub="Every feature purpose-built so you ship production-ready apps faster — without the lock-in, without the boilerplate."
          primaryCta={{ label: "Get started", onClick: openSignup }}
          secondaryCta={{ label: "See it in action ↗" }}
          metrics={[
            { value: "10+", label: "Frameworks" },
            { value: "Minutes", label: "From prompt" },
            { value: "100%", label: "Code you own" },
          ]}
          showScrollCue
        />

        {/* 2. Bento grid */}
        <BentoGrid tiles={BENTO_TILES} />

        {/* 3. Section row 1 — AI Code Generation */}
        <SectionRow
          eyebrow={{ variant: "cyan", label: "Feature 01 · Generation" }}
          h2={
            <>
              From prompt to{" "}
              <span style={{ color: "#00D5D8" }}>working app in minutes.</span>
            </>
          }
          body="Describe your app in plain English. Myndlab generates a complete, structured full-stack application — frontend, API, database schema, auth — all in one shot. Clean TypeScript, zero boilerplate."
          checks={[
            "Generates frontend + backend simultaneously",
            "React, Next.js, Vue, Angular + 10 more stacks",
            "Auto-wires routing, state, and API calls",
            "Runs & previews instantly — no setup required",
          ]}
          visual={
            <CodeMock
              filename="App.tsx — generating…"
              liveLabel
              lines={CODE_MOCK_LINES}
            />
          }
        />

        {/* 4. Section row 2 — Full Stack Output (reverse) */}
        <SectionRow
          reverse
          eyebrow={{ variant: "cyan", label: "Feature 02 · Stacks" }}
          h2={
            <>
              Every layer, every stack.{" "}
              <span style={{ color: "#00D5D8" }}>Zero lock-in.</span>
            </>
          }
          body="Choose your stack and Myndlab generates all four layers in one pass. Not wrappers, not templates — actual production-grade code structured the way a senior engineer would write it."
          checks={[
            "10+ frontend + backend framework combos",
            "Real DB schemas with migrations",
            "Auth flows, middleware, and error handling",
            "Export to your repo, deploy to any server",
          ]}
          visual={
            <div
              style={{
                position: "relative",
                padding: 32,
                minHeight: 360,
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
              [Stack matrix visual]
            </div>
          }
        />

        {/* 5. Final CTA */}
        <FinalCtaSection
          variant="cyan"
          h2={
            <>
              Stop shipping slow.{" "}
              <span style={{ color: "#00D5D8" }}>Start building differently.</span>
            </>
          }
          sub="Every feature on this page is live right now. Sign up free and build your first app in minutes."
          primaryCta={{ label: "Get started", onClick: openSignup }}
        />

        {/* Bottom padding */}
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
