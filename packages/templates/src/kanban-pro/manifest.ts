import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "kanban-pro",
  name: "Kanban Pro",
  description: "Advanced kanban board with swimlanes, WIP limits, card details, and assignees",
  shell: "dashboard",
  accentColor: "#6366F1",
  tags: [
    "kanban", "board", "swimlanes", "wip", "project", "agile",
    "light-theme", "business", "workflow", "cards", "management",
  ],
} as const satisfies TemplateManifest;
