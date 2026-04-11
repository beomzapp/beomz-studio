import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "finance-dashboard",
  name: "Finance Dashboard",
  description: "Personal finance overview with spending breakdown, income chart, and net worth",
  shell: "dashboard",
  accentColor: "#059669",
  tags: [
    "finance", "spending", "income", "dashboard", "wealth", "budget",
    "overview", "net-worth", "charts", "money", "personal",
  ],
} as const satisfies TemplateManifest;
