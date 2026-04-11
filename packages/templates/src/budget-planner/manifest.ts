import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "budget-planner",
  name: "Budget Planner",
  description: "Income vs expenses tracker with categories and running balance",
  shell: "dashboard",
  accentColor: "#15803D",
  tags: [
    "budget", "income", "expense", "savings", "finance", "money", "monthly",
    "personal", "category", "balance", "tracker", "dashboard",
  ],
} as const satisfies TemplateManifest;
