import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { MarketingPageLayout } from "../../../components/marketing/MarketingPageLayout";
import {
  PageHero,
  SectionRow,
  FinalCtaSection,
} from "../../../components/marketing/sections";
import { AuthModal } from "../../../components/auth/AuthModal";

const PLACEHOLDER_CARD_STYLE: React.CSSProperties = {
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
};

function VisCard({ label }: { label: string }) {
  return <div style={PLACEHOLDER_CARD_STYLE}>[{label}]</div>;
}

export function SolutionsPage() {
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
          eyebrow={{ variant: "cyan", label: "Real Solutions, Real Results" }}
          h1={
            <>
              Built for{" "}
              <span style={{ color: "#00D5D8" }}>your workflow.</span>
            </>
          }
          sub="Whether you're launching a startup, building for enterprise, or shipping for clients — Myndlab adapts to how you work."
          primaryCta={{ label: "Get started", onClick: openSignup }}
          secondaryCta={{
            label: "Explore features ↗",
            onClick: () => void navigate({ to: "/features" }),
          }}
          metrics={[
            { value: "5+", label: "Workflow types" },
            { value: "Minutes", label: "First working app" },
            { value: "100%", label: "Code you own" },
          ]}
          showScrollCue
        />

        {/* 2. Section 1 — SaaS MVP */}
        <SectionRow
          eyebrow={{ variant: "cyan", label: "Use case 01 · SaaS MVP" }}
          h2={
            <>
              From idea to{" "}
              <span style={{ color: "#00D5D8" }}>investor-ready demo.</span>
            </>
          }
          body="Describe your core features — auth, dashboards, data — and Myndlab generates a complete, working SaaS prototype. Ship a real product to investors, not slides."
          checks={[
            "Full auth + user management generated",
            "Responsive SaaS dashboard out of the box",
            "Clean code investors' engineers can audit",
            "One-click deploy to your own infrastructure",
          ]}
          visual={<VisCard label="SaaS dashboard mockup" />}
        />

        {/* 3. Section 2 — Internal Tools (reverse) */}
        <SectionRow
          reverse
          eyebrow={{ variant: "cyan", label: "Use case 02 · Internal Tools" }}
          h2={
            <>
              Build what your team{" "}
              <span style={{ color: "#00D5D8" }}>actually needs.</span>
            </>
          }
          body="Admin panels, inventory trackers, approval flows, ops dashboards — built in hours not months. Describe it in plain English, iterate on feedback instantly."
          checks={[
            "Data tables, filters, and exports auto-generated",
            "Role-based access control out of the box",
            "Iterate on feedback in seconds, not sprints",
            "Runs on your own infra — no SaaS dependency",
          ]}
          visual={<VisCard label="Inventory dashboard mockup" />}
        />

        {/* 4. Section 3 — Agencies & Freelancers */}
        <SectionRow
          eyebrow={{ variant: "cyan", label: "Use case 03 · Agencies & Freelancers" }}
          h2={
            <>
              Deliver faster.{" "}
              <span style={{ color: "#00D5D8" }}>Charge smarter.</span>
            </>
          }
          body="Show clients a working prototype in the first meeting — not a mockup. Design DNA locks in their brand so every iteration looks polished. Export clean code your developers can take over."
          checks={[
            "First prototype ready before the meeting ends",
            "Design DNA: brand colours & type in every build",
            "Export clean React — hand off to any dev team",
            "Shareable preview links for client feedback",
          ]}
          visual={<VisCard label="Design DNA brand palette" />}
        />

        {/* 5. Section 4 — Learning & Education (reverse) */}
        <SectionRow
          reverse
          eyebrow={{ variant: "cyan", label: "Use case 04 · Learning & Education" }}
          h2={
            <>
              Learn by building{" "}
              <span style={{ color: "#00D5D8" }}>real apps.</span>
            </>
          }
          body="Describe what you want to build, see clean production-grade code, then study it. Hover any line to understand what it does. It's like pair-programming with a senior engineer."
          checks={[
            "Industry-standard React patterns, every time",
            "QA reports teach accessibility & performance",
            "Export and modify locally — learn by doing",
            "Hover annotations explain every code decision",
          ]}
          visual={<VisCard label="Hover-to-learn code mockup" />}
        />

        {/* 6. Section 5 — Rapid Prototyping */}
        <SectionRow
          eyebrow={{ variant: "cyan", label: "Use case 05 · Rapid Prototyping" }}
          h2={
            <>
              Test ideas before{" "}
              <span style={{ color: "#00D5D8" }}>you commit.</span>
            </>
          }
          body="Build five versions of your idea in an afternoon. Compare layouts, flows, and approaches — on working apps, not wireframes. Version history means you never lose a direction."
          checks={[
            "Generate multiple variants from one prompt",
            "Switch versions instantly — nothing is lost",
            "Share working prototypes for stakeholder sign-off",
            "Best version becomes your production foundation",
          ]}
          visual={<VisCard label="Version history timeline" />}
        />

        {/* 7. Final CTA */}
        <FinalCtaSection
          variant="cyan"
          h2={
            <>
              Ready to start{" "}
              <span style={{ color: "#00D5D8" }}>building?</span>
            </>
          }
          sub="Join thousands of builders who ship faster with Myndlab. Sign up free — no credit card required."
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
