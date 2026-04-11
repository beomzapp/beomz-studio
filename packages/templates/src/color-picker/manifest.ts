import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "color-picker",
  name: "Color Picker",
  description: "HEX, RGB, and HSL color picker with preview swatch and saved palette history",
  shell: "website",
  accentColor: "#D946EF",
  tags: [
    "color", "hex", "rgb", "hsl", "palette", "design", "picker",
    "tool", "creative", "swatch", "generator",
  ],
} as const satisfies TemplateManifest;
