import { sharedInitialBuildSystemRules } from "./shared/systemRules.js";

import type { InitialBuildPromptPolicy } from "./marketingWebsite.js";

export const ecommerceInitialBuildPolicy = {
  templateId: "ecommerce",
  systemPrompt:
    "Generate an e-commerce storefront with a sticky header, cart actions, product grids, product detail surfaces, and a clear checkout flow. Make it mobile-first, responsive, and believable as a real online store.",
  constraints: [
    ...sharedInitialBuildSystemRules,
    "Use a full-width website layout with a sticky header that includes logo, search, cart icon, and account icon.",
    "Include product merchandising surfaces such as category chips, featured collections, rating badges, price comparisons, and inventory cues.",
    "Mobile layouts must collapse navigation behind a hamburger menu and keep product grids readable in two columns where space allows.",
    "Product detail views should include a sticky Add to Cart action on mobile.",
    "Do not use a sidebar or bottom tab nav.",
  ],
} as const satisfies InitialBuildPromptPolicy;
