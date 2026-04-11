import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "personal-crm",
  name: "Personal CRM",
  description: "Contact manager with notes, follow-up reminders, and relationship tags",
  shell: "dashboard",
  accentColor: "#7C3AED",
  tags: [
    "crm", "contact", "relationship", "followup", "network", "people",
    "outreach", "notes", "personal", "business", "connections",
  ],
} as const satisfies TemplateManifest;
