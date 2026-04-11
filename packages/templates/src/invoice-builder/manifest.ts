import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "invoice-builder",
  name: "Invoice Builder",
  description: "Quick invoice creator with company branding, line items, and PDF-ready layout",
  shell: "website",
  accentColor: "#1D4ED8",
  tags: [
    "invoice", "builder", "billing", "freelance", "business", "payment",
    "professional", "line-items", "branding", "pdf", "contractor",
  ],
} as const satisfies TemplateManifest;
