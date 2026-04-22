/**
 * GET /projects
 *
 * Returns all projects for the authenticated user's org, ordered by
 * last_opened_at desc (recently opened first) then updated_at desc.
 * Also returns the generation count per project and plan gate metadata.
 */
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

import { projectIterationOperation } from "@beomz-studio/operations";
import type { StudioFile, TemplateId } from "@beomz-studio/contracts";
import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";

import { apiConfig } from "../../config.js";
import { loadOrgContext } from "../../middleware/loadOrgContext.js";
import { verifyPlatformJwt } from "../../middleware/verifyPlatformJwt.js";
import type { OrgContext } from "../../types.js";
import { mapProjectRowToProject } from "../builds/shared.js";
import { PLAN_LIMITS } from "../../lib/credits.js";
import {
  deleteSchemaRegistry,
  isUserDataConfigured,
  runSql,
} from "../../lib/userDataClient.js";
import { deleteNeonProject } from "../../lib/neonClient.js";
import { parseSupabaseProjectUrl } from "../../lib/projectDb.js";
import { runBuildInBackground } from "../builds/generate.js";

interface ProjectsRouteDeps {
  authMiddleware?: MiddlewareHandler;
  loadOrgContextMiddleware?: MiddlewareHandler;
  isUserDataConfigured?: typeof isUserDataConfigured;
  runSql?: typeof runSql;
  deleteSchemaRegistry?: typeof deleteSchemaRegistry;
  deleteNeonProject?: typeof deleteNeonProject;
  ensureByoDbAnonKeyColumn?: () => Promise<void>;
  runBuildInBackground?: typeof runBuildInBackground;
}

const SUPABASE_MANAGEMENT_API_BASE = "https://api.supabase.com/v1";
const STUDIO_DB_SCHEMA_RELOAD_DELAY_MS = 750;
const AUTO_WIRE_BUILD_MODEL = "claude-sonnet-4-6";
const AUTO_WIRE_ITERATION_PROMPT = [
  "Rewire the entire app to use Supabase instead of hardcoded data.",
  "Import createClient from @supabase/supabase-js and use",
  "import.meta.env.VITE_SUPABASE_URL and import.meta.env.VITE_SUPABASE_ANON_KEY.",
  "Replace all hardcoded arrays and sample data with real Supabase queries.",
  "Use useEffect + useState for data fetching with loading and error states.",
].join("\n");

function getStudioProjectRef(): string {
  return new URL(apiConfig.STUDIO_SUPABASE_URL).hostname.split(".")[0] ?? "";
}

async function ensureByoDbAnonKeyColumn(): Promise<void> {
  const managementKey = apiConfig.SUPABASE_MANAGEMENT_API_KEY?.trim();
  if (!managementKey) {
    return;
  }

  const response = await fetch(
    `${SUPABASE_MANAGEMENT_API_BASE}/projects/${getStudioProjectRef()}/database/query`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${managementKey}`,
      },
      body: JSON.stringify({
        query: "ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS byo_db_anon_key TEXT;",
      }),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to migrate projects.byo_db_anon_key (${response.status}): ${body}`);
  }
}

export function createProjectsRoute(deps: ProjectsRouteDeps = {}) {
  const projectsRoute = new Hono();
  const authMiddleware = deps.authMiddleware ?? verifyPlatformJwt;
  const loadOrgContextMiddleware = deps.loadOrgContextMiddleware ?? loadOrgContext;
  const isUserDataConfiguredFn = deps.isUserDataConfigured ?? isUserDataConfigured;
  const runSqlFn = deps.runSql ?? runSql;
  const deleteSchemaRegistryFn = deps.deleteSchemaRegistry ?? deleteSchemaRegistry;
  const deleteNeonProjectFn = deps.deleteNeonProject ?? deleteNeonProject;
  const ensureByoDbAnonKeyColumnFn = deps.ensureByoDbAnonKeyColumn ?? ensureByoDbAnonKeyColumn;
  const runBuildInBackgroundFn = deps.runBuildInBackground ?? runBuildInBackground;

  projectsRoute.get("/:id", authMiddleware, loadOrgContextMiddleware, async (c) => {
    try {
      const orgContext = c.get("orgContext") as OrgContext;
      const projectId = c.req.param("id");

      const project = await orgContext.db.findProjectById(projectId);
      if (!project || project.org_id !== orgContext.org.id) {
        return c.json({ error: "Project not found" }, 404);
      }

      return c.json({
        ...mapProjectRowToProject(project),
        // Extra fields not on the core Project type
        database_enabled: Boolean(project.database_enabled),
        db_provider: project.db_provider ?? null,
        db_wired: Boolean(project.db_wired),
        thumbnail_url: project.thumbnail_url ?? null,
        published: Boolean(project.published),
        published_slug: project.published_slug ?? null,
        beomz_app_url: project.beomz_app_url ?? null,
      });
    } catch (err) {
      console.error("[GET /projects/:id] error:", err);
      return c.json({ error: "Failed to load project." }, 500);
    }
  });

  projectsRoute.get("/", authMiddleware, loadOrgContextMiddleware, async (c) => {
    try {
      const orgContext = c.get("orgContext") as OrgContext;

      const rows = await orgContext.db.findProjectsByOrgId(orgContext.org.id);

      const genCounts = await orgContext.db.countGenerationsByProjectIds(
        rows.map((r) => r.id),
      );

      const projects = rows.map((row) => ({
        ...mapProjectRowToProject(row),
        generationCount: genCounts[row.id] ?? 0,
        // BEO-130: DB status for the frontend (no credentials, no nonce)
        database_enabled: Boolean(row.database_enabled),
        db_provider: row.db_provider ?? null,
        db_wired: Boolean(row.db_wired),
        // BEO-300: thumbnail for project cards
        thumbnail_url: row.thumbnail_url ?? null,
        // BEO-262: Publish
        published: Boolean(row.published),
        published_slug: row.published_slug ?? null,
        beomz_app_url: row.beomz_app_url ?? null,
      }));
      const plan = orgContext.org.plan ?? "free";
      const planLimit = PLAN_LIMITS[plan as keyof typeof PLAN_LIMITS] ?? PLAN_LIMITS.free;
      // Free plan is capped at 3 projects; paid plans are unlimited (-1 = unlimited)
      const maxProjects = plan === "free" ? 3 : -1;

      return c.json({
        projects,
        plan,
        maxProjects,
        canCreateMore: maxProjects === -1 || projects.length < maxProjects,
        planCredits: planLimit.credits,
      });
    } catch (err) {
      console.error("[GET /projects] error:", err);
      return c.json({ error: "Failed to load projects." }, 500);
    }
  });

  projectsRoute.delete("/:id", authMiddleware, loadOrgContextMiddleware, async (c) => {
    const orgContext = c.get("orgContext") as OrgContext;
    const projectId = c.req.param("id");

    const project = await orgContext.db.findProjectById(projectId);
    if (!project || project.org_id !== orgContext.org.id) {
      return c.json({ error: "Project not found" }, 404);
    }

    let neonProjectId: string | null = null;
    try {
      const dbWithLimits = orgContext.db as OrgContext["db"] & {
        getProjectDbLimits?: (projectId: string) => Promise<{ neon_project_id?: string | null } | null>;
      };
      const limits = await dbWithLimits.getProjectDbLimits?.(projectId);
      neonProjectId = typeof limits?.neon_project_id === "string" ? limits.neon_project_id : null;
    } catch (err) {
      console.error("[projects/delete] failed reading project_db_limits (non-fatal):", err);
    }

    await orgContext.db.deleteProject(projectId);

    try {
      const dbWithCleanup = orgContext.db as OrgContext["db"] & {
        deleteProjectDbLimits?: (projectId: string) => Promise<void>;
      };
      await dbWithCleanup.deleteProjectDbLimits?.(projectId);

      if (project.db_provider === "beomz" && isUserDataConfiguredFn()) {
        const schemasToDrop = new Set<string>([`project_${projectId}`]);
        if (project.db_schema) {
          schemasToDrop.add(project.db_schema);
        }

        for (const schemaName of schemasToDrop) {
          await runSqlFn(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE;`);
        }

        if (project.db_schema) {
          await deleteSchemaRegistryFn(project.db_schema);
        }
      }

      if (neonProjectId) {
        await deleteNeonProjectFn(neonProjectId).catch((err) => {
          console.error("[delete] Neon cleanup failed:", err);
          // Non-fatal
        });
      }
    } catch (err) {
      console.error("[projects/delete] cleanup error:", err);
      // Deletion should still succeed even if DB cleanup fails.
    }

    return c.json({ ok: true });
  });

  projectsRoute.patch("/:id", authMiddleware, loadOrgContextMiddleware, async (c) => {
    const orgContext = c.get("orgContext") as OrgContext;
    const projectId = c.req.param("id");

    const project = await orgContext.db.findProjectById(projectId);
    if (!project || project.org_id !== orgContext.org.id) {
      return c.json({ error: "Project not found" }, 404);
    }

    const body = await c.req.json<{ name?: string }>();
    if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
      return c.json({ error: "Name is required" }, 400);
    }

    await orgContext.db.updateProject(projectId, { name: body.name.trim() });

    return c.json({ ok: true });
  });

  projectsRoute.post("/:id/byo-db", authMiddleware, loadOrgContextMiddleware, async (c) => {
    const orgContext = c.get("orgContext") as OrgContext;
    const projectId = c.req.param("id");

    const project = await orgContext.db.findProjectById(projectId);
    if (!project || project.org_id !== orgContext.org.id) {
      return c.json({ error: "Project not found" }, 404);
    }

    const body = await c.req.json().catch(() => null) as {
      supabaseUrl?: unknown;
      supabaseAnonKey?: unknown;
    } | null;
    const rawSupabaseUrl = typeof body?.supabaseUrl === "string"
      ? body.supabaseUrl
      : "";
    if (!rawSupabaseUrl.trim()) {
      return c.json({ error: "supabaseUrl is required" }, 400);
    }

    const supabaseAnonKey = typeof body?.supabaseAnonKey === "string"
      ? body.supabaseAnonKey.trim()
      : "";
    if (!supabaseAnonKey) {
      return c.json({ error: "supabaseAnonKey is required" }, 400);
    }

    let parsed: { supabaseUrl: string; host: string };
    try {
      parsed = parseSupabaseProjectUrl(rawSupabaseUrl);
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : "Invalid Supabase URL" },
        400,
      );
    }

    try {
      await ensureByoDbAnonKeyColumnFn();
    } catch (error) {
      console.error("[projects/byo-db] failed ensuring byo_db_anon_key column:", error);
      return c.json({ error: "Failed to prepare BYO DB storage" }, 500);
    }

    const patch = {
      byo_db_url: parsed.supabaseUrl,
      byo_db_anon_key: supabaseAnonKey,
    };

    try {
      await orgContext.db.updateProject(projectId, patch);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/byo_db_anon_key|schema cache/i.test(message)) {
        throw error;
      }

      const dbWithSchemaReload = orgContext.db as OrgContext["db"] & {
        notifySchemaReload?: () => Promise<void>;
      };
      await dbWithSchemaReload.notifySchemaReload?.().catch(() => undefined);
      await delay(STUDIO_DB_SCHEMA_RELOAD_DELAY_MS);
      await orgContext.db.updateProject(projectId, patch);
    }

    const latestGeneration = await orgContext.db.findLatestGenerationByProjectId(projectId);
    const existingFiles = Array.isArray(latestGeneration?.files)
      ? latestGeneration.files as readonly StudioFile[]
      : [];
    const shouldAutoWire = existingFiles.length > 0;

    if (shouldAutoWire) {
      const buildId = randomUUID();
      const requestedAt = new Date().toISOString();
      const operationId = projectIterationOperation.id;

      await orgContext.db.createGeneration({
        completed_at: null,
        error: null,
        files: [],
        id: buildId,
        metadata: {
          sourcePrompt: AUTO_WIRE_ITERATION_PROMPT,
          autoWire: "byo_supabase",
          builderTrace: {
            events: [
              {
                code: "build_queued",
                id: "1",
                message: "Supabase wiring queued.",
                operation: "iteration",
                timestamp: requestedAt,
                type: "status",
                phase: "queued",
              },
            ],
            lastEventId: "1",
            previewReady: false,
            fallbackReason: null,
            fallbackUsed: false,
          },
        },
        operation_id: operationId,
        output_paths: [],
        preview_entry_path: "/",
        project_id: projectId,
        prompt: AUTO_WIRE_ITERATION_PROMPT,
        started_at: requestedAt,
        status: "queued",
        summary: `Queued Supabase wiring for ${project.name}.`,
        template_id: project.template as TemplateId,
        warnings: [],
      });

      runBuildInBackgroundFn(
        {
          buildId,
          projectId,
          orgId: orgContext.org.id,
          userId: orgContext.user.id,
          userEmail: orgContext.user.email,
          prompt: AUTO_WIRE_ITERATION_PROMPT,
          sourcePrompt: AUTO_WIRE_ITERATION_PROMPT,
          templateId: project.template,
          model: AUTO_WIRE_BUILD_MODEL,
          requestedAt,
          operationId,
          isIteration: true,
          existingFiles,
          projectName: project.name,
        },
        orgContext.db,
      ).catch((error: unknown) => {
        console.error("[projects/byo-db] auto-wire iteration failed:", error);
      });
    }

    return c.json({ success: true, host: parsed.host, wiring: shouldAutoWire });
  });

  projectsRoute.delete("/:id/byo-db", authMiddleware, loadOrgContextMiddleware, async (c) => {
    const orgContext = c.get("orgContext") as OrgContext;
    const projectId = c.req.param("id");

    const project = await orgContext.db.findProjectById(projectId);
    if (!project || project.org_id !== orgContext.org.id) {
      return c.json({ error: "Project not found" }, 404);
    }

    await orgContext.db.updateProject(projectId, {
      byo_db_url: null,
      byo_db_anon_key: null,
    });

    return c.json({ ok: true });
  });

  return projectsRoute;
}

const projectsRoute = createProjectsRoute();

export default projectsRoute;
