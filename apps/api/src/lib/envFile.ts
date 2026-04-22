import type { StudioFile } from "@beomz-studio/contracts";

const ENV_FILE_PATH = ".env.local";

export function upsertEnvFile(
  files: readonly StudioFile[],
  envVars: Record<string, string | null | undefined>,
): readonly StudioFile[] {
  const keys = new Set(Object.keys(envVars));
  if (keys.size === 0) return files;

  let updated = false;

  const next = files.map((file) => {
    if (file.path !== ENV_FILE_PATH) return file;

    const lines = file.content.split(/\r?\n/);
    const seen = new Set<string>();

    const replaced = lines.flatMap((line) => {
      const eqIndex = line.indexOf("=");
      if (eqIndex <= 0) return [line];

      const key = line.slice(0, eqIndex);
      if (!keys.has(key)) return [line];

      seen.add(key);
      const value = envVars[key];
      if (value == null || value.trim().length === 0) {
        return [];
      }

      return [`${key}=${value}`];
    });

    const missing = Object.entries(envVars)
      .filter(([key, value]) => !seen.has(key) && typeof value === "string" && value.trim().length > 0)
      .map(([key, value]) => `${key}=${value}`);
    const content = [...replaced.filter((line) => line.length > 0), ...missing].join("\n");

    updated = true;
    return {
      ...file,
      content: content.length > 0 ? `${content}\n` : "",
      source: "platform" as const,
      locked: false,
    };
  });

  if (updated) return next;

  const newEntries = Object.entries(envVars)
    .filter(([, value]) => typeof value === "string" && value.trim().length > 0)
    .map(([key, value]) => `${key}=${value}`);
  if (newEntries.length === 0) {
    return next;
  }

  return [
    ...next,
    {
      path: ENV_FILE_PATH,
      kind: "config",
      language: "dotenv",
      content: `${newEntries.join("\n")}\n`,
      source: "platform" as const,
      locked: false,
    },
  ];
}
