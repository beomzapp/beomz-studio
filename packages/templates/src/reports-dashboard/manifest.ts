import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "reports-dashboard",
  name: "Reports Dashboard",
  description: "Business reports dashboard with KPI cards, charts, data tables, and date filtering",
  shell: "dashboard",
  accentColor: "#3B82F6",
  tags: [
    "reports", "dashboard", "kpi", "charts", "tables", "data",
    "business", "light-theme", "analytics", "metrics", "filtering",
  ],
} as const satisfies TemplateManifest;
