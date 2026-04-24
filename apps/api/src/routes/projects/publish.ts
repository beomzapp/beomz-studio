/**
 * BEO-262: Publish backend
 *
 * POST   /api/projects/:id/publish        — publish project at slug
 * DELETE /api/projects/:id/publish        — unpublish project
 * GET    /api/p/:slug                     — PUBLIC: fetch published project data
 * GET    /api/projects/check-slug         — PUBLIC: check slug availability
 * GET    /api/projects/:id/export         — AUTH: download ZIP of latest files
 */
import archiver from "archiver";
import { Hono } from "hono";
import { stream } from "hono/streaming";

import type { StudioFile } from "@beomz-studio/contracts";
import { createStudioDbClient } from "@beomz-studio/studio-db";

import { upsertEnvFile } from "../../lib/envFile.js";
import { loadOrgContext } from "../../middleware/loadOrgContext.js";
import { verifyPlatformJwt } from "../../middleware/verifyPlatformJwt.js";
import type { OrgContext } from "../../types.js";

const SLUG_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
const SLUG_MAX = 50;

function validateSlug(slug: string): string | null {
  if (!slug || typeof slug !== "string") return "Slug is required";
  if (slug.length > SLUG_MAX) return `Slug must be ${SLUG_MAX} chars or fewer`;
  if (!SLUG_RE.test(slug)) {
    return "Slug must be lowercase letters, numbers, and hyphens only — no leading or trailing hyphens";
  }
  return null;
}

type PublishDbLookup = {
  byo_db_url?: unknown;
  byo_db_anon_key?: unknown;
  db_wired?: unknown;
  db_schema?: unknown;
};

type PublishedDbCredentials = {
  supabaseUrl: string | undefined;
  supabaseAnonKey: string | undefined;
  schemaName: string | null;
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
  VITE_BYO_DB?: string;
};

function getByoSupabasePublishConfig(
  project: PublishDbLookup,
): { url: string; anonKey: string } | null {
  const url = typeof project.byo_db_url === "string" ? project.byo_db_url.trim() : "";
  const anonKey = typeof project.byo_db_anon_key === "string" ? project.byo_db_anon_key.trim() : "";

  if (!url || !anonKey) {
    return null;
  }

  return { url, anonKey };
}

export function buildPublishedDbCredentials(
  project: PublishDbLookup,
): PublishedDbCredentials | null {
  const byoSupabase = getByoSupabasePublishConfig(project);
  if (byoSupabase) {
    return {
      supabaseUrl: byoSupabase.url,
      supabaseAnonKey: byoSupabase.anonKey,
      schemaName: "public",
      VITE_SUPABASE_URL: byoSupabase.url,
      VITE_SUPABASE_ANON_KEY: byoSupabase.anonKey,
      VITE_BYO_DB: "true",
    };
  }

  if (project.db_wired) {
    return {
      supabaseUrl: process.env.USER_DATA_SUPABASE_URL,
      supabaseAnonKey: process.env.USER_DATA_SUPABASE_ANON_KEY,
      schemaName: typeof project.db_schema === "string" ? project.db_schema : null,
    };
  }

  return null;
}

export function injectPublishedByoEnvFiles(
  files: readonly StudioFile[],
  project: PublishDbLookup,
): readonly StudioFile[] {
  const byoSupabase = getByoSupabasePublishConfig(project);
  if (!byoSupabase) {
    return files;
  }

  return upsertEnvFile(files, {
    VITE_SUPABASE_URL: byoSupabase.url,
    VITE_SUPABASE_ANON_KEY: byoSupabase.anonKey,
    VITE_BYO_DB: "true",
    VITE_DATABASE_URL: null,
    VITE_DB_SCHEMA: null,
    VITE_NEON_AUTH_URL: null,
    NEON_AUTH_SECRET: null,
    NEON_AUTH_PUB_KEY: null,
  });
}

// ── POST /api/projects/:id/publish ────────────────────────────────────────────

export const publishRoute = new Hono();

publishRoute.post("/", verifyPlatformJwt, loadOrgContext, async (c) => {
  const orgContext = c.get("orgContext") as OrgContext;
  const projectId = c.req.param("id") as string;

  const project = await orgContext.db.findProjectById(projectId);
  if (!project || project.org_id !== orgContext.org.id) {
    return c.json({ error: "Project not found" }, 404);
  }

  const body = await c.req.json<{ slug?: string }>();
  const slug = (body.slug ?? "").trim().toLowerCase();

  const slugError = validateSlug(slug);
  if (slugError) return c.json({ error: slugError }, 400);

  // Check uniqueness — allow re-publish with the same slug if it's already ours
  const existing = await orgContext.db.findProjectByPublishedSlug(slug);
  if (existing && existing.id !== projectId) {
    return c.json({ error: "slug_taken" }, 409);
  }

  await orgContext.db.updateProject(projectId, {
    published: true,
    published_slug: slug,
    published_at: new Date().toISOString(),
  });

  return c.json({ ok: true, url: `https://${slug}.beomz.ai` });
});

// ── DELETE /api/projects/:id/publish ──────────────────────────────────────────

publishRoute.delete("/", verifyPlatformJwt, loadOrgContext, async (c) => {
  const orgContext = c.get("orgContext") as OrgContext;
  const projectId = c.req.param("id") as string;

  const project = await orgContext.db.findProjectById(projectId);
  if (!project || project.org_id !== orgContext.org.id) {
    return c.json({ error: "Project not found" }, 404);
  }

  await orgContext.db.updateProject(projectId, {
    published: false,
    published_slug: null,
    published_at: null,
  });

  return c.json({ ok: true });
});

// ── GET /api/p/:slug  (PUBLIC — no auth) ─────────────────────────────────────

export const publicSlugRoute = new Hono();

publicSlugRoute.get("/:slug", async (c) => {
  const slug = c.req.param("slug");
  const db = createStudioDbClient();

  const project = await db.findProjectByPublishedSlug(slug);
  if (!project) return c.json({ error: "Not found" }, 404);
  console.log("[publish] byo creds:", project.byo_db_url, !!project.byo_db_anon_key);

  const latestGen = await db.findLatestGenerationByProjectId(project.id);
  const files = latestGen?.files ?? [];

  const dbCredentials = buildPublishedDbCredentials(project);

  return c.json({
    projectId: project.id,
    projectName: project.name,
    files,
    dbCredentials,
  });
});

// ── GET /api/projects/check-slug  (PUBLIC — no auth) ─────────────────────────

export const checkSlugRoute = new Hono();

checkSlugRoute.get("/", async (c) => {
  const slug = (c.req.query("slug") ?? "").trim().toLowerCase();
  if (!slug) return c.json({ available: false });

  const db = createStudioDbClient();
  const existing = await db.findProjectByPublishedSlug(slug);
  return c.json({ available: !existing });
});

// ── GET /api/projects/:id/export  (AUTH required) ─────────────────────────────

export const exportRoute = new Hono();

exportRoute.get("/", verifyPlatformJwt, loadOrgContext, async (c) => {
  const orgContext = c.get("orgContext") as OrgContext;
  const projectId = c.req.param("id") as string;

  const project = await orgContext.db.findProjectById(projectId);
  if (!project || project.org_id !== orgContext.org.id) {
    return c.json({ error: "Project not found" }, 404);
  }

  const latestGen = await orgContext.db.findLatestGenerationByProjectId(projectId);
  if (!latestGen || !Array.isArray(latestGen.files) || latestGen.files.length === 0) {
    return c.json({ error: "No generated files found" }, 404);
  }

  const files = injectPublishedByoEnvFiles(
    latestGen.files as readonly StudioFile[],
    project,
  );
  const safeName = project.name.replace(/[^a-zA-Z0-9_-]/g, "_");

  return stream(c, async (s) => {
    c.header("Content-Type", "application/zip");
    c.header("Content-Disposition", `attachment; filename="${safeName}.zip"`);

    const archive = archiver("zip", { zlib: { level: 6 } });

    archive.on("data", (chunk: Buffer) => {
      void s.write(chunk);
    });

    for (const file of files) {
      archive.append(file.content, { name: file.path });
    }

    await archive.finalize();
  });
});
