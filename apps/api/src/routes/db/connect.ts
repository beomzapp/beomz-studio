/**
 * POST /api/projects/:id/db/connect
 *
 * BYO Supabase: connect a user's own Supabase project.
 * Accepts URL + anon key ONLY — service role key is intentionally not supported.
 * Credentials are stored server-side in projects.db_config (never returned to client).
 */
import { Hono } from "hono";

import { loadOrgContext } from "../../middleware/loadOrgContext.js";
import { verifyPlatformJwt } from "../../middleware/verifyPlatformJwt.js";
import type { OrgContext } from "../../types.js";

const connectDbRoute = new Hono();

connectDbRoute.post("/", verifyPlatformJwt, loadOrgContext, async (c) => {
  const projectId = c.req.param("id") as string;
  const orgContext = c.get("orgContext") as OrgContext;
  const { db, org } = orgContext;

  const project = await db.findProjectById(projectId);
  if (!project || project.org_id !== org.id) {
    return c.json({ error: "Project not found" }, 404);
  }

  const body = (await c.req.json()) as { url?: unknown; anonKey?: unknown };
  const url = typeof body.url === "string" ? body.url.trim() : null;
  const anonKey = typeof body.anonKey === "string" ? body.anonKey.trim() : null;

  if (!url || !anonKey) {
    return c.json({ error: "url and anonKey are required" }, 400);
  }

  // Validate URL format
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return c.json({ error: "Invalid Supabase URL" }, 400);
  }

  if (!parsedUrl.hostname.endsWith(".supabase.co")) {
    return c.json({ error: "URL must be a Supabase project URL (*.supabase.co)" }, 400);
  }

  // Test the connection by hitting the REST health endpoint
  try {
    const testRes = await fetch(`${url.replace(/\/$/, "")}/rest/v1/`, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
    });
    if (!testRes.ok && testRes.status !== 406) {
      return c.json(
        { error: `Supabase connection test failed (${testRes.status})` },
        400,
      );
    }
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : "Connection test failed" },
      400,
    );
  }

  // Store only url + anonKey — never service role key
  await db.updateProject(projectId, {
    byo_db_url: null,
    byo_db_anon_key: null,
    byo_db_service_key: null,
    supabase_oauth_access_token: null,
    supabase_oauth_refresh_token: null,
    database_enabled: true,
    db_provider: "supabase",
    db_config: { url, anonKey },
    db_schema: null,
    db_nonce: null,
    db_wired: false,
  });

  return c.json({ status: "connected", provider: "supabase" });
});

export default connectDbRoute;
