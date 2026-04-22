import type { StudioFile } from "@beomz-studio/contracts";
import { createStudioDbClient } from "@beomz-studio/studio-db";

import { upsertEnvFile } from "../../lib/envFile.js";

export async function rewireByoPostgres(
  projectId: string,
  connectionString: string,
): Promise<void> {
  const studioDb = createStudioDbClient();

  const latestGen = await studioDb.findLatestGenerationByProjectId(projectId);
  if (!latestGen || !Array.isArray(latestGen.files) || latestGen.files.length === 0) {
    return;
  }

  const files = latestGen.files as readonly StudioFile[];
  const nextFiles = upsertEnvFile(files, {
    VITE_DATABASE_URL: connectionString,
    VITE_BYO_DB: "true",
    VITE_NEON_AUTH_URL: null,
    NEON_AUTH_SECRET: null,
    NEON_AUTH_PUB_KEY: null,
  });
  const metadata = typeof latestGen.metadata === "object" && latestGen.metadata !== null
    ? latestGen.metadata as Record<string, unknown>
    : {};

  await studioDb.updateGeneration(latestGen.id, {
    files: nextFiles,
    metadata: {
      ...metadata,
      postgres: {
        byoEnvVar: "VITE_BYO_DB",
        databaseUrlEnvVar: "VITE_DATABASE_URL",
      },
    },
  });
}
