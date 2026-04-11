import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "product-catalog",
  name: "Product Catalog",
  description: "Product grid with filters, cart, and category browsing",
  shell: "website",
  accentColor: "#E11D48",
  tags: [
    "product", "catalog", "shop", "ecommerce", "cart", "filter",
    "store", "retail", "grid", "category", "browse",
  ],
} as const satisfies TemplateManifest;
