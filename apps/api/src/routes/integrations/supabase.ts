import { Hono } from "hono";
import { deleteCookie, getSignedCookie, setSignedCookie } from "hono/cookie";
import type { MiddlewareHandler } from "hono";

import { apiConfig } from "../../config.js";
import {
  connectProjectToSupabase,
  ensureSupabaseProjectColumns,
  AUTO_WIRE_SUPABASE_ITERATION_PROMPT,
} from "../../lib/supabaseByo.js";
import { decryptProjectSecret, encryptProjectSecret } from "../../lib/projectSecrets.js";
import {
  buildSupabaseOAuthCookieSecret,
  clearTemporarySupabaseOAuthTokens,
  createPkceCodeChallenge,
  exchangeSupabaseAuthorizationCode,
  generatePkceCodeVerifier,
  readTemporarySupabaseOAuthTokens,
  refreshSupabaseOAuthTokens,
  storeTemporarySupabaseOAuthTokens,
  SUPABASE_MANAGEMENT_API_BASE,
  SUPABASE_OAUTH_AUTHORIZE_URL,
  SUPABASE_OAUTH_CALLBACK_URL,
  SUPABASE_OAUTH_PKCE_COOKIE_NAME,
  SUPABASE_OAUTH_PKCE_TTL_SECONDS,
} from "../../lib/supabaseOAuth.js";
import { parseSupabaseProjectUrl } from "../../lib/projectDb.js";
import { loadOrgContext } from "../../middleware/loadOrgContext.js";
import { verifyPlatformJwt } from "../../middleware/verifyPlatformJwt.js";
import type { OrgContext } from "../../types.js";

interface SupabasePkceCookiePayload {
  codeVerifier: string;
  projectId: string;
}

interface SupabaseProjectSummary {
  id: string;
  ref: string;
  name: string;
  region: string | null;
}

interface SupabaseProjectProvisioningSummary {
  ref: string;
  name: string;
  region: string | null;
  status: string;
}

interface SupabaseOrganizationSummary {
  id: string;
  name: string;
}

interface ResolvedSupabaseManagementTokens {
  accessToken: string;
  refreshToken: string;
  persisted: boolean;
}

interface ManagementRequestResult {
  response: Response;
  tokens: {
    accessToken: string;
    refreshToken: string;
  };
}

interface SupabaseIntegrationsRouteDeps {
  authMiddleware?: MiddlewareHandler;
  loadOrgContextMiddleware?: MiddlewareHandler;
  fetch?: typeof fetch;
  connectProjectToSupabase?: typeof connectProjectToSupabase;
  ensureSupabaseProjectColumns?: typeof ensureSupabaseProjectColumns;
}

function readNonEmptyString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parsePkceCookiePayload(value: string): SupabasePkceCookiePayload | null {
  try {
    const parsed = JSON.parse(value) as {
      codeVerifier?: unknown;
      projectId?: unknown;
    };
    const codeVerifier = readNonEmptyString(parsed.codeVerifier);
    const projectId = readNonEmptyString(parsed.projectId);
    if (!codeVerifier || !projectId) {
      return null;
    }
    return { codeVerifier, projectId };
  } catch {
    return null;
  }
}

function parseSupabaseProjectSummaries(payload: unknown): SupabaseProjectSummary[] {
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as { data?: unknown[] })?.data)
      ? (payload as { data: unknown[] }).data
      : Array.isArray((payload as { projects?: unknown[] })?.projects)
        ? (payload as { projects: unknown[] }).projects
        : [];

  return rows.flatMap((row) => {
    if (typeof row !== "object" || row === null) {
      return [];
    }

    const record = row as {
      id?: unknown;
      ref?: unknown;
      name?: unknown;
      region?: unknown;
    };
    const id = readNonEmptyString(record.id);
    const ref = readNonEmptyString(record.ref);
    const name = readNonEmptyString(record.name);
    const region = typeof record.region === "string"
      ? record.region
      : typeof (record.region as { name?: unknown } | null | undefined)?.name === "string"
        ? readNonEmptyString((record.region as { name?: unknown }).name)
        : "";

    if (!id || !ref || !name) {
      return [];
    }

    return [{
      id,
      ref,
      name,
      region: region || null,
    }];
  });
}

function parseSupabaseProjectProvisioningSummary(
  payload: unknown,
): SupabaseProjectProvisioningSummary | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const record = payload as {
    ref?: unknown;
    name?: unknown;
    region?: unknown;
    status?: unknown;
  };
  const ref = readNonEmptyString(record.ref);
  const name = readNonEmptyString(record.name);
  const region = typeof record.region === "string"
    ? readNonEmptyString(record.region)
    : typeof (record.region as { name?: unknown } | null | undefined)?.name === "string"
      ? readNonEmptyString((record.region as { name?: unknown }).name)
      : "";
  const status = readNonEmptyString(record.status);

  if (!ref || !name || !status) {
    return null;
  }

  return {
    ref,
    name,
    region: region || null,
    status,
  };
}

function parseSupabaseProjectStatus(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const status = readNonEmptyString((payload as { status?: unknown }).status);
  return status || null;
}

function parseSupabaseOrganizationSummaries(payload: unknown): SupabaseOrganizationSummary[] {
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as { data?: unknown[] })?.data)
      ? (payload as { data: unknown[] }).data
      : Array.isArray((payload as { organizations?: unknown[] })?.organizations)
        ? (payload as { organizations: unknown[] }).organizations
        : [];

  return rows.flatMap((row) => {
    if (typeof row !== "object" || row === null) {
      return [];
    }

    const record = row as {
      id?: unknown;
      name?: unknown;
    };
    const id = readNonEmptyString(record.id);
    const name = readNonEmptyString(record.name);

    if (!id || !name) {
      return [];
    }

    return [{ id, name }];
  });
}

function extractNamedApiKey(
  payload: unknown,
  targetName: string,
): string | null {
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as { data?: unknown[] })?.data)
      ? (payload as { data: unknown[] }).data
      : Array.isArray((payload as { api_keys?: unknown[] })?.api_keys)
        ? (payload as { api_keys: unknown[] }).api_keys
        : [];

  for (const row of rows) {
    if (typeof row !== "object" || row === null) {
      continue;
    }

    const record = row as {
      name?: unknown;
      api_key?: unknown;
      apiKey?: unknown;
      key?: unknown;
      value?: unknown;
    };
    if (readNonEmptyString(record.name) !== targetName) {
      continue;
    }

    const apiKey = readNonEmptyString(record.api_key)
      || readNonEmptyString(record.apiKey)
      || readNonEmptyString(record.key)
      || readNonEmptyString(record.value);
    if (apiKey) {
      return apiKey;
    }
  }

  return null;
}

function getPersistedSupabaseManagementTokens(
  project: Record<string, unknown>,
): ResolvedSupabaseManagementTokens | null {
  const accessToken = decryptProjectSecret(project.supabase_oauth_access_token);
  const refreshToken = decryptProjectSecret(project.supabase_oauth_refresh_token);
  if (!accessToken || !refreshToken) {
    return null;
  }

  return {
    accessToken,
    refreshToken,
    persisted: true,
  };
}

function resolveSupabaseManagementTokens(
  projectId: string,
  project: Record<string, unknown>,
): ResolvedSupabaseManagementTokens | null {
  const temporaryTokens = readTemporarySupabaseOAuthTokens(projectId);
  if (temporaryTokens) {
    return {
      ...temporaryTokens,
      persisted: false,
    };
  }

  return getPersistedSupabaseManagementTokens(project);
}

async function updatePersistedSupabaseTokens(
  orgContext: OrgContext,
  projectId: string,
  tokens: { accessToken: string; refreshToken: string },
): Promise<void> {
  await orgContext.db.updateProject(projectId, {
    supabase_oauth_access_token: encryptProjectSecret(tokens.accessToken),
    supabase_oauth_refresh_token: encryptProjectSecret(tokens.refreshToken),
  });
}

async function performSupabaseManagementRequest(
  input: {
    orgContext: OrgContext;
    projectId: string;
    project: Record<string, unknown>;
    path: string;
    fetchFn: typeof fetch;
    method?: "GET" | "POST";
    body?: string;
  },
): Promise<ManagementRequestResult> {
  const resolvedTokens = resolveSupabaseManagementTokens(input.projectId, input.project);
  if (!resolvedTokens) {
    throw new Error("Supabase OAuth session expired");
  }

  let currentTokens = {
    accessToken: resolvedTokens.accessToken,
    refreshToken: resolvedTokens.refreshToken,
  };

  const requestWithToken = (accessToken: string) => input.fetchFn(
    `${SUPABASE_MANAGEMENT_API_BASE}${input.path}`,
    {
      method: input.method ?? "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(input.body ? { "Content-Type": "application/json" } : {}),
      },
      body: input.body,
    },
  );

  let response = await requestWithToken(currentTokens.accessToken);

  if (response.status === 401) {
    const refreshedTokens = await refreshSupabaseOAuthTokens(currentTokens.refreshToken, input.fetchFn);
    currentTokens = {
      accessToken: refreshedTokens.accessToken,
      refreshToken: refreshedTokens.refreshToken,
    };

    storeTemporarySupabaseOAuthTokens(input.projectId, currentTokens);
    if (resolvedTokens.persisted) {
      await updatePersistedSupabaseTokens(input.orgContext, input.projectId, currentTokens);
    }

    response = await requestWithToken(currentTokens.accessToken);
  }

  return { response, tokens: currentTokens };
}

function requireProjectId(projectId: string): string {
  const normalized = projectId.trim();
  if (!normalized) {
    throw new Error("projectId is required");
  }
  return normalized;
}

function requireSupabaseProjectRef(projectRef: string): string {
  const normalized = projectRef.trim();
  if (!normalized) {
    throw new Error("supabaseProjectRef is required");
  }
  return normalized;
}

function renderSupabaseOAuthPopupHtml(projectId: string): string {
  const messagePayload = JSON.stringify({
    type: "supabase_oauth_success",
    projectId,
  });

  return `<!DOCTYPE html>
<html>
<body>
<script>
  if (window.opener) {
    window.opener.postMessage(
      ${messagePayload},
      "https://beomz.ai"
    );
    setTimeout(() => window.close(), 500);
  } else {
    localStorage.setItem("supabase_oauth_result", JSON.stringify(${messagePayload}));
    setTimeout(() => window.close(), 500);
  }
</script>
</body>
</html>`;
}

export function createSupabaseIntegrationsRoute(
  deps: SupabaseIntegrationsRouteDeps = {},
) {
  const route = new Hono();
  const authMiddleware = deps.authMiddleware ?? verifyPlatformJwt;
  const loadOrgContextMiddleware = deps.loadOrgContextMiddleware ?? loadOrgContext;
  const fetchFn = deps.fetch ?? fetch;
  const connectProjectToSupabaseFn = deps.connectProjectToSupabase ?? connectProjectToSupabase;
  const ensureSupabaseProjectColumnsFn =
    deps.ensureSupabaseProjectColumns ?? ensureSupabaseProjectColumns;

  route.get("/authorize", async (c) => {
    const clientId = apiConfig.SUPABASE_OAUTH_CLIENT_ID?.trim() ?? "";
    if (!clientId) {
      return c.json({ error: "Supabase OAuth is not configured" }, 503);
    }

    const projectId = readNonEmptyString(c.req.query("projectId"));
    if (!projectId) {
      return c.json({ error: "projectId is required" }, 400);
    }

    const codeVerifier = generatePkceCodeVerifier();
    const codeChallenge = createPkceCodeChallenge(codeVerifier);
    const cookieSecret = buildSupabaseOAuthCookieSecret();

    await setSignedCookie(
      c,
      SUPABASE_OAUTH_PKCE_COOKIE_NAME,
      JSON.stringify({ codeVerifier, projectId }),
      cookieSecret,
      {
        httpOnly: true,
        maxAge: SUPABASE_OAUTH_PKCE_TTL_SECONDS,
        path: "/",
        sameSite: "Lax",
        secure: true,
      },
    );

    const authorizeUrl = new URL(SUPABASE_OAUTH_AUTHORIZE_URL);
    authorizeUrl.searchParams.set("client_id", clientId);
    authorizeUrl.searchParams.set("redirect_uri", SUPABASE_OAUTH_CALLBACK_URL);
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("state", projectId);
    authorizeUrl.searchParams.set("code_challenge", codeChallenge);
    authorizeUrl.searchParams.set("code_challenge_method", "S256");

    return c.redirect(authorizeUrl.toString(), 302);
  });

  route.get("/callback", async (c) => {
    const code = readNonEmptyString(c.req.query("code"));
    const state = readNonEmptyString(c.req.query("state"));
    const error = readNonEmptyString(c.req.query("error"));
    const errorDescription = readNonEmptyString(c.req.query("error_description"));

    if (error) {
      return c.json({ error: errorDescription || error }, 400);
    }
    if (!code || !state) {
      return c.json({ error: "Missing code or state" }, 400);
    }

    const cookieSecret = buildSupabaseOAuthCookieSecret();
    const signedCookieValue = await getSignedCookie(
      c,
      cookieSecret,
      SUPABASE_OAUTH_PKCE_COOKIE_NAME,
    );
    deleteCookie(c, SUPABASE_OAUTH_PKCE_COOKIE_NAME, { path: "/" });

    if (signedCookieValue === false || typeof signedCookieValue !== "string") {
      return c.json({ error: "Supabase OAuth session expired" }, 400);
    }

    const cookiePayload = parsePkceCookiePayload(signedCookieValue);
    if (!cookiePayload || cookiePayload.projectId !== state) {
      return c.json({ error: "Invalid Supabase OAuth state" }, 400);
    }

    try {
      const tokens = await exchangeSupabaseAuthorizationCode(
        {
          code,
          codeVerifier: cookiePayload.codeVerifier,
        },
        fetchFn,
      );
      storeTemporarySupabaseOAuthTokens(state, {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      });
      return c.html(renderSupabaseOAuthPopupHtml(state));
    } catch (exchangeError) {
      console.error("[integrations/supabase/callback] token exchange failed:", exchangeError);
      return c.json({ error: "Failed to complete Supabase OAuth" }, 500);
    }
  });

  route.get("/projects", authMiddleware, loadOrgContextMiddleware, async (c) => {
    const projectId = readNonEmptyString(c.req.query("projectId"));
    if (!projectId) {
      return c.json({ error: "projectId is required" }, 400);
    }

    const orgContext = c.get("orgContext") as OrgContext;
    const project = await orgContext.db.findProjectById(projectId);
    if (!project || project.org_id !== orgContext.org.id) {
      return c.json({ error: "Project not found" }, 404);
    }

    try {
      const { response } = await performSupabaseManagementRequest({
        orgContext,
        projectId,
        project,
        path: "/projects",
        fetchFn,
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        return c.json(
          { error: `Failed to load Supabase projects (${response.status})${body ? `: ${body}` : ""}` },
          response.status === 401 ? 401 : 502,
        );
      }

      const projects = parseSupabaseProjectSummaries(await response.json().catch(() => null));
      return c.json({ projects });
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Failed to load Supabase projects";
      const status = /expired/i.test(message) ? 401 : 500;
      return c.json({ error: message }, status);
    }
  });

  route.post("/create-project", authMiddleware, loadOrgContextMiddleware, async (c) => {
    const body = await c.req.json().catch(() => null) as {
      projectId?: unknown;
      name?: unknown;
      region?: unknown;
      organizationId?: unknown;
    } | null;

    const projectId = readNonEmptyString(body?.projectId);
    const name = readNonEmptyString(body?.name);
    const region = readNonEmptyString(body?.region);
    const organizationId = readNonEmptyString(body?.organizationId);

    if (!projectId || !name || !region || !organizationId) {
      return c.json({ error: "projectId, name, region, and organizationId are required" }, 400);
    }

    const orgContext = c.get("orgContext") as OrgContext;
    const project = await orgContext.db.findProjectById(projectId);
    if (!project || project.org_id !== orgContext.org.id) {
      return c.json({ error: "Project not found" }, 404);
    }

    try {
      const { response } = await performSupabaseManagementRequest({
        orgContext,
        projectId,
        project,
        path: "/projects",
        method: "POST",
        body: JSON.stringify({
          name,
          region,
          organization_id: organizationId,
          plan: "free",
        }),
        fetchFn,
      });

      if (!response.ok) {
        const responseBody = await response.text().catch(() => "");
        return c.json(
          { error: `Failed to create Supabase project (${response.status})${responseBody ? `: ${responseBody}` : ""}` },
          response.status === 401 ? 401 : 502,
        );
      }

      const createdProject = parseSupabaseProjectProvisioningSummary(
        await response.json().catch(() => null),
      );
      if (!createdProject) {
        return c.json({ error: "Supabase project response was incomplete" }, 502);
      }

      return c.json(createdProject);
    } catch (createError) {
      const message = createError instanceof Error ? createError.message : "Failed to create Supabase project";
      const status = /expired/i.test(message) ? 401 : 500;
      return c.json({ error: message }, status);
    }
  });

  route.get("/project-status", authMiddleware, loadOrgContextMiddleware, async (c) => {
    const projectId = readNonEmptyString(c.req.query("projectId"));
    const ref = readNonEmptyString(c.req.query("ref"));
    if (!projectId || !ref) {
      return c.json({ error: "projectId and ref are required" }, 400);
    }

    const orgContext = c.get("orgContext") as OrgContext;
    const project = await orgContext.db.findProjectById(projectId);
    if (!project || project.org_id !== orgContext.org.id) {
      return c.json({ error: "Project not found" }, 404);
    }

    try {
      const { response } = await performSupabaseManagementRequest({
        orgContext,
        projectId,
        project,
        path: `/projects/${encodeURIComponent(requireSupabaseProjectRef(ref))}`,
        fetchFn,
      });

      if (!response.ok) {
        const responseBody = await response.text().catch(() => "");
        return c.json(
          { error: `Failed to load Supabase project status (${response.status})${responseBody ? `: ${responseBody}` : ""}` },
          response.status === 401 ? 401 : 502,
        );
      }

      const statusValue = parseSupabaseProjectStatus(await response.json().catch(() => null));
      if (!statusValue) {
        return c.json({ error: "Supabase project status response was incomplete" }, 502);
      }

      return c.json({ status: statusValue });
    } catch (statusError) {
      const message = statusError instanceof Error ? statusError.message : "Failed to load Supabase project status";
      const status = /expired/i.test(message) ? 401 : 500;
      return c.json({ error: message }, status);
    }
  });

  route.get("/organizations", authMiddleware, loadOrgContextMiddleware, async (c) => {
    const projectId = readNonEmptyString(c.req.query("projectId"));
    if (!projectId) {
      return c.json({ error: "projectId is required" }, 400);
    }

    const orgContext = c.get("orgContext") as OrgContext;
    const project = await orgContext.db.findProjectById(projectId);
    if (!project || project.org_id !== orgContext.org.id) {
      return c.json({ error: "Project not found" }, 404);
    }

    try {
      const { response } = await performSupabaseManagementRequest({
        orgContext,
        projectId,
        project,
        path: "/organizations",
        fetchFn,
      });

      if (!response.ok) {
        const responseBody = await response.text().catch(() => "");
        return c.json(
          { error: `Failed to load Supabase organizations (${response.status})${responseBody ? `: ${responseBody}` : ""}` },
          response.status === 401 ? 401 : 502,
        );
      }

      const organizations = parseSupabaseOrganizationSummaries(
        await response.json().catch(() => null),
      );
      return c.json(organizations);
    } catch (organizationsError) {
      const message = organizationsError instanceof Error ? organizationsError.message : "Failed to load Supabase organizations";
      const status = /expired/i.test(message) ? 401 : 500;
      return c.json({ error: message }, status);
    }
  });

  route.post("/connect", authMiddleware, loadOrgContextMiddleware, async (c) => {
    const body = await c.req.json().catch(() => null) as {
      projectId?: unknown;
      supabaseProjectRef?: unknown;
    } | null;

    const projectId = readNonEmptyString(body?.projectId);
    const supabaseProjectRef = readNonEmptyString(body?.supabaseProjectRef);

    if (!projectId || !supabaseProjectRef) {
      return c.json({ error: "projectId and supabaseProjectRef are required" }, 400);
    }

    const orgContext = c.get("orgContext") as OrgContext;
    const project = await orgContext.db.findProjectById(projectId);
    if (!project || project.org_id !== orgContext.org.id) {
      return c.json({ error: "Project not found" }, 404);
    }

    try {
      await ensureSupabaseProjectColumnsFn(fetchFn);

      const { response, tokens } = await performSupabaseManagementRequest({
        orgContext,
        projectId,
        project,
        path: `/projects/${encodeURIComponent(requireSupabaseProjectRef(supabaseProjectRef))}/api-keys`,
        fetchFn,
      });

      if (!response.ok) {
        const responseBody = await response.text().catch(() => "");
        return c.json(
          { error: `Failed to load Supabase API keys (${response.status})${responseBody ? `: ${responseBody}` : ""}` },
          response.status === 401 ? 401 : 502,
        );
      }

      const keysPayload = await response.json().catch(() => null);
      const anonKey = extractNamedApiKey(keysPayload, "anon");
      const serviceRoleKey = extractNamedApiKey(keysPayload, "service_role");
      if (!anonKey || !serviceRoleKey) {
        return c.json({ error: "Supabase API keys were incomplete" }, 502);
      }

      const supabaseUrl = parseSupabaseProjectUrl(`https://${supabaseProjectRef}.supabase.co`).supabaseUrl;

      await connectProjectToSupabaseFn({
        orgContext,
        project,
        projectId,
        supabaseUrl,
        supabaseAnonKey: anonKey,
        serviceRoleKey,
        oauthAccessToken: tokens.accessToken,
        oauthRefreshToken: tokens.refreshToken,
        prompt: AUTO_WIRE_SUPABASE_ITERATION_PROMPT,
        ensureSupabaseProjectColumnsFn,
        fetchFn,
        extraProjectPatch: {
          byo_db_service_key: encryptProjectSecret(serviceRoleKey),
          supabase_oauth_access_token: encryptProjectSecret(tokens.accessToken),
          supabase_oauth_refresh_token: encryptProjectSecret(tokens.refreshToken),
        },
      });

      clearTemporarySupabaseOAuthTokens(projectId);

      return c.json({ wiring: true });
    } catch (connectError) {
      const message = connectError instanceof Error ? connectError.message : "Failed to connect Supabase";
      const status = /expired/i.test(message) ? 401 : 500;
      console.error("[integrations/supabase/connect] failed:", connectError);
      return c.json({ error: message }, status);
    }
  });

  return route;
}

const supabaseIntegrationsRoute = createSupabaseIntegrationsRoute();

export default supabaseIntegrationsRoute;
