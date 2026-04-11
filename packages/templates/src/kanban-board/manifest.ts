import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "kanban-board",
  name: "Kanban Board",
  description: "Three-column task board with card creation and drag between columns",
  shell: "workspace",
  accentColor: "#7C3AED",
  tags: [
    "kanban", "board", "workflow", "status", "project", "agile", "columns",
    "cards", "drag", "task", "team", "productivity",
  ],
} as const satisfies TemplateManifest;
