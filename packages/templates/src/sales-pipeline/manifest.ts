import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "sales-pipeline",
  name: "Sales Pipeline",
  description: "Sales pipeline with deal stages, values, win probability, and forecast",
  shell: "dashboard",
  accentColor: "#3B82F6",
  tags: [
    "sales", "pipeline", "deals", "forecast", "revenue", "stages",
    "business", "light-theme", "crm", "funnel", "win-rate",
  ],
} as const satisfies TemplateManifest;
