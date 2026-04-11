import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "currency-converter",
  name: "Currency Converter",
  description: "Exchange rate converter between world currencies with swap and history",
  shell: "website",
  accentColor: "#059669",
  tags: [
    "currency", "exchange", "money", "forex", "international", "travel",
    "rate", "converter", "finance", "tool", "swap",
  ],
} as const satisfies TemplateManifest;
