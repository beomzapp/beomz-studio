export interface MegaItem {
  /** Key into the ICONS map in MarketingNav.tsx (e.g. "mic", "palette"). */
  icon: string;
  title: string;
  blurb: string;
  href: string;
}

export interface MegaFeatured {
  badge: string;
  title: string;
  blurb: string;
  /** Key into the ILLUSTRATIONS map in MarketingNav.tsx (e.g. "voice", "enterprise"). */
  illustration?: string;
  primaryCta: { label: string; href: string };
  secondaryCta?: { label: string; href: string };
}

export interface MegaActionLink {
  label: string;
  href: string;
}

export interface MegaConfig {
  eyebrow: string;
  items: MegaItem[];
  featured: MegaFeatured;
  bottomLinks: MegaActionLink[];
  bottomNote?: { text: string; cta: { label: string; href: string } };
}

// Icons are inline SVG strings rendered via dangerouslySetInnerHTML in MarketingNav.tsx.
// Using string keys so config stays serialisable (no JSX import here).

export const FEATURES_MEGA: MegaConfig = {
  eyebrow: "Every feature",
  items: [
    {
      icon: "lightning",
      title: "AI Code Generation",
      blurb: "Full-stack apps from a single prompt",
      href: "/features#ai-code-generation",
    },
    {
      icon: "mic",
      title: "Voice Brainstorming",
      blurb: "Talk it out — AI shapes the prompt",
      href: "/features#voice-brainstorming",
    },
    {
      icon: "palette",
      title: "Design DNA",
      blurb: "Set brand once, every app inherits",
      href: "/features#design-dna",
    },
    {
      icon: "history",
      title: "Version History",
      blurb: "Every prompt a snapshot, restore anytime",
      href: "/features#version-history",
    },
    {
      icon: "stack",
      title: "Full Stack Output",
      blurb: "10+ frontend × backend stack combos",
      href: "/features#full-stack",
    },
    {
      icon: "globe",
      title: "GCC & Arabic-First",
      blurb: "Sovereign infra, native RTL support",
      href: "/features#gcc",
    },
    {
      icon: "export",
      title: "Export & Deploy",
      blurb: "Your code, your servers, no lock-in",
      href: "/features#export",
    },
  ],
  featured: {
    badge: "New",
    title: "Voice Brainstorming, hands free.",
    blurb:
      "Talk through your idea like you're describing it to a colleague. Myndlab listens, asks the right follow-ups, and turns it into a build prompt automatically.",
    illustration: "voice",
    primaryCta: { label: "Try voice", href: "/features#voice-brainstorming" },
    secondaryCta: { label: "Watch demo", href: "/features#demo" },
  },
  bottomLinks: [
    { label: "See all features", href: "/features" },
    { label: "Compare with v0 / Lovable", href: "/features#compare" },
    { label: "Changelog", href: "/features#changelog" },
  ],
  bottomNote: {
    text: "New: Version diff view.",
    cta: { label: "Read more →", href: "/features#version-diff" },
  },
};

export const SOLUTIONS_MEGA: MegaConfig = {
  eyebrow: "By use case",
  items: [
    {
      icon: "saas",
      title: "SaaS MVP",
      blurb: "Investor-ready demo in hours",
      href: "/solutions#saas-mvp",
    },
    {
      icon: "tools",
      title: "Internal Tools",
      blurb: "Admin panels, ops dashboards",
      href: "/solutions#internal-tools",
    },
    {
      icon: "agency",
      title: "Agencies & Freelancers",
      blurb: "Prototype ready before the meeting ends",
      href: "/solutions#agencies",
    },
    {
      icon: "education",
      title: "Learning & Education",
      blurb: "Learn by building real apps",
      href: "/solutions#education",
    },
    {
      icon: "prototype",
      title: "Rapid Prototyping",
      blurb: "Five versions of an idea in an afternoon",
      href: "/solutions#prototyping",
    },
  ],
  featured: {
    badge: "Enterprise",
    title: "Built for regulated industries.",
    blurb:
      "GCC sovereign infrastructure, ISO 9001 + 27001 certified, custom deployment options. The platform regulated industries can build on.",
    illustration: "enterprise",
    primaryCta: { label: "Book a demo", href: "/enterprise" },
    secondaryCta: { label: "Read case study", href: "/enterprise#case-study" },
  },
  bottomLinks: [
    { label: "All solutions", href: "/solutions" },
    { label: "Customer stories", href: "/solutions#stories" },
    { label: "Partner program", href: "/solutions#partners" },
  ],
  bottomNote: {
    text: "Building in the GCC?",
    cta: { label: "Talk to a regional team →", href: "/enterprise#gcc" },
  },
};
