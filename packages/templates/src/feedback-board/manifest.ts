import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "feedback-board",
  name: "Feedback Board",
  description: "Customer feedback collection board with categories, upvotes, and admin responses",
  shell: "website",
  accentColor: "#6366F1",
  tags: [
    "feedback", "board", "suggestions", "upvote", "community",
    "light-theme", "product", "customers", "responses", "categories", "collect",
  ],
} as const satisfies TemplateManifest;
