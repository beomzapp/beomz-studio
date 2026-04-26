import { setTimeout as delay } from "node:timers/promises";

import { Hono } from "hono";
import type { Context, MiddlewareHandler } from "hono";
import { z } from "zod";

import { apiConfig } from "../../config.js";
import {
  addDomainToProjectRecord,
  addProjectDomain,
  deleteProjectDomain,
  listProjectDomains,
  normalizeCustomDomain,
  removeDomainFromProjectRecord,
  verifyProjectDomain,
  VercelApiError,
  type VercelProjectDomain,
} from "../vercelDomains.js";
import { loadOrgContext } from "../../middleware/loadOrgContext.js";
import { verifyPlatformJwt } from "../../middleware/verifyPlatformJwt.js";
import type { OrgContext } from "../../types.js";

const addCustomDomainSchema = z.object({
  domain: z.string().trim().min(1).max(253),
}).strict();

const STUDIO_DB_SCHEMA_RELOAD_DELAY_MS = 750;
const SUPABASE_MANAGEMENT_API_BASE = "https://api.supabase.com/v1";

export interface VercelDomainsRouteDeps {
  authMiddleware?: MiddlewareHandler;
  loadOrgContextMiddleware?: MiddlewareHandler;
  addProjectDomain?: typeof addProjectDomain;
  verifyProjectDomain?: typeof verifyProjectDomain;
  listProjectDomains?: typeof listProjectDomains;
  deleteProjectDomain?: typeof deleteProjectDomain;
}

function domainResponsePayload(
  domain: string,
  result: Pick<VercelProjectDomain, "verified" | "verification"> & {
    registrar?: string | null;
    docsUrl?: string | null;
  },
) {
  return {
    domain,
    verified: result.verified === true,
    verification: Array.isArray(result.verification) ? result.verification : [],
    registrar: result.registrar ?? null,
    docsUrl: result.docsUrl ?? null,
  };
}

function requireCustomDomainPlan(c: Pick<Context, "json">, orgContext: OrgContext) {
  if ((orgContext.org.plan ?? "free") !== "free") {
    return null;
  }

  return c.json({ error: "upgrade_required", requiredPlan: "starter" }, 403);
}

async function loadOwnedProject(orgContext: OrgContext, projectId: string) {
  const project = await orgContext.db.findProjectById(projectId);
  if (!project || project.org_id !== orgContext.org.id) {
    return null;
  }
  return project;
}

function parseRequestedDomain(raw: string): string | null {
  return normalizeCustomDomain(raw);
}

function getStudioProjectRef(): string {
  return new URL(apiConfig.STUDIO_SUPABASE_URL).hostname.split(".")[0] ?? "";
}

async function ensureCustomDomainProjectColumn(fetchFn: typeof fetch = fetch): Promise<void> {
  const managementKey = apiConfig.SUPABASE_MANAGEMENT_API_KEY?.trim();
  if (!managementKey) {
    return;
  }

  const response = await fetchFn(
    `${SUPABASE_MANAGEMENT_API_BASE}/projects/${getStudioProjectRef()}/database/query`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${managementKey}`,
      },
      body: JSON.stringify({
        query: "ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS custom_domains TEXT[] DEFAULT '{}';",
      }),
    },
  );

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Failed to ensure custom_domains column (${response.status}): ${body}`);
  }
}

async function updateProjectCustomDomainsWithRetry(
  orgContext: OrgContext,
  projectId: string,
  customDomains: readonly string[],
): Promise<void> {
  try {
    await orgContext.db.updateProject(projectId, { custom_domains: customDomains });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/custom_domains|schema cache/i.test(message)) {
      throw error;
    }

    await ensureCustomDomainProjectColumn().catch(() => undefined);
    const dbWithSchemaReload = orgContext.db as OrgContext["db"] & {
      notifySchemaReload?: () => Promise<void>;
    };
    await dbWithSchemaReload.notifySchemaReload?.().catch(() => undefined);
    await delay(STUDIO_DB_SCHEMA_RELOAD_DELAY_MS);
    await orgContext.db.updateProject(projectId, { custom_domains: customDomains });
  }
}

function respondToVercelError(c: Pick<Context, "json">, error: unknown) {
  if (error instanceof VercelApiError) {
    const status = error.status >= 500 ? 502 : error.status;
    return new Response(JSON.stringify({
      error: "vercel_error",
      message: error.friendlyMessage,
      detail: error.rawBody,
      ...(error.code ? { code: error.code } : {}),
    }), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }

  const detail = error instanceof Error ? error.message : String(error);
  return c.json({
    error: "vercel_error",
    message: "Failed to add domain. Please try again.",
    detail,
  }, 502);
}

export function createVercelDomainsRoute(deps: VercelDomainsRouteDeps = {}) {
  const vercelDomainsRoute = new Hono();
  const authMiddleware = deps.authMiddleware ?? verifyPlatformJwt;
  const loadOrgContextMiddleware = deps.loadOrgContextMiddleware ?? loadOrgContext;
  const addDomain = deps.addProjectDomain ?? addProjectDomain;
  const verifyDomain = deps.verifyProjectDomain ?? verifyProjectDomain;
  const listDomains = deps.listProjectDomains ?? listProjectDomains;
  const removeProjectDomainFromVercel = deps.deleteProjectDomain ?? deleteProjectDomain;

  vercelDomainsRoute.post("/", authMiddleware, loadOrgContextMiddleware, async (c) => {
    const orgContext = c.get("orgContext") as OrgContext;
    const planError = requireCustomDomainPlan(c, orgContext);
    if (planError) {
      return planError;
    }

    const projectId = c.req.param("id") as string;
    const project = await loadOwnedProject(orgContext, projectId);
    if (!project) {
      return c.json({ error: "Project not found" }, 404);
    }

    const body = await c.req.json().catch(() => null);
    const parsed = addCustomDomainSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "invalid_domain" }, 400);
    }

    const domain = parseRequestedDomain(parsed.data.domain);
    if (!domain) {
      return c.json({ error: "invalid_domain" }, 400);
    }

    try {
      const result = await addDomain(domain);
      await updateProjectCustomDomainsWithRetry(
        orgContext,
        projectId,
        addDomainToProjectRecord(project, domain),
      );

      return c.json(domainResponsePayload(domain, result));
    } catch (error) {
      return respondToVercelError(c, error);
    }
  });

  vercelDomainsRoute.post("/:domain/verify", authMiddleware, loadOrgContextMiddleware, async (c) => {
    const orgContext = c.get("orgContext") as OrgContext;
    const planError = requireCustomDomainPlan(c, orgContext);
    if (planError) {
      return planError;
    }

    const projectId = c.req.param("id") as string;
    const project = await loadOwnedProject(orgContext, projectId);
    if (!project) {
      return c.json({ error: "Project not found" }, 404);
    }

    const domain = parseRequestedDomain(c.req.param("domain"));
    if (!domain) {
      return c.json({ error: "invalid_domain" }, 400);
    }

    try {
      const result = await verifyDomain(domain);
      await updateProjectCustomDomainsWithRetry(
        orgContext,
        projectId,
        addDomainToProjectRecord(project, domain),
      );

      if (result.verified === true) {
        orgContext.db.updateProject(projectId, {
          custom_domain: domain,
          domain_status: "active",
        }).catch((err) => console.error("[domains/verify] failed to persist domain_status:", err));
      }

      return c.json({ verified: result.verified === true });
    } catch (error) {
      return respondToVercelError(c, error);
    }
  });

  vercelDomainsRoute.get("/", authMiddleware, loadOrgContextMiddleware, async (c) => {
    const orgContext = c.get("orgContext") as OrgContext;
    const planError = requireCustomDomainPlan(c, orgContext);
    if (planError) {
      return planError;
    }

    const projectId = c.req.param("id") as string;
    const project = await loadOwnedProject(orgContext, projectId);
    if (!project) {
      return c.json({ error: "Project not found" }, 404);
    }

    try {
      const listResult = await listDomains(project);

      const firstVerified = listResult.find((domainResult) => domainResult.verified === true);
      if (firstVerified && project.custom_domain !== firstVerified.domain) {
        orgContext.db.updateProject(projectId, {
          custom_domain: firstVerified.domain,
          domain_status: "active",
        }).catch((err) => console.error("[domains/list] failed to persist domain_status:", err));
      } else if (!firstVerified && project.domain_status === "active") {
        orgContext.db.updateProject(projectId, {
          custom_domain: null,
          domain_status: null,
        }).catch((err) => console.error("[domains/list] failed to clear domain_status:", err));
      }

      return c.json(listResult);
    } catch (error) {
      return respondToVercelError(c, error);
    }
  });

  vercelDomainsRoute.delete("/:domain", authMiddleware, loadOrgContextMiddleware, async (c) => {
    const orgContext = c.get("orgContext") as OrgContext;
    const planError = requireCustomDomainPlan(c, orgContext);
    if (planError) {
      return planError;
    }

    const projectId = c.req.param("id") as string;
    const project = await loadOwnedProject(orgContext, projectId);
    if (!project) {
      return c.json({ error: "Project not found" }, 404);
    }

    const domain = parseRequestedDomain(c.req.param("domain"));
    if (!domain) {
      return c.json({ error: "invalid_domain" }, 400);
    }

    try {
      await removeProjectDomainFromVercel(domain);
      await updateProjectCustomDomainsWithRetry(
        orgContext,
        projectId,
        removeDomainFromProjectRecord(project, domain),
      );

      if (project.custom_domain === domain) {
        orgContext.db.updateProject(projectId, {
          custom_domain: null,
          domain_status: null,
        }).catch((err) => console.error("[domains/delete] failed to clear domain_status:", err));
      }

      return c.json({ deleted: true });
    } catch (error) {
      return respondToVercelError(c, error);
    }
  });

  return vercelDomainsRoute;
}
