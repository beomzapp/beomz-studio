import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "job-board",
  name: "Job Board",
  description: "Job listings with search, filters, and application tracking",
  shell: "website",
  accentColor: "#2563EB",
  tags: [
    "job", "career", "listing", "apply", "hire", "recruit",
    "talent", "openings", "search", "filter", "board",
  ],
} as const satisfies TemplateManifest;
