import type { BuilderV3Operation } from "@beomz-studio/contracts";

export type BuildStageName =
  | "classifying"
  | "enriching"
  | "generating"
  | "sanitising"
  | "persisting"
  | "deploying";

export interface BuildStageEvent {
  id: string;
  timestamp: string;
  operation: BuilderV3Operation;
  type: `stage_${BuildStageName}`;
  stage: BuildStageName;
  elapsedMs: number;
}

interface CreateBuildStageEmitterOptions {
  operation: BuilderV3Operation;
  nextId: () => string;
  emit: (event: BuildStageEvent) => Promise<void> | void;
  now?: () => number;
  timestamp?: () => string;
}

export function createBuildStageEmitter({
  operation,
  nextId,
  emit,
  now = () => Date.now(),
  timestamp = () => new Date().toISOString(),
}: CreateBuildStageEmitterOptions) {
  const emittedStages = new Set<BuildStageName>();
  let preBuildAckAt: number | null = null;

  return {
    markPreBuildAck(): void {
      if (preBuildAckAt === null) {
        preBuildAckAt = now();
      }
    },

    async emit(stage: BuildStageName): Promise<BuildStageEvent | null> {
      if (emittedStages.has(stage)) {
        return null;
      }

      emittedStages.add(stage);

      const event: BuildStageEvent = {
        id: nextId(),
        timestamp: timestamp(),
        operation,
        type: `stage_${stage}`,
        stage,
        elapsedMs: preBuildAckAt === null ? 0 : Math.max(0, now() - preBuildAckAt),
      };

      await emit(event);
      return event;
    },
  };
}
