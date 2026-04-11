import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "project-roadmap",
  name: "Project Roadmap",
  description: "Visual project roadmap with phases, milestones, and progress tracking",
  shell: "dashboard",
  accentColor: "#7C3AED",
  tags: [
    "roadmap", "project", "milestone", "timeline", "phases",
    "planning", "progress", "product", "management", "kanban", "tracker",
  ],
} as const satisfies TemplateManifest;
