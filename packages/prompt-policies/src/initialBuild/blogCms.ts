import { sharedInitialBuildSystemRules } from "./shared/systemRules.js";

import type { InitialBuildPromptPolicy } from "./marketingWebsite.js";

export const blogCmsInitialBuildPolicy = {
  templateId: "blog-cms",
  systemPrompt:
    "Generate a blog or content site with an article list page and single article pages. Use clean, readable typography, author information, dates, categories, and a mobile-friendly header with a hamburger menu.",
  constraints: [
    ...sharedInitialBuildSystemRules,
    "Use a content-first website layout with a top header containing logo, nav links, and search.",
    "Article list pages must include cards with thumbnail, title, excerpt, date, author, and category metadata.",
    "Single article pages must use readable long-form typography with a constrained reading width, author bio, and related posts.",
    "On mobile, collapse navigation behind a hamburger menu and keep article cards full-width and easy to scan.",
    "Do not use a sidebar or bottom tab nav unless it is clearly part of a documentation-style article layout.",
  ],
} as const satisfies InitialBuildPromptPolicy;
