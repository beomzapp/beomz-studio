import type { ProjectDbLimitsRow, ProjectRow } from "@beomz-studio/studio-db";

type ProjectDbLookup = Pick<ProjectRow, "database_enabled" | "db_provider" | "db_wired" | "db_schema" | "db_config"> & {
  byo_db_url?: unknown;
};

export function getNeonDbUrl(
  limits: Pick<ProjectDbLimitsRow, "db_url"> | null | undefined,
): string | null {
  if (typeof limits?.db_url !== "string") return null;
  const normalized = limits.db_url.trim();
  return normalized.length > 0 ? normalized : null;
}

export function getByoDbUrl(
  project: Record<string, unknown> | null | undefined,
): string | null {
  if (typeof project?.byo_db_url !== "string") return null;
  const normalized = project.byo_db_url.trim();
  return normalized.length > 0 ? normalized : null;
}

export function parsePostgresConnectionString(
  value: string,
): { connectionString: string; host: string } {
  const connectionString = value.trim();
  if (!/^postgres(?:ql)?:\/\//i.test(connectionString)) {
    throw new Error("Connection string must start with postgres:// or postgresql://");
  }

  let parsed: URL;
  try {
    parsed = new URL(connectionString);
  } catch {
    throw new Error("Connection string must be a valid URL");
  }

  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error("Connection string must start with postgres:// or postgresql://");
  }

  if (!parsed.hostname.trim()) {
    throw new Error("Connection string must include a database host");
  }

  return {
    connectionString,
    host: parsed.hostname,
  };
}

export function getProjectPostgresUrl(
  project: Record<string, unknown> | null | undefined,
  limits?: Pick<ProjectDbLimitsRow, "db_url"> | null,
): string | null {
  return getByoDbUrl(project) ?? getNeonDbUrl(limits);
}

export function resolveProjectDbProvider(
  project: ProjectDbLookup,
  limits?: Pick<ProjectDbLimitsRow, "db_url"> | null,
): string | null {
  if (getByoDbUrl(project)) {
    return "postgres";
  }

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
    getProjectPostgresUrl(project, limits)
  ) {
    return "neon";
  }

  return null;
}

export function buildProjectDatabaseEnvVars(
  project: ProjectDbLookup,
  limits?: Pick<ProjectDbLimitsRow, "db_url" | "neon_auth_base_url" | "neon_auth_pub_key" | "neon_auth_secret_key"> | null,
): Record<string, string | null> | null {
  if (!project.database_enabled || !project.db_wired) {
    return null;
  }

  const provider = resolveProjectDbProvider(project, limits);
  if (provider === "postgres") {
    const dbUrl = getProjectPostgresUrl(project, limits);
    if (!dbUrl) return null;
    return {
      VITE_DATABASE_URL: dbUrl,
      VITE_BYO_DB: "true",
      VITE_NEON_AUTH_URL: null,
      NEON_AUTH_SECRET: null,
      NEON_AUTH_PUB_KEY: null,
    };
  }

  if (provider === "neon") {
    const dbUrl = getProjectPostgresUrl(project, limits);
    if (!dbUrl) return null;
    return {
      VITE_DATABASE_URL: dbUrl,
      VITE_BYO_DB: null,
      VITE_NEON_AUTH_URL: typeof limits?.neon_auth_base_url === "string" ? limits.neon_auth_base_url : null,
      NEON_AUTH_SECRET: typeof limits?.neon_auth_secret_key === "string" ? limits.neon_auth_secret_key : null,
      NEON_AUTH_PUB_KEY: typeof limits?.neon_auth_pub_key === "string" ? limits.neon_auth_pub_key : null,
    };
  }

  return null;
}
