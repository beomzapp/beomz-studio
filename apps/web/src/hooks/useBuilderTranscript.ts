import { useCallback } from "react";
import type { BuilderV3Event, BuilderV3TranscriptEntry } from "@beomz-studio/contracts";

import { eventToTranscriptEntry } from "../lib/builder-v3/events";

export function useBuilderTranscript() {
  const appendTranscriptEntry = useCallback(
    (
      entries: readonly BuilderV3TranscriptEntry[],
      event: BuilderV3Event,
    ): readonly BuilderV3TranscriptEntry[] => {
      const nextEntry = eventToTranscriptEntry(event);
      if (!nextEntry || nextEntry.kind === "assistant") {
        return entries;
      }

      if (entries.some((entry) => entry.id === nextEntry.id)) {
        return entries;
      }

      return [...entries, nextEntry];
    },
    [],
  );

  return {
    appendTranscriptEntry,
    eventToTranscriptEntry,
  };
}
