import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "wine-cellar",
  name: "Wine Cellar",
  description: "Wine collection log with ratings, tasting notes, and cellar stats",
  shell: "website",
  accentColor: "#881337",
  tags: [
    "wine", "cellar", "rating", "tasting", "notes", "bottle",
    "vineyard", "sommelier", "collection", "red", "white",
  ],
} as const satisfies TemplateManifest;
