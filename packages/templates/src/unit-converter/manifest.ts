import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "unit-converter",
  name: "Unit Converter",
  description: "Convert between length, weight, temperature, and volume units",
  shell: "website",
  accentColor: "#0891B2",
  tags: [
    "unit", "convert", "measurement", "length", "weight", "temperature",
    "volume", "metric", "imperial", "tool", "calculator",
  ],
} as const satisfies TemplateManifest;
