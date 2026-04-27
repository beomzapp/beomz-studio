import type { StudioDbClient } from "@beomz-studio/studio-db";

export interface PersistedAiUsage {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
}

function clampTokenCount(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.round(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function buildPersistedAiUsage(inputTokens: number, outputTokens: number): PersistedAiUsage {
  const normalizedInputTokens = clampTokenCount(inputTokens);
  const normalizedOutputTokens = clampTokenCount(outputTokens);

  return {
    input_tokens: normalizedInputTokens,
    output_tokens: normalizedOutputTokens,
    total_tokens: normalizedInputTokens + normalizedOutputTokens,
  };
}

export async function persistGenerationAiUsage(
  db: Pick<StudioDbClient, "findGenerationById" | "updateGeneration">,
  buildId: string,
  usage: PersistedAiUsage,
): Promise<void> {
  const generation = await db.findGenerationById(buildId);
  if (!generation) {
    return;
  }

  const metadata = isRecord(generation.metadata) ? generation.metadata : {};

  await db.updateGeneration(buildId, {
    metadata: {
      ...metadata,
      ai_usage: usage,
    },
  });
}
