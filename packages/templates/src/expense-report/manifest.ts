import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "expense-report",
  name: "Expense Report",
  description: "Business expense report with receipt entries, categories, approval status, and totals",
  shell: "dashboard",
  accentColor: "#0891B2",
  tags: [
    "expense", "report", "business", "receipts", "reimbursement",
    "categories", "approval", "travel", "corporate", "finance", "submit",
  ],
} as const satisfies TemplateManifest;
