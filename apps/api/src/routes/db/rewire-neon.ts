import type { StudioFile } from "@beomz-studio/contracts";
import { createStudioDbClient } from "@beomz-studio/studio-db";

const ENV_FILE_PATH = ".env.local";

export function upsertEnvFile(
  files: readonly StudioFile[],
  envVars: Record<string, string>,
): readonly StudioFile[] {
  const entries = Object.entries(envVars).filter(([, value]) => value.trim().length > 0);
  if (entries.length === 0) return files;

  const keys = new Set(entries.map(([key]) => key));
  let updated = false;

  const next = files.map((file) => {
    if (file.path !== ENV_FILE_PATH) return file;

    const lines = file.content.split(/\r?\n/);
    const seen = new Set<string>();

    const replaced = lines.map((line) => {
      const eqIndex = line.indexOf("=");
      if (eqIndex <= 0) return line;
      const key = line.slice(0, eqIndex);
      if (!keys.has(key)) return line;
      seen.add(key);
      const value = envVars[key] ?? "";
      return `${key}=${value}`;
    });

    const missing = entries
      .filter(([key]) => !seen.has(key))
      .map(([key, value]) => `${key}=${value}`);
    const content = [...replaced.filter((line) => line.length > 0), ...missing].join("\n");

    updated = true;
    return {
      ...file,
      content: `${content}\n`,
      source: "platform" as const,
      locked: false,
    };
  });

  if (updated) return next;

  return [
    ...next,
    {
      path: ENV_FILE_PATH,
      kind: "config",
      language: "dotenv",
      content: `${entries.map(([key, value]) => `${key}=${value}`).join("\n")}\n`,
      source: "platform" as const,
      locked: false,
    },
  ];
}

export async function rewireNeonDb(
  projectId: string,
  connectionUri: string,
): Promise<void> {
  const studioDb = createStudioDbClient();

  await studioDb.updateProject(projectId, {
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
