import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "project-management",
  name: "Project Management",
  description: "Project management tool with task lists, team members, and progress tracking",
  shell: "dashboard",
  accentColor: "#6366F1",
  tags: [
    "project", "management", "tasks", "team", "progress", "kanban",
    "business", "light-theme", "productivity", "workflow", "board",
  ],
} as const satisfies TemplateManifest;
