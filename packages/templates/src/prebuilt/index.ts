import type { PrebuiltTemplate } from "@beomz-studio/contracts";

import { PREBUILT_REGISTRY, prebuiltById, tagIndex } from "./loader.js";

export function getPrebuiltTemplate(id: string): PrebuiltTemplate | undefined {
  return prebuiltById.get(id);
}

export function listPrebuiltTemplates(): readonly PrebuiltTemplate[] {
  return PREBUILT_REGISTRY;
}

export function searchPrebuiltTemplatesByTags(tags: readonly string[]): PrebuiltTemplate[] {
  if (tags.length === 0) return [];

  const matchCounts = new Map<string, number>();

  for (const tag of tags) {
    const ids = tagIndex.get(tag.toLowerCase());
    if (!ids) continue;
    for (const id of ids) {
      matchCounts.set(id, (matchCounts.get(id) ?? 0) + 1);
    }
  }

  return Array.from(matchCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => prebuiltById.get(id)!)
    .filter(Boolean);
}

export function listAllPrebuiltTags(): string[] {
  return Array.from(tagIndex.keys()).sort();
}
