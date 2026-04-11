import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "material-base",
  name: "Material Design 3",
  description: "Material Design 3 shell with NavigationDrawer, pill buttons, tonal surface elevation, and MD3 color tokens",
  shell: "dashboard",
  accentColor: "#6750A4",
  tags: [
    "material", "material design", "material ui", "md3", "material you",
    "google", "google material", "android", "light-theme", "design-system",
    "navigation drawer", "pill buttons", "roboto",
  ],
} as const satisfies TemplateManifest;
