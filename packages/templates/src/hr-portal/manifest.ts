import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "hr-portal",
  name: "HR Portal",
  description: "Human resources portal with employee directory, leave requests, and department overview",
  shell: "dashboard",
  accentColor: "#3B82F6",
  tags: [
    "hr", "portal", "employee", "directory", "leave", "department",
    "business", "light-theme", "people", "human-resources", "management",
  ],
} as const satisfies TemplateManifest;
