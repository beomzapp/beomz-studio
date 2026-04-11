import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "recipe-manager",
  name: "Recipe Manager",
  description: "Recipe collection with ingredients, steps, favorites, and search",
  shell: "website",
  accentColor: "#EA580C",
  tags: [
    "recipe", "cooking", "food", "ingredients", "kitchen", "favorites",
    "collection", "search", "cards", "meal", "culinary",
  ],
} as const satisfies TemplateManifest;
