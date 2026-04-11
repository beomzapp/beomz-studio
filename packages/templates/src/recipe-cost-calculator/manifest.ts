import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "recipe-cost-calculator",
  name: "Recipe Cost Calculator",
  description: "Calculate recipe cost per serving with ingredient prices and portion scaling",
  shell: "website",
  accentColor: "#EA580C",
  tags: [
    "recipe", "cost", "calculator", "cooking", "ingredients", "serving",
    "food", "budget", "kitchen", "meal-prep", "pricing",
  ],
} as const satisfies TemplateManifest;
