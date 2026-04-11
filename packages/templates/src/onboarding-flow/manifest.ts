import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "onboarding-flow",
  name: "Onboarding Flow",
  description: "Multi-step user onboarding wizard with progress indicator and welcome experience",
  shell: "website",
  accentColor: "#6366F1",
  tags: [
    "onboarding", "wizard", "steps", "signup", "welcome", "flow",
    "business", "light-theme", "saas", "registration", "progress",
  ],
} as const satisfies TemplateManifest;
