import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "support-tickets",
  name: "Support Tickets",
  description: "Customer support ticket system with priority, status, assignment, and response tracking",
  shell: "dashboard",
  accentColor: "#3B82F6",
  tags: [
    "support", "tickets", "helpdesk", "customer", "priority", "status",
    "business", "light-theme", "service", "queue", "response",
  ],
} as const satisfies TemplateManifest;
