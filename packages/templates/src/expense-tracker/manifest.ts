import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "expense-tracker",
  name: "Expense Tracker",
  description: "Categorized spending log with monthly total and category breakdown",
  shell: "dashboard",
  accentColor: "#E11D48",
  tags: [
    "expense", "spending", "category", "tracker", "finance", "receipts",
    "log", "money", "monthly", "budget", "personal",
  ],
} as const satisfies TemplateManifest;
