import type { ProjectDbLimitsRow, ProjectRow } from "@beomz-studio/studio-db";

export function getNeonDbUrl(
  limits: Pick<ProjectDbLimitsRow, "db_url"> | null | undefined,
): string | null {
  if (typeof limits?.db_url !== "string") return null;
  const normalized = limits.db_url.trim();
  return normalized.length > 0 ? normalized : null;
}

export function resolveProjectDbProvider(
  project: Pick<ProjectRow, "database_enabled" | "db_provider" | "db_wired" | "db_schema" | "db_config">,
  limits?: Pick<ProjectDbLimitsRow, "db_url"> | null,
): string | null {
  if (typeof project.db_provider === "string" && project.db_provider.length > 0) {
    return project.db_provider;
  }

  // Legacy Neon projects can exist with db_provider unset but a persisted
  // Neon connection string in project_db_limits.
  if (
    project.database_enabled &&
    project.db_wired &&
    project.db_schema == null &&
    project.db_config == null &&
    getNeonDbUrl(limits)
  ) {
    return "neon";
  }

  return null;
}
