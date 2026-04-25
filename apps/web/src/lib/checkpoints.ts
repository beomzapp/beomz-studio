/**
 * Checkpoint types and API shim for BEO-76 (Time Travel UI).
 *
 * Fetches generation history via the API server (service role) rather than
 * direct Supabase client queries, avoiding RLS policy requirements.
 */

import { getApiBaseUrl, getAccessToken, handleUnauthorizedResponse } from "./api";

export interface Checkpoint {
  id: string;
  generationId: string;
  projectId: string;
  turn: number;
  prompt: string;
  summary: string | null;
  fileCount: number;
  status: "completed" | "failed" | "running";
  createdAt: string;
}

export interface CheckpointRestoreResponse {
  success: boolean;
  generationId: string;
  restoredAt: string;
}

async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const accessToken = await getAccessToken();
  const res = await fetch(`${getApiBaseUrl()}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${accessToken}`,
      ...options.headers,
    },
  });

  if (!res.ok) {
    await handleUnauthorizedResponse(res);
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }

  return res.json() as Promise<T>;
}

/**
 * Fetch all checkpoints for a project from the API.
 * Each completed generation turn = one checkpoint.
 */
export async function getCheckpoints(projectId: string): Promise<Checkpoint[]> {
  try {
    const response = await apiRequest<{
      builds: Array<{
        id: string;
        projectId: string;
        turn: number;
        prompt: string;
        summary: string | null;
        status: string;
        fileCount: number;
        startedAt: string;
      }>;
    }>(`/projects/${projectId}/builds`);

    return response.builds.map((b) => ({
      id: b.id,
      generationId: b.id,
      projectId: b.projectId,
      turn: b.turn,
      prompt: b.prompt,
      summary: b.summary,
      fileCount: b.fileCount,
      status: b.status as Checkpoint["status"],
      createdAt: b.startedAt,
    }));
  } catch {
    return [];
  }
}

/**
 * Restore a checkpoint — tells the backend to revert the project's
 * VFS to the snapshot from this generation.
 */
export async function restoreCheckpoint(
  generationId: string,
): Promise<CheckpointRestoreResponse> {
  return apiRequest<CheckpointRestoreResponse>(
    `/checkpoints/${generationId}/restore`,
    { method: "POST" },
  );
}

/**
 * Fork from a checkpoint — creates a new generation starting from
 * the VFS state of the given generation.
 */
export async function forkFromCheckpoint(
  generationId: string,
  prompt: string,
): Promise<{ buildId: string; projectId: string }> {
  return apiRequest<{ buildId: string; projectId: string }>(
    `/checkpoints/${generationId}/fork`,
    {
      method: "POST",
      body: JSON.stringify({ prompt }),
    },
  );
}
