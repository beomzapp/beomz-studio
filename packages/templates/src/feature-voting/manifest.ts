import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "feature-voting",
  name: "Feature Voting",
  description: "Feature request board with upvoting, categories, and status tracking",
  shell: "website",
  accentColor: "#6366F1",
  tags: [
    "feature", "voting", "upvote", "requests", "roadmap", "community",
    "light-theme", "product", "feedback", "saas", "uservoice",
  ],
} as const satisfies TemplateManifest;
