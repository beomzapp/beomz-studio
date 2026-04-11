import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "grocery-list",
  name: "Grocery List",
  description: "Categorized grocery list with check-off, quantity, and aisle grouping",
  shell: "website",
  accentColor: "#16A34A",
  tags: [
    "grocery", "shopping", "list", "food", "market", "checklist",
    "categories", "quantity", "aisle", "kitchen", "household",
  ],
} as const satisfies TemplateManifest;
