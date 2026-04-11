import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "status-page",
  name: "Status Page",
  description: "Service status page with uptime indicators, incident log, and component health",
  shell: "website",
  accentColor: "#3B82F6",
  tags: [
    "status", "uptime", "incidents", "monitoring", "services",
    "light-theme", "public", "health", "infrastructure", "saas", "operational",
  ],
} as const satisfies TemplateManifest;
