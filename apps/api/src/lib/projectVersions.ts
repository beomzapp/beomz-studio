import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { StudioFile } from "@beomz-studio/contracts";

import { apiConfig } from "../config.js";

const MAX_VERSION_LABEL_LENGTH = 100;
const PROJECT_VERSION_RETENTION_LIMIT = 50;

export type ProjectVersionFiles = Record<string, string>;

export interface ProjectVersionSummary extends Record<string, unknown> {
  id: string;
  version_number: number;
  label: string;
  file_count: number;
  created_at: string;
}

export interface ProjectVersionRow extends ProjectVersionSummary {
  project_id: string;
  files: ProjectVersionFiles;
}

interface ProjectVersionsDatabase {
  public: {
    Tables: {
      project_versions: {
        Row: ProjectVersionRow;
        Insert: {
          id?: string;
          project_id: string;
          version_number: number;
          label: string;
          files: ProjectVersionFiles;
          file_count: number;
          created_at?: string;
        };
        Update: Partial<ProjectVersionRow>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

let projectVersionsClient: SupabaseClient<ProjectVersionsDatabase> | null = null;

function getProjectVersionsClient(): SupabaseClient<ProjectVersionsDatabase> {
  if (!projectVersionsClient) {
    projectVersionsClient = createClient<ProjectVersionsDatabase>(
      apiConfig.STUDIO_SUPABASE_URL,
      apiConfig.STUDIO_SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
        db: {
          schema: "public",
        },
      },
    );
  }

  return projectVersionsClient;
}

function isDuplicateVersionNumberError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = "code" in error && typeof error.code === "string" ? error.code : "";
  const message = "message" in error && typeof error.message === "string" ? error.message : "";

  return code === "23505" && /project_versions.*project_id.*version_number/i.test(message);
}

function trimProjectVersionLabel(label: string): string {
  return label.trim().slice(0, MAX_VERSION_LABEL_LENGTH);
}

function inferFileKind(path: string): StudioFile["kind"] {
  if (/\/(routes|pages|screens|views)\//.test(path) || /App\.(tsx|jsx)$/.test(path)) return "route";
  if (/\/components\//.test(path)) return "component";
  if (/\/(styles?|css)\//.test(path) || /\.css$/.test(path)) return "style";
  if (/\/(config|settings)\//.test(path) || /\.(config|rc)\.(ts|js|json)$/.test(path)) return "config";
  if (/\/(data|fixtures)\//.test(path)) return "data";
  if (/\.(json|md)$/.test(path)) return "content";
  return "component";
}

function inferLanguage(path: string): string {
  const extension = path.split(".").pop()?.toLowerCase() ?? "";
  const languageByExtension: Record<string, string> = {
    css: "css",
    js: "javascript",
    json: "json",
    jsx: "jsx",
    md: "markdown",
    ts: "typescript",
    tsx: "tsx",
  };

  return languageByExtension[extension] ?? "typescript";
}

function normaliseProjectVersionFiles(files: ProjectVersionFiles): ProjectVersionFiles {
  return Object.fromEntries(
    Object.entries(files)
      .filter(([path, content]) => path.trim().length > 0 && typeof content === "string")
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

export function studioFilesToVersionFiles(files: readonly StudioFile[]): ProjectVersionFiles {
  return normaliseProjectVersionFiles(
    Object.fromEntries(files.map((file) => [file.path, file.content])),
  );
}

export function projectVersionFilesToStudioFiles(
  files: ProjectVersionFiles,
  fallbackFiles: readonly StudioFile[] = [],
): StudioFile[] {
  const fallbackByPath = new Map(fallbackFiles.map((file) => [file.path, file]));
  const updatedAt = new Date().toISOString();

  return Object.entries(normaliseProjectVersionFiles(files)).map(([path, content]) => {
    const fallback = fallbackByPath.get(path);

    if (fallback) {
      return {
        ...fallback,
        content,
        hash: undefined,
        updatedAt,
      };
    }

    return {
      path,
      kind: inferFileKind(path),
      language: inferLanguage(path),
      content,
      source: "ai",
      locked: false,
      updatedAt,
    };
  });
}

async function getNextVersionNumber(
  projectId: string,
): Promise<number> {
  const client = getProjectVersionsClient();
  const response = await client
    .from("project_versions")
    .select("version_number")
    .eq("project_id", projectId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (response.error) {
    throw new Error(response.error.message);
  }

  return (response.data?.version_number ?? 0) + 1;
}

async function pruneOldestProjectVersion(projectId: string): Promise<void> {
  const client = getProjectVersionsClient();
  const countResponse = await client
    .from("project_versions")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId);

  if (countResponse.error) {
    throw new Error(countResponse.error.message);
  }

  if ((countResponse.count ?? 0) < PROJECT_VERSION_RETENTION_LIMIT) {
    return;
  }

  const oldestResponse = await client
    .from("project_versions")
    .select("id")
    .eq("project_id", projectId)
    .order("version_number", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (oldestResponse.error) {
    throw new Error(oldestResponse.error.message);
  }

  if (!oldestResponse.data?.id) {
    return;
  }

  const deleteResponse = await client
    .from("project_versions")
    .delete()
    .eq("id", oldestResponse.data.id);

  if (deleteResponse.error) {
    throw new Error(deleteResponse.error.message);
  }
}

export async function createProjectVersion(
  projectId: string,
  label: string,
  files: ProjectVersionFiles,
): Promise<ProjectVersionRow> {
  const client = getProjectVersionsClient();
  const normalisedFiles = normaliseProjectVersionFiles(files);
  const trimmedLabel = trimProjectVersionLabel(label);
  const fileCount = Object.keys(normalisedFiles).length;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const versionNumber = await getNextVersionNumber(projectId);
    const insertResponse = await client
      .from("project_versions")
      .insert({
        project_id: projectId,
        version_number: versionNumber,
        label: trimmedLabel,
        files: normalisedFiles,
        file_count: fileCount,
      })
      .select("*")
      .single();

    if (insertResponse.error) {
      if (isDuplicateVersionNumberError(insertResponse.error) && attempt < 2) {
        continue;
      }

      throw new Error(insertResponse.error.message);
    }

    try {
      await pruneOldestProjectVersion(projectId);
    } catch (error) {
      console.error("[versions] prune failed:", error);
    }

    return insertResponse.data;
  }

  throw new Error("Failed to create project version after retries.");
}

export async function saveProjectVersion(
  projectId: string,
  label: string,
  files: ProjectVersionFiles,
): Promise<void> {
  try {
    await createProjectVersion(projectId, label, files);
  } catch (error) {
    console.error("[versions] saveProjectVersion failed:", error);
  }
}

export async function listProjectVersions(projectId: string): Promise<ProjectVersionSummary[]> {
  const client = getProjectVersionsClient();
  const response = await client
    .from("project_versions")
    .select("id, version_number, label, file_count, created_at")
    .eq("project_id", projectId)
    .order("version_number", { ascending: false });

  if (response.error) {
    throw new Error(response.error.message);
  }

  return response.data ?? [];
}

export async function getProjectVersion(
  projectId: string,
  versionId: string,
): Promise<ProjectVersionRow | null> {
  const client = getProjectVersionsClient();
  const response = await client
    .from("project_versions")
    .select("*")
    .eq("project_id", projectId)
    .eq("id", versionId)
    .maybeSingle();

  if (response.error) {
    throw new Error(response.error.message);
  }

  return response.data;
}
