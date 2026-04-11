import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "stripe-base",
  name: "Stripe Dashboard Style",
  description: "Stripe-style dashboard with dark navy sidebar, light content area, data tables, metric cards, and Stripe purple accent",
  shell: "dashboard",
  accentColor: "#635BFF",
  tags: [
    "stripe", "stripe style", "stripe design", "stripe dashboard",
    "navy sidebar", "dark sidebar", "data tables", "fintech",
    "payments", "inter", "design-system",
  ],
} as const satisfies TemplateManifest;
