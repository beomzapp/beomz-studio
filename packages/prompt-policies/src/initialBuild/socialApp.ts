import { sharedInitialBuildSystemRules } from "./shared/systemRules.js";

import type { InitialBuildPromptPolicy } from "./marketingWebsite.js";

export const socialAppInitialBuildPolicy = {
  templateId: "social-app",
  systemPrompt:
    "Generate a social or community app. Desktop should use a left sidebar, a centered feed column, and an optional right panel. Mobile should use a bottom tab nav. The experience should feel like a real social platform with feed cards, avatars, likes, comments, and discovery surfaces.",
  constraints: [
    ...sharedInitialBuildSystemRules,
    "Target social feeds, forums, communities, messaging spaces, dating apps, review apps, or photo-sharing products.",
    "Desktop layouts at 1024px and above must use a left sidebar at w-64, a main feed column centered at max-w-xl, and an optional right rail for trends, suggestions, or community stats.",
    "Tablet layouts from 768px to 1023px must collapse the sidebar to an icon rail while allowing the feed to expand and stay readable.",
    "Mobile layouts below 768px must use a bottom tab nav with up to 5 items such as Home, Explore, Post, Notifications, and Profile. Extra destinations belong in a hamburger-triggered slide-out menu.",
    "Make the feed feel active with realistic avatars, timestamps, engagement counts, comments, and follow or join actions.",
  ],
} as const satisfies InitialBuildPromptPolicy;
