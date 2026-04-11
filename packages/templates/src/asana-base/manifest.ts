import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "asana-base",
  name: "Asana Style",
  description: "Asana-style project management shell with coral accent, collapsible sidebar, row-based task lists, and Inter 14px",
  shell: "dashboard",
  accentColor: "#F06A6A",
  tags: [
    "asana", "asana style", "asana design",
    "task management", "project management", "coral", "inter",
    "collapsible sidebar", "row list", "light-theme", "design-system",
  ],
} as const satisfies TemplateManifest;
