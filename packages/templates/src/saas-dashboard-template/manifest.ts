import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "saas-dashboard-template",
  name: "SaaS Dashboard",
  description: "Business metrics dashboard with KPI cards, activity feed, and user table",
  shell: "dashboard",
  accentColor: "#1D4ED8",
  tags: [
    "saas", "dashboard", "mrr", "revenue", "analytics", "business", "metrics",
    "kpi", "charts", "table", "users", "b2b",
  ],
} as const satisfies TemplateManifest;
