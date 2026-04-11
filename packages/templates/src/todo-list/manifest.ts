import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "todo-list",
  name: "Todo List",
  description: "Task manager with add, complete, delete, and filter by status",
  shell: "website",
  accentColor: "#4338CA",
  tags: [
    "todo", "task", "list", "productivity", "checklist", "organize",
    "personal", "done", "filter", "interactive", "add", "delete",
  ],
} as const satisfies TemplateManifest;
