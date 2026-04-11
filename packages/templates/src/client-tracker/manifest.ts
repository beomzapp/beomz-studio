import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "client-tracker",
  name: "Client Tracker",
  description: "Freelance client manager with projects, invoices, and revenue tracking",
  shell: "dashboard",
  accentColor: "#0891B2",
  tags: [
    "client", "freelance", "projects", "invoices", "revenue",
    "agency", "tracker", "business", "pipeline", "crm", "billing",
  ],
} as const satisfies TemplateManifest;
