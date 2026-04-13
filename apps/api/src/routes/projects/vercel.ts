/**
 * POST /api/projects/:id/deploy/vercel
 *   → uploads files, creates Vercel deployment, returns 202 immediately.
 *   → polls in background; writes beomz_app_url to DB when READY.
 *
 * GET  /api/projects/:id/deploy/vercel/status
 *   → { status: 'deploying' | 'ready', url?: string }
 *   → frontend polls this every 3s instead of waiting on the POST.
 */
import { Hono } from "hono";

import { loadOrgContext } from "../../middleware/loadOrgContext.js";
import { verifyPlatformJwt } from "../../middleware/verifyPlatformJwt.js";
import type { OrgContext } from "../../types.js";
import { vercelDeployStart, pollUntilReady } from "../../lib/vercelDeploy.js";
import { createStudioDbClient } from "@beomz-studio/studio-db";

// Lowercase, spaces → hyphens, alphanumeric + hyphens only, max 40 chars
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export const vercelDeployRoute = new Hono();

// ── POST /api/projects/:id/deploy/vercel ─────────────────────────────────────

vercelDeployRoute.post("/", verifyPlatformJwt, loadOrgContext, async (c) => {
  const orgContext = c.get("orgContext") as OrgContext;
  const projectId = c.req.param("id") as string;

  const project = await orgContext.db.findProjectById(projectId);
  if (!project || project.org_id !== orgContext.org.id) {
    return c.json({ error: "Project not found" }, 404);
  }

  const latestGen = await orgContext.db.findLatestGenerationByProjectId(projectId);
  if (!latestGen || !Array.isArray(latestGen.files) || latestGen.files.length === 0) {
    return c.json({ error: "no_files" }, 400);
  }

  // Use published_slug if set, otherwise derive from project name
  const slug = project.published_slug
    ? project.published_slug
    : slugify(project.name) || slugify(projectId.slice(0, 8));

  const files = (latestGen.files as Array<{ path: string; content: string }>).map((f) => ({
    filename: f.path,
    content: f.content,
  }));

  // Phase 1: upload files + create deployment (~5-10s) — synchronous so errors surface
  let handle: Awaited<ReturnType<typeof vercelDeployStart>>;
  try {
    handle = await vercelDeployStart({ files, slug });
  } catch (err) {
    console.error("[vercel deploy] start failed:", err);
    return c.json({ error: "deploy_failed", detail: String(err) }, 502);
  }

  const { deploymentId, url, _token, _teamId } = handle;

  // Phase 2: poll in background — use a fresh DB client so it outlives the request
  void (async () => {
    const db = createStudioDbClient();
    try {
      await pollUntilReady(_token, _teamId, deploymentId);
      await db.updateProject(projectId, {
        beomz_app_url: url,
        beomz_app_deployed_at: new Date().toISOString(),
      });
      console.log(`[vercel deploy] ready: ${url}`);
    } catch (err) {
      console.error("[vercel deploy] background poll failed:", err);
    }
  })();

  // Return 202 immediately — frontend polls /status
  return c.json({ ok: true, deploymentId, status: "deploying" }, 202);
});

// ── GET /api/projects/:id/deploy/vercel/status ───────────────────────────────

vercelDeployRoute.get("/status", verifyPlatformJwt, loadOrgContext, async (c) => {
  const orgContext = c.get("orgContext") as OrgContext;
  const projectId = c.req.param("id") as string;

  const project = await orgContext.db.findProjectById(projectId);
  if (!project || project.org_id !== orgContext.org.id) {
    return c.json({ error: "Project not found" }, 404);
  }

  if (project.beomz_app_url) {
    return c.json({ status: "ready", url: project.beomz_app_url });
  }

  return c.json({ status: "deploying" });
});
