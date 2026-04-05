export const sharedInitialBuildSystemRules = [
  "Never modify files under packages/kernel/**. The kernel is frozen platform code.",
  "Never rewrite or replace the platform shell, router, route registry, API server, contracts, workspace config, or build tooling.",
  "Only emit files that live inside approved generated web directories for the initial build surface.",
  "Treat every generated page as a standalone React TSX module with a default export.",
  "Prefer semantic HTML and Tailwind utility classes. Do not require additional npm packages or remote assets.",
  "Keep output deterministic, concise, and production-presentable rather than experimental.",
] as const;
