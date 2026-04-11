import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "linear-base",
  name: "Linear App Style",
  description: "Linear-style compact sidebar interface with Inter 13px, tight row density, 1px borders, and Linear indigo accent",
  shell: "dashboard",
  accentColor: "#5E6AD2",
  tags: [
    "linear", "linear style", "linear design", "linear app",
    "inter", "compact", "power-user", "light-theme", "design-system",
    "tight density", "monospace ids",
  ],
} as const satisfies TemplateManifest;
