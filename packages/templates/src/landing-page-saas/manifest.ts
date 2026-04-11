import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "landing-page-saas",
  name: "SaaS Landing Page",
  description: "Marketing landing page with hero, features grid, pricing cards, testimonials, and CTA",
  shell: "website",
  accentColor: "#3B82F6",
  tags: [
    "landing", "saas", "marketing", "hero", "pricing", "features",
    "light-theme", "conversion", "testimonials", "cta", "startup",
  ],
} as const satisfies TemplateManifest;
