import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "apple-hig-base",
  name: "Apple Human Interface Guidelines",
  description: "Apple HIG shell with SF Pro font stack, system blue, sidebar navigation, and list+chevron disclosure pattern",
  shell: "dashboard",
  accentColor: "#007AFF",
  tags: [
    "apple", "apple hig", "ios", "macos", "ios style", "macos style",
    "cupertino", "sf pro", "system blue", "light-theme", "design-system",
    "sidebar", "chevron", "disclosure",
  ],
} as const satisfies TemplateManifest;
