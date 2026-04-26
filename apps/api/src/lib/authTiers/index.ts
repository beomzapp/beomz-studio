import { getByoDbUrl, parseSupabaseProjectUrl } from "../projectDb.js";
import { decryptProjectSecret } from "../projectSecrets.js";
import { createMockAuthTier } from "./mockAuth.js";
import { createNeonAuthTier } from "./neonAuth.js";
import { AuthTierError, type AuthTier } from "./shared.js";
import { createSupabaseAuthTier } from "./supabaseAuth.js";

type ProjectAuthLookup = Record<string, unknown> & {
  id: string;
  db_type?: unknown;
  byo_db_service_key?: unknown;
  byo_db_url?: unknown;
  resolved_db_url?: unknown;
  db_url?: unknown;
  VITE_DATABASE_URL?: unknown;
};

type ProjectDbType = "mock" | "neon" | "supabase";

function normaliseProjectDbType(value: unknown): ProjectDbType | null {
  if (value === "none") return "mock";
  if (value === "neon") return "neon";
  if (value === "supabase") return "supabase";
  return null;
}

function readResolvedDbUrl(project: ProjectAuthLookup): string | null {
  const candidates = [
    project.resolved_db_url,
    project.db_url,
    project.VITE_DATABASE_URL,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  return null;
}

function readSupabaseUrl(project: ProjectAuthLookup): string | null {
  const rawByoUrl = getByoDbUrl(project);
  if (!rawByoUrl) {
    return null;
  }

  try {
    return parseSupabaseProjectUrl(rawByoUrl).supabaseUrl;
  } catch {
    return null;
  }
}

function readSupabaseServiceKey(project: ProjectAuthLookup): string | null {
  if (typeof project.byo_db_service_key !== "string" || project.byo_db_service_key.trim().length === 0) {
    return null;
  }

  const decrypted = decryptProjectSecret(project.byo_db_service_key);
  if (typeof decrypted === "string" && decrypted.trim().length > 0) {
    return decrypted;
  }

  if (!project.byo_db_service_key.startsWith("v1:")) {
    return project.byo_db_service_key.trim();
  }

  return null;
}

function inferProjectDbType(project: ProjectAuthLookup): ProjectDbType {
  const explicitDbType = normaliseProjectDbType(project.db_type);
  if (explicitDbType) {
    return explicitDbType;
  }

  if (readSupabaseUrl(project) && readSupabaseServiceKey(project)) {
    return "supabase";
  }

  if (readResolvedDbUrl(project)) {
    return "neon";
  }

  return "mock";
}

export function resolveAuthTier(project: ProjectAuthLookup): AuthTier {
  const dbType = inferProjectDbType(project);

  if (dbType === "mock") {
    return createMockAuthTier();
  }

  if (dbType === "neon") {
    const dbUrl = readResolvedDbUrl(project);
    if (!dbUrl) {
      throw new AuthTierError(400, "Project database URL is missing");
    }

    return createNeonAuthTier({
      dbUrl,
      projectId: project.id,
    });
  }

  const serviceKey = readSupabaseServiceKey(project);
  const supabaseUrl = readSupabaseUrl(project);

  if (!supabaseUrl || !serviceKey) {
    throw new AuthTierError(400, "BYO Supabase credentials are missing");
  }

  return createSupabaseAuthTier({
    serviceKey,
    supabaseUrl,
  });
}
