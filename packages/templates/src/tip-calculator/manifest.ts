import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "tip-calculator",
  name: "Tip Calculator",
  description: "Bill splitting with tip percentage selector and per-person breakdown",
  shell: "website",
  accentColor: "#15803D",
  tags: [
    "calculator", "tip", "bill", "split", "restaurant", "dining", "money",
    "group", "friends", "percentage", "math", "utility", "finance",
  ],
} as const satisfies TemplateManifest;
