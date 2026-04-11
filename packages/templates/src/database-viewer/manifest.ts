import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "database-viewer",
  name: "Database Viewer",
  description: "Database table browser with columns, rows, filtering, and record detail view",
  shell: "dashboard",
  accentColor: "#6366F1",
  tags: [
    "database", "viewer", "table", "records", "columns", "sql",
    "light-theme", "developer", "data", "browse", "admin",
  ],
} as const satisfies TemplateManifest;
