/**
 * POST /api/projects/:id/deploy/vercel
 *
 * Deploys the project's latest generated files to Vercel, creating a
 * production deployment aliased to <slug>.beomz.app.
 */
import { Hono } from "hono";

import { loadOrgContext } from "../../middleware/loadOrgContext.js";
import { verifyPlatformJwt } from "../../middleware/verifyPlatformJwt.js";
import type { OrgContext } from "../../types.js";
import { vercelDeploy } from "../../lib/vercelDeploy.js";

// Lowercase, spaces → hyphens, alphanumeric + hyphens only, max 40 chars
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export const vercelDeployRoute = new Hono();

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

  let result: Awaited<ReturnType<typeof vercelDeploy>>;
  try {
    result = await vercelDeploy({ files, slug });
  } catch (err) {
    console.error("[vercel deploy] failed:", err);
    return c.json({ error: "deploy_failed", detail: String(err) }, 502);
  }

  await orgContext.db.updateProject(projectId, {
    beomz_app_url: result.url,
    beomz_app_deployed_at: new Date().toISOString(),
  });

  return c.json({ ok: true, url: result.url });
});
