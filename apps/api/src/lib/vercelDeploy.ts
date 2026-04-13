/**
 * Vercel deploy helper — BEO-XXX
 *
 * vercelDeployStart  — uploads files + creates the Vercel deployment (fast, ~5-10s)
 *                      returns deploymentId immediately without polling
 * pollUntilReady     — polls until readyState === 'READY' or 'ERROR'
 * vercelDeploy       — convenience wrapper: start + poll (sync, for direct use)
 */
import crypto from "node:crypto";

import { apiConfig } from "../config.js";

export interface VercelDeployFile {
  filename: string;
  content: string;
}

export interface VercelDeployResult {
  url: string;
  deploymentId: string;
}

export interface VercelDeployHandle {
  deploymentId: string;
  url: string;
  /** Credentials needed to poll — callers keep these if polling in background */
  _token: string;
  _teamId: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function sha1(content: string): string {
  return crypto.createHash("sha1").update(content).digest("hex");
}

function requireVercelConfig(): { token: string; projectId: string; teamId: string } {
  const { VERCEL_TOKEN, VERCEL_PROJECT_ID, VERCEL_TEAM_ID } = apiConfig;
  if (!VERCEL_TOKEN || !VERCEL_PROJECT_ID || !VERCEL_TEAM_ID) {
    throw new Error("Vercel env vars not configured (VERCEL_TOKEN, VERCEL_PROJECT_ID, VERCEL_TEAM_ID)");
  }
  return { token: VERCEL_TOKEN, projectId: VERCEL_PROJECT_ID, teamId: VERCEL_TEAM_ID };
}

// ── File upload ───────────────────────────────────────────────────────────────

async function uploadFile(
  token: string,
  file: { filename: string; content: string },
): Promise<{ filename: string; sha: string; size: number }> {
  const buf = Buffer.from(file.content);
  const sha = sha1(file.content);
  const size = buf.byteLength;

  const res = await fetch("https://api.vercel.com/v2/now/files", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/octet-stream",
      "x-vercel-digest": sha,
      "Content-Length": String(size),
    },
    body: buf,
  });

  // 200 = uploaded, 409 = already exists — both are fine
  if (!res.ok && res.status !== 409) {
    const body = await res.text();
    throw new Error(`Vercel file upload failed (${res.status}): ${body}`);
  }

  return { filename: file.filename, sha, size };
}

// ── Poll for READY ────────────────────────────────────────────────────────────

export async function pollUntilReady(
  token: string,
  teamId: string,
  deploymentId: string,
  maxMs = 120_000,
): Promise<void> {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    await new Promise<void>((r) => setTimeout(r, 3_000));
    const res = await fetch(
      `https://api.vercel.com/v13/deployments/${deploymentId}?teamId=${teamId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Vercel poll failed (${res.status}): ${body}`);
    }
    const data = (await res.json()) as { readyState: string; errorCode?: string; errorMessage?: string };
    if (data.readyState === "READY") return;
    if (data.readyState === "ERROR") {
      throw new Error(`Vercel deployment error: ${data.errorCode ?? "unknown"} — ${data.errorMessage ?? ""}`);
    }
  }
  throw new Error("Vercel deployment timed out after 120s");
}

// ── Create deployment (upload files + POST to Vercel) — returns immediately ──

export async function vercelDeployStart(opts: {
  files: VercelDeployFile[];
  slug: string;
}): Promise<VercelDeployHandle> {
  const { token, projectId, teamId } = requireVercelConfig();

  // Add vercel.json for SPA client-side routing
  const allFiles: VercelDeployFile[] = [
    ...opts.files,
    {
      filename: "vercel.json",
      content: JSON.stringify({
        rewrites: [{ source: "/(.*)", destination: "/index.html" }],
      }),
    },
  ];

  // Upload all files (parallel, Vercel deduplicates by SHA)
  const uploaded = await Promise.all(
    allFiles.map((f) => uploadFile(token, f)),
  );

  console.log(
    `[vercel deploy] uploading ${uploaded.length} files:`,
    uploaded.map((f) => `${f.filename} (${f.size}B)`),
  );

  // Build deployment body
  const deployBody: Record<string, unknown> = {
    name: "beomz-apps",
    project: projectId,
    files: uploaded.map(({ filename, sha, size }) => ({ file: filename, sha, size })),
    projectSettings: { framework: "vite" },
    target: "production",
    alias: [`${opts.slug}.beomz.app`],
  };

  // Create deployment
  const deployRes = await fetch(
    `https://api.vercel.com/v13/deployments?teamId=${teamId}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(deployBody),
    },
  );

  if (!deployRes.ok) {
    const body = await deployRes.text();
    throw new Error(`Vercel deployment creation failed (${deployRes.status}): ${body}`);
  }

  const deploy = (await deployRes.json()) as { id: string };

  return {
    deploymentId: deploy.id,
    url: `https://${opts.slug}.beomz.app`,
    _token: token,
    _teamId: teamId,
  };
}

// ── Convenience sync wrapper (start + poll in one call) ──────────────────────

export async function vercelDeploy(opts: {
  files: VercelDeployFile[];
  slug: string;
}): Promise<VercelDeployResult> {
  const handle = await vercelDeployStart(opts);
  await pollUntilReady(handle._token, handle._teamId, handle.deploymentId);
  return { url: handle.url, deploymentId: handle.deploymentId };
}

