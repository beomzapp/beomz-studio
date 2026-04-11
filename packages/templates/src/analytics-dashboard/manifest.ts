import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "analytics-dashboard",
  name: "Analytics Dashboard",
  description: "Web analytics dashboard with pageviews, sessions, top pages, and traffic sources",
  shell: "dashboard",
  accentColor: "#6366F1",
  tags: [
    "analytics", "dashboard", "pageviews", "sessions", "traffic",
    "business", "light-theme", "metrics", "conversion", "data", "charts",
  ],
} as const satisfies TemplateManifest;
