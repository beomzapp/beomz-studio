import { type StudioDbClient } from "@beomz-studio/studio-db";
import type { PersistBuildStateActivityInput } from "../shared/types.js";
type PersistBuildStateDb = Pick<StudioDbClient, "findGenerationById" | "listGenerationsByProjectId" | "updateGeneration" | "updateProject" | "upsertBuildTelemetry">;
interface PersistBuildStateDependencies {
    db: PersistBuildStateDb;
    logger?: Pick<Console, "warn">;
    wait?: (ms: number) => Promise<void>;
}
export declare function persistBuildStateWithClient(input: PersistBuildStateActivityInput, { db, logger, wait, }: PersistBuildStateDependencies): Promise<void>;
export declare function persistBuildState(input: PersistBuildStateActivityInput): Promise<void>;
export {};
