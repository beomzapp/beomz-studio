import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "music-player",
  name: "Music Player",
  description: "Music player UI with playlist, now-playing bar, progress slider, and controls",
  shell: "website",
  accentColor: "#F97316",
  tags: [
    "music", "player", "playlist", "audio", "controls", "now-playing",
    "dark-theme", "creative", "streaming", "songs", "entertainment",
  ],
} as const satisfies TemplateManifest;
