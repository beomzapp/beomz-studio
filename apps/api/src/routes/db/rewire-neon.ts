import type { StudioFile } from "@beomz-studio/contracts";
import { createStudioDbClient } from "@beomz-studio/studio-db";

const ENV_FILE_PATH = ".env.local";

function upsertDatabaseUrlEnvFile(
  files: readonly StudioFile[],
  connectionUri: string,
): readonly StudioFile[] {
  const dbLine = `DATABASE_URL=${connectionUri}`;
  let updated = false;

  const next = files.map((file) => {
    if (file.path !== ENV_FILE_PATH) return file;

    const lines = file.content.split(/\r?\n/);
    const hasDatabaseUrl = lines.some((line) => line.startsWith("DATABASE_URL="));
    const content = hasDatabaseUrl
      ? lines.map((line) => (line.startsWith("DATABASE_URL=") ? dbLine : line)).join("\n")
      : `${file.content.replace(/\s*$/, "")}\n${dbLine}\n`;

    updated = true;
    return {
      ...file,
      content,
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
      content: `${dbLine}\n`,
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

  const files = latestGen.files as readonly StudioFile[];
  const nextFiles = upsertDatabaseUrlEnvFile(files, connectionUri);
  const metadata = typeof latestGen.metadata === "object" && latestGen.metadata !== null
    ? latestGen.metadata as Record<string, unknown>
    : {};

  await studioDb.updateGeneration(latestGen.id, {
    files: nextFiles,
    metadata: {
      ...metadata,
      neon: {
        databaseUrlEnvVar: "DATABASE_URL",
      },
    },
  });
}
