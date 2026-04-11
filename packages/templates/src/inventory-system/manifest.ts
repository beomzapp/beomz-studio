import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "inventory-system",
  name: "Inventory System",
  description: "Inventory management with stock levels, categories, low-stock alerts, and search",
  shell: "dashboard",
  accentColor: "#3B82F6",
  tags: [
    "inventory", "stock", "warehouse", "product", "alert", "reorder",
    "business", "light-theme", "management", "supply-chain", "categories",
  ],
} as const satisfies TemplateManifest;
