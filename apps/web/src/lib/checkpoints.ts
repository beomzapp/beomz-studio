/**
 * Checkpoint types and API shim for BEO-76 (Time Travel UI).
 *
 * The backend stores VFS snapshots in the `generations` table's
 * `vfs_snapshot` column. This module provides a thin frontend
 * interface to fetch and restore checkpoints.
 */

import { getApiBaseUrl } from "./api";
import { supabase } from "./supabase";

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

/**
 * Fetch all checkpoints for a project from the generations table.
 * Each completed generation turn = one checkpoint.
 */
export async function getCheckpoints(projectId: string): Promise<Checkpoint[]> {
  const { data, error } = await supabase
    .from("generations")
    .select("id, project_id, prompt, status, summary, started_at, output_paths")
    .eq("project_id", projectId)
    .order("started_at", { ascending: true });

  if (error || !data) return [];

  return data.map((row, index) => ({
    id: row.id,
    generationId: row.id,
    projectId: row.project_id,
    turn: index + 1,
    prompt: row.prompt ?? "",
    summary: row.summary ?? null,
    fileCount: Array.isArray(row.output_paths) ? row.output_paths.length : 0,
    status: row.status as Checkpoint["status"],
    createdAt: row.started_at,
  }));
}

/**
 * Restore a checkpoint — tells the backend to revert the project's
 * VFS to the snapshot from this generation.
 */
export async function restoreCheckpoint(
  generationId: string,
): Promise<CheckpointRestoreResponse> {
  const accessToken = (await supabase.auth.getSession()).data.session?.access_token;
  if (!accessToken) throw new Error("Not authenticated");

  const res = await fetch(`${getApiBaseUrl()}/checkpoints/${generationId}/restore`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `Restore failed (${res.status})`);
  }

  return res.json();
}

/**
 * Fork from a checkpoint — creates a new generation starting from
 * the VFS state of the given generation.
 */
export async function forkFromCheckpoint(
  generationId: string,
  prompt: string,
): Promise<{ buildId: string; projectId: string }> {
  const accessToken = (await supabase.auth.getSession()).data.session?.access_token;
  if (!accessToken) throw new Error("Not authenticated");

  const res = await fetch(`${getApiBaseUrl()}/checkpoints/${generationId}/fork`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ prompt }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `Fork failed (${res.status})`);
  }

  return res.json();
}
