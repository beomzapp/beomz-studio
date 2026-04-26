import { createRemoteJWKSet, jwtVerify } from "jose";
import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import { z } from "zod";

import { apiConfig } from "../../config.js";
import { resolveAuthTier } from "../../lib/authTiers/index.js";
import { AuthTierError, type AuthTier, type AuthTierKind } from "../../lib/authTiers/shared.js";
import { getProjectPostgresUrl } from "../../lib/projectDb.js";
import { loadOrgContext } from "../../middleware/loadOrgContext.js";
import type { VerifiedPlatformJwt } from "../../middleware/verifyPlatformJwt.js";
import type { OrgContext } from "../../types.js";

const projectPlatformJwks = createRemoteJWKSet(new URL(apiConfig.PLATFORM_JWKS_URL));

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const PROJECT_AUTH_CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "Authorization, Content-Type, X-Beomz-Platform-Authorization",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "cross-origin-resource-policy": "cross-origin",
} as const;

interface ProjectAuthRouteDeps {
  authMiddleware?: MiddlewareHandler;
  loadOrgContextMiddleware?: MiddlewareHandler;
  resolveAuthTierFn?: typeof resolveAuthTier;
}

function applyProjectAuthHeaders(c: Parameters<MiddlewareHandler>[0], tierKind?: AuthTierKind) {
  for (const [name, value] of Object.entries(PROJECT_AUTH_CORS_HEADERS)) {
    c.res.headers.set(name, value);
  }

  if (tierKind) {
    c.res.headers.set("X-Beomz-Auth", tierKind);
  }
}

function unauthorized(c: Parameters<MiddlewareHandler>[0], message: string) {
  return c.json({ error: message }, 401);
}

const verifyProjectPlatformJwt: MiddlewareHandler = async (c, next) => {
  const authHeader = c.req.header("x-beomz-platform-authorization")
    ?? c.req.header("authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return unauthorized(c, "Missing bearer token.");
  }

  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) {
    return unauthorized(c, "Missing bearer token.");
  }

  try {
    const { payload } = await jwtVerify(token, projectPlatformJwks);
    if (typeof payload.sub !== "string" || payload.sub.length === 0) {
      return unauthorized(c, "Invalid token subject.");
    }

    c.set("platformJwt", payload as VerifiedPlatformJwt);
    await next();
  } catch {
    return unauthorized(c, "Invalid bearer token.");
  }
};

function readBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

function respondWithAuthError(
  c: Parameters<MiddlewareHandler>[0],
  error: unknown,
) {
  if (error instanceof AuthTierError) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: {
        "content-type": "application/json",
      },
      status: error.status,
    });
  }

  console.error("[project auth proxy] request failed:", error);
  return c.json({ error: "Project auth request failed" }, 500);
}

async function loadOwnedAuthTier(
  orgContext: OrgContext,
  projectId: string,
  resolveAuthTierFn: typeof resolveAuthTier,
): Promise<AuthTier> {
  const project = await orgContext.db.findProjectById(projectId);
  if (!project || project.org_id !== orgContext.org.id) {
    throw new AuthTierError(404, "Project not found");
  }

  const limits = typeof orgContext.db.getProjectDbLimits === "function"
    ? await orgContext.db.getProjectDbLimits(projectId)
    : null;

  return resolveAuthTierFn({
    ...project,
    resolved_db_url: getProjectPostgresUrl(project, limits),
  });
}

export function createProjectAuthRoute(deps: ProjectAuthRouteDeps = {}) {
  const projectAuthRoute = new Hono();
  const authMiddleware = deps.authMiddleware ?? verifyProjectPlatformJwt;
  const loadOrgContextMiddleware = deps.loadOrgContextMiddleware ?? loadOrgContext;
  const resolveAuthTierFn = deps.resolveAuthTierFn ?? resolveAuthTier;

  projectAuthRoute.use("*", async (c, next) => {
    if (c.req.method === "OPTIONS") {
      return new Response(null, {
        headers: PROJECT_AUTH_CORS_HEADERS,
        status: 204,
      });
    }

    await next();
    applyProjectAuthHeaders(c);
  });

  projectAuthRoute.post("/signup", authMiddleware, loadOrgContextMiddleware, async (c) => {
    const projectId = c.req.param("id");
    if (!projectId) {
      return c.json({ error: "Project id is required" }, 400);
    }

    const orgContext = c.get("orgContext") as OrgContext;
    const body = await c.req.json().catch(() => null);
    const parsed = credentialsSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "Invalid auth payload" }, 400);
    }

    try {
      const tier = await loadOwnedAuthTier(orgContext, projectId, resolveAuthTierFn);
      applyProjectAuthHeaders(c, tier.kind);
      return c.json(await tier.signup(parsed.data.email, parsed.data.password), 201);
    } catch (error) {
      return respondWithAuthError(c, error);
    }
  });

  projectAuthRoute.post("/login", authMiddleware, loadOrgContextMiddleware, async (c) => {
    const projectId = c.req.param("id");
    if (!projectId) {
      return c.json({ error: "Project id is required" }, 400);
    }

    const orgContext = c.get("orgContext") as OrgContext;
    const body = await c.req.json().catch(() => null);
    const parsed = credentialsSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "Invalid auth payload" }, 400);
    }

    try {
      const tier = await loadOwnedAuthTier(orgContext, projectId, resolveAuthTierFn);
      applyProjectAuthHeaders(c, tier.kind);
      return c.json(await tier.login(parsed.data.email, parsed.data.password));
    } catch (error) {
      return respondWithAuthError(c, error);
    }
  });

  projectAuthRoute.post("/logout", authMiddleware, loadOrgContextMiddleware, async (c) => {
    const projectId = c.req.param("id");
    if (!projectId) {
      return c.json({ error: "Project id is required" }, 400);
    }

    const token = readBearerToken(c.req.header("authorization"));
    if (!token) {
      return c.json({ error: "Missing bearer token" }, 401);
    }

    const orgContext = c.get("orgContext") as OrgContext;

    try {
      const tier = await loadOwnedAuthTier(orgContext, projectId, resolveAuthTierFn);
      applyProjectAuthHeaders(c, tier.kind);
      return c.json(await tier.logout(token));
    } catch (error) {
      return respondWithAuthError(c, error);
    }
  });

  projectAuthRoute.get("/me", authMiddleware, loadOrgContextMiddleware, async (c) => {
    const projectId = c.req.param("id");
    if (!projectId) {
      return c.json({ error: "Project id is required" }, 400);
    }

    const token = readBearerToken(c.req.header("authorization"));
    if (!token) {
      return c.json({ error: "Missing bearer token" }, 401);
    }

    const orgContext = c.get("orgContext") as OrgContext;

    try {
      const tier = await loadOwnedAuthTier(orgContext, projectId, resolveAuthTierFn);
      applyProjectAuthHeaders(c, tier.kind);
      return c.json(await tier.me(token));
    } catch (error) {
      return respondWithAuthError(c, error);
    }
  });

  return projectAuthRoute;
}

const projectAuthRoute = createProjectAuthRoute();

export default projectAuthRoute;
