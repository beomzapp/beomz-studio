import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "roadmap-public",
  name: "Public Roadmap",
  description: "Public product roadmap with planned, in-progress, and shipped columns",
  shell: "website",
  accentColor: "#3B82F6",
  tags: [
    "roadmap", "public", "product", "planned", "shipped", "features",
    "light-theme", "saas", "transparency", "board", "community",
  ],
} as const satisfies TemplateManifest;
