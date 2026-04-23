import type { StudioFile } from "@beomz-studio/contracts";
import { createStudioDbClient } from "@beomz-studio/studio-db";

import { upsertEnvFile } from "../../lib/envFile.js";

export { upsertEnvFile } from "../../lib/envFile.js";

export async function rewireNeonDb(
  projectId: string,
  connectionUri: string,
): Promise<void> {
  const studioDb = createStudioDbClient();

  await studioDb.updateProject(projectId, {
    byo_db_url: null,
    byo_db_anon_key: null,
    byo_db_service_key: null,
    supabase_oauth_access_token: null,
    supabase_oauth_refresh_token: null,
    database_enabled: true,
    db_wired: true,
    db_provider: "neon",
    db_schema: null,
    db_nonce: null,
    db_config: null,
  });

  const latestGen = await studioDb.findLatestGenerationByProjectId(projectId);
  if (!latestGen || !Array.isArray(latestGen.files) || latestGen.files.length === 0) {
    return;
  }

  const limits = await studioDb.getProjectDbLimits(projectId);
  const dbUrl = typeof limits?.db_url === "string" && limits.db_url.length > 0
    ? limits.db_url
    : connectionUri;
  const neonAuthBaseUrl = typeof limits?.neon_auth_base_url === "string"
    ? limits.neon_auth_base_url
    : "";
  const neonAuthSecretKey = typeof limits?.neon_auth_secret_key === "string"
    ? limits.neon_auth_secret_key
    : "";
  const neonAuthPubKey = typeof limits?.neon_auth_pub_key === "string"
    ? limits.neon_auth_pub_key
    : "";

  const files = latestGen.files as readonly StudioFile[];
  const nextFiles = upsertEnvFile(files, {
    VITE_DATABASE_URL: dbUrl,
    VITE_BYO_DB: null,
    VITE_NEON_AUTH_URL: neonAuthBaseUrl,
    NEON_AUTH_SECRET: neonAuthSecretKey,
    NEON_AUTH_PUB_KEY: neonAuthPubKey,
  });
  const metadata = typeof latestGen.metadata === "object" && latestGen.metadata !== null
    ? latestGen.metadata as Record<string, unknown>
    : {};

  await studioDb.updateGeneration(latestGen.id, {
    files: nextFiles,
    metadata: {
      ...metadata,
      neon: {
        databaseUrlEnvVar: "VITE_DATABASE_URL",
        authUrlEnvVar: neonAuthBaseUrl ? "VITE_NEON_AUTH_URL" : null,
      },
    },
  });
}
