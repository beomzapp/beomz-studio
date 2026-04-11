import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "unit-converter-pro",
  name: "Unit Converter Pro",
  description: "Advanced unit converter with 8 categories, favorites, and conversion history",
  shell: "website",
  accentColor: "#0891B2",
  tags: [
    "unit", "converter", "measurement", "advanced", "length", "weight",
    "temperature", "speed", "area", "data", "favorites", "history",
  ],
} as const satisfies TemplateManifest;
