import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "movie-watchlist",
  name: "Movie Watchlist",
  description: "Movie tracker with watchlist, ratings, reviews, and genre filtering",
  shell: "website",
  accentColor: "#9333EA",
  tags: [
    "movie", "watchlist", "film", "rating", "review", "genre",
    "cinema", "tracker", "entertainment", "streaming", "tv",
  ],
} as const satisfies TemplateManifest;
