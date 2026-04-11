import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "basic-calculator",
  name: "Basic Calculator",
  description: "Standard four-function calculator with a number pad, display, and keyboard support",
  shell: "website",
  accentColor: "#EA580C",
  tags: [
    "calculator", "math", "arithmetic", "numbers", "tool", "utility",
    "interactive", "keyboard", "grid", "buttons", "real-time", "compute", "operations",
  ],
} as const satisfies TemplateManifest;
