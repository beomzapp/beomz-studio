import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "crm-dashboard",
  name: "CRM Dashboard",
  description: "Customer relationship management dashboard with pipeline, contacts, and deal tracking",
  shell: "dashboard",
  accentColor: "#3B82F6",
  tags: [
    "crm", "dashboard", "pipeline", "contacts", "deals", "sales",
    "business", "light-theme", "customers", "revenue", "management",
  ],
} as const satisfies TemplateManifest;
