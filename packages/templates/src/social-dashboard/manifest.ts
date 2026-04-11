import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "social-dashboard",
  name: "Social Dashboard",
  description: "Social media analytics with follower metrics, post performance, and platform breakdown",
  shell: "dashboard",
  accentColor: "#F97316",
  tags: [
    "social", "dashboard", "followers", "analytics", "engagement",
    "dark-theme", "creative", "metrics", "instagram", "performance", "content",
  ],
} as const satisfies TemplateManifest;
