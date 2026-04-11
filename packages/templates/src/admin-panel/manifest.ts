import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "admin-panel",
  name: "Admin Panel",
  description: "Admin panel with user management, system stats, activity log, and settings",
  shell: "dashboard",
  accentColor: "#6366F1",
  tags: [
    "admin", "panel", "users", "management", "settings", "system",
    "business", "light-theme", "roles", "activity", "dashboard",
  ],
} as const satisfies TemplateManifest;
