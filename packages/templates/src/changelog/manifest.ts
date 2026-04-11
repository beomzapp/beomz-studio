import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "changelog",
  name: "Changelog",
  description: "Public product changelog with version entries, categories, and date timeline",
  shell: "website",
  accentColor: "#6366F1",
  tags: [
    "changelog", "releases", "version", "updates", "product",
    "light-theme", "public", "timeline", "saas", "announcements", "history",
  ],
} as const satisfies TemplateManifest;
