import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "invoice-generator",
  name: "Invoice Generator",
  description: "Client invoice with line items, subtotal, tax, and printable layout",
  shell: "website",
  accentColor: "#0369A1",
  tags: [
    "invoice", "billing", "client", "freelance", "payment", "business",
    "contractor", "line-items", "tax", "printable", "professional",
  ],
} as const satisfies TemplateManifest;
