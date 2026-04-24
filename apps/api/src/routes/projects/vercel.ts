/**
 * POST /api/projects/:id/deploy/vercel
 *   → uploads files + scaffold, creates Vercel deployment, returns 202 immediately.
 *   → polls in background; writes beomz_app_url to DB when READY.
 *
 * GET  /api/projects/:id/deploy/vercel/status
 *   → { status: 'deploying' | 'ready' | 'error', url?: string }
 */
import { Hono } from "hono";
import type { Context, MiddlewareHandler } from "hono";
import { z } from "zod";

import { loadOrgContext } from "../../middleware/loadOrgContext.js";
import { verifyPlatformJwt } from "../../middleware/verifyPlatformJwt.js";
import type { OrgContext } from "../../types.js";
import type { VercelDeployFile } from "../../lib/vercelDeploy.js";
import type { VercelProjectDomain } from "../../lib/vercelDomains.js";
import { vercelDeployStart, pollUntilReady } from "../../lib/vercelDeploy.js";
import {
  VercelApiError,
  addDomainToProjectRecord,
  addProjectDomain,
  assignDomainToCurrentDeployment,
  deleteProjectDomain,
  getProjectDomain,
  normalizeCustomDomain,
  readProjectCustomDomains,
  removeDomainFromProjectRecord,
  verifyProjectDomain,
} from "../../lib/vercelDomains.js";
import { createStudioDbClient } from "@beomz-studio/studio-db";
import { apiConfig } from "../../config.js";
import { getByoSupabaseConfig, getProjectPostgresUrl, resolveProjectDbProvider } from "../../lib/projectDb.js";

// ── Scaffold files required for Vercel to build a Vite + React project ────────
// Mirrors the WebContainer scaffold in apps/web/src/lib/webcontainer.ts

const SCAFFOLD_PACKAGE_JSON = JSON.stringify(
  {
    name: "beomz-app",
    private: true,
    type: "module",
    scripts: { build: "vite build" },
    dependencies: {
      "@neondatabase/serverless": "^0.10.4",
      "@supabase/supabase-js": "^2.39.0",
      clsx: "^2.0.0",
      "framer-motion": "^11.0.0",
      "lucide-react": "^0.400.0",
      react: "^19.2.0",
      "react-dom": "^19.2.0",
      "react-icons": "^5.5.0",
      "react-router-dom": "^7.0.0",
      "tailwind-merge": "^2.0.0",
    },
    devDependencies: {
      "@tailwindcss/vite": "^4.2.2",
      "@types/react": "^19.2.2",
      "@types/react-dom": "^19.2.2",
      "@vitejs/plugin-react": "^6.0.1",
      tailwindcss: "^4.2.2",
      typescript: "^5.9.3",
      vite: "^8.0.1",
    },
  },
  null,
  2,
);

const SCAFFOLD_VITE_CONFIG = `import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    include: ["@neondatabase/serverless"],
  },
});
`;

const SCAFFOLD_TSCONFIG = JSON.stringify(
  {
    compilerOptions: {
      target: "ES2022",
      useDefineForClassFields: true,
      lib: ["ES2022", "DOM", "DOM.Iterable"],
      module: "ESNext",
      skipLibCheck: true,
      moduleResolution: "bundler",
      allowImportingTsExtensions: true,
      resolveJsonModule: true,
      moduleDetection: "force",
      noEmit: true,
      jsx: "react-jsx",
      // Keep strict off — generated code may not pass strict checks
      strict: false,
    },
    include: ["src", "vite.config.ts"],
  },
  null,
  2,
);

const SCAFFOLD_INDEX_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;

const SCAFFOLD_MAIN_TSX = `import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./tailwind.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
`;

const SCAFFOLD_TAILWIND_CSS = `@import "tailwindcss";

*, *::before, *::after { box-sizing: border-box; }

body {
  margin: 0;
  font-family: "Geist Sans", system-ui, -apple-system, sans-serif;
}
`;

function buildScaffold(): Array<{ filename: string; content: string }> {
  return [
    { filename: "package.json",    content: SCAFFOLD_PACKAGE_JSON },
    { filename: "vite.config.ts",  content: SCAFFOLD_VITE_CONFIG },
    { filename: "tsconfig.json",   content: SCAFFOLD_TSCONFIG },
    { filename: "index.html",      content: SCAFFOLD_INDEX_HTML },
    { filename: "src/main.tsx",    content: SCAFFOLD_MAIN_TSX },
    { filename: "src/tailwind.css", content: SCAFFOLD_TAILWIND_CSS },
  ];
}

const addCustomDomainSchema = z.object({
  domain: z.string().trim().min(1).max(253),
}).strict();

interface VercelDeployRouteDeps {
  authMiddleware?: MiddlewareHandler;
  loadOrgContextMiddleware?: MiddlewareHandler;
  createDbClient?: typeof createStudioDbClient;
  startDeploy?: typeof vercelDeployStart;
  pollDeployUntilReady?: typeof pollUntilReady;
}

interface VercelDomainsRouteDeps {
  authMiddleware?: MiddlewareHandler;
  loadOrgContextMiddleware?: MiddlewareHandler;
  addProjectDomain?: typeof addProjectDomain;
  verifyProjectDomain?: typeof verifyProjectDomain;
  getProjectDomain?: typeof getProjectDomain;
  deleteProjectDomain?: typeof deleteProjectDomain;
  assignDomainToCurrentDeployment?: typeof assignDomainToCurrentDeployment;
}

// ── Path helpers ──────────────────────────────────────────────────────────────

// Lowercase, spaces → hyphens, alphanumeric + hyphens only, max 40 chars
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

// Strip the deep WebContainer path, place under src/
// "apps/web/src/app/generated/workspace-task/App.tsx" → "src/App.tsx"
function toDeployPath(fullPath: string): string {
  const basename = fullPath.split("/").pop() ?? fullPath;
  return `src/${basename}`;
}

// Replace import.meta.env.VITE_* references inline so Vite bakes the real
// values into the bundle. This is more reliable than Vercel's `env` API field
// (which only applies at runtime, not during `vite build`).
const PLACEHOLDER_SUPABASE_URL = "https://placeholder.supabase.co";
const PLACEHOLDER_SUPABASE_KEY = "placeholder";
const PLACEHOLDER_SUPABASE_SCHEMA = "public";

function injectSupabaseEnvVars(
  content: string,
  supabaseUrl: string,
  supabaseAnonKey: string,
  dbSchema: string,
): string {
  return content
    .replace(/import\.meta\.env\.VITE_SUPABASE_URL/g, JSON.stringify(supabaseUrl))
    .replace(/import\.meta\.env\.VITE_SUPABASE_ANON_KEY/g, JSON.stringify(supabaseAnonKey))
    .replace(/import\.meta\.env\.VITE_DB_SCHEMA/g, JSON.stringify(dbSchema));
}

export function injectNeonEnvVars(
  content: string,
  neonDbUrl: string,
): string {
  return content.replace(
    /import\.meta\.env\.VITE_DATABASE_URL/g,
    JSON.stringify(neonDbUrl),
  );
}

type DeploySupabaseProjectLookup = {
  db_wired?: unknown;
  db_schema?: unknown;
  byo_db_url?: unknown;
  byo_db_anon_key?: unknown;
};

export function resolveDeploySupabaseCredentials(
  project: DeploySupabaseProjectLookup,
  options: {
    managedUrl?: string | null;
    managedAnonKey?: string | null;
  } = {},
): {
  supabaseUrl: string;
  supabaseAnonKey: string;
  dbSchema: string;
  source: "byo" | "managed" | "placeholder";
} {
  const byoSupabase = getByoSupabaseConfig(project);
  if (byoSupabase) {
    return {
      supabaseUrl: byoSupabase.supabaseUrl,
      supabaseAnonKey: byoSupabase.supabaseAnonKey,
      dbSchema: "public",
      source: "byo",
    };
  }

  const managedUrl = typeof options.managedUrl === "string" ? options.managedUrl.trim() : "";
  const managedAnonKey = typeof options.managedAnonKey === "string" ? options.managedAnonKey.trim() : "";
  const dbSchema = typeof project.db_schema === "string" ? project.db_schema.trim() : "";

  if (project.db_wired && dbSchema && managedUrl && managedAnonKey) {
    return {
      supabaseUrl: managedUrl,
      supabaseAnonKey: managedAnonKey,
      dbSchema,
      source: "managed",
    };
  }

  return {
    supabaseUrl: PLACEHOLDER_SUPABASE_URL,
    supabaseAnonKey: PLACEHOLDER_SUPABASE_KEY,
    dbSchema: PLACEHOLDER_SUPABASE_SCHEMA,
    source: "placeholder",
  };
}

const DEPLOY_ENV_FILE_PATH = "src/.env.local";

type DeployEnvProjectLookup = {
  byo_db_url?: unknown;
  byo_db_anon_key?: unknown;
};

export function replaceDeployEnvFile(
  files: readonly VercelDeployFile[],
  project: DeployEnvProjectLookup,
  options: {
    provider?: string | null;
    neonDbUrl?: string | null;
  } = {},
): VercelDeployFile[] {
  const byoDbUrl = typeof project.byo_db_url === "string" ? project.byo_db_url.trim() : "";
  const byoDbAnonKey = typeof project.byo_db_anon_key === "string" ? project.byo_db_anon_key.trim() : "";

  let envFileContent: string | null = null;

  if (byoDbUrl && byoDbAnonKey) {
    envFileContent = [
      `VITE_SUPABASE_URL=${byoDbUrl}`,
      `VITE_SUPABASE_ANON_KEY=${byoDbAnonKey}`,
      "VITE_BYO_DB=true",
    ].join("\n");
  } else if (options.provider === "neon") {
    const neonDbUrl = typeof options.neonDbUrl === "string" ? options.neonDbUrl.trim() : "";
    if (neonDbUrl) {
      envFileContent = `VITE_DATABASE_URL=${neonDbUrl}`;
    }
  }

  if (!envFileContent) {
    return [...files];
  }

  const nextFiles = files.filter((file) => file.filename !== DEPLOY_ENV_FILE_PATH);
  return [
    ...nextFiles,
    {
      filename: DEPLOY_ENV_FILE_PATH,
      content: `${envFileContent}\n`,
    },
  ];
}

function domainResponsePayload(domain: string, result: Pick<VercelProjectDomain, "verified" | "verification">) {
  return {
    domain,
    verified: result.verified === true,
    verification: Array.isArray(result.verification) ? result.verification : [],
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

function respondToVercelError(c: Pick<Context, "json">, error: unknown) {
  if (error instanceof VercelApiError) {
    const status = error.status >= 500 ? 502 : error.status;
    return new Response(JSON.stringify({ error: "vercel_error", detail: error.body }), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }

  const detail = error instanceof Error ? error.message : String(error);
  return c.json({ error: "vercel_error", detail }, 502);
}

// ── Routes ────────────────────────────────────────────────────────────────────

export function createVercelDeployRoute(deps: VercelDeployRouteDeps = {}) {
  const vercelDeployRoute = new Hono();
  const authMiddleware = deps.authMiddleware ?? verifyPlatformJwt;
  const loadOrgContextMiddleware = deps.loadOrgContextMiddleware ?? loadOrgContext;
  const createDbClient = deps.createDbClient ?? createStudioDbClient;
  const startDeploy = deps.startDeploy ?? vercelDeployStart;
  const pollDeployUntilReady = deps.pollDeployUntilReady ?? pollUntilReady;

// ── POST /api/projects/:id/deploy/vercel ─────────────────────────────────────

  vercelDeployRoute.post("/", authMiddleware, loadOrgContextMiddleware, async (c) => {
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

  // Flatten the deep WebContainer paths to src/<filename>
  const rawGeneratedFiles = (latestGen.files as Array<{ path: string; content: string }>).map((f) => ({
    filename: toDeployPath(f.path),
    content: f.content,
  }));

  console.log(
    `[vercel deploy] generated files mapped:`,
    rawGeneratedFiles.map((f) => f.filename),
  );

  // Replace import.meta.env.VITE_* references directly in source files.
  // Vite substitutes these at build time; Vercel's API `env` field only applies
  // at runtime (serverless), not during `vite build`, so inline replacement is
  // the only reliable approach.
  const usesSupabase = rawGeneratedFiles.some(
    (f) =>
      f.content.includes("@supabase/supabase-js") ||
      f.content.includes("VITE_SUPABASE_URL"),
  );
  const usesNeon = rawGeneratedFiles.some(
    (f) =>
      f.content.includes("@neondatabase/serverless")
      || f.content.includes("VITE_DATABASE_URL"),
  );

  let supabaseUrl = PLACEHOLDER_SUPABASE_URL;
  let supabaseAnonKey = PLACEHOLDER_SUPABASE_KEY;
  let dbSchema = PLACEHOLDER_SUPABASE_SCHEMA;
  let neonDbUrl: string | null = null;

  const limits = usesNeon
    ? await orgContext.db.getProjectDbLimits(projectId)
    : null;
  const provider = usesNeon
    ? resolveProjectDbProvider(project, limits)
    : project.db_provider;

  if (usesSupabase) {
    const supabaseConfig = resolveDeploySupabaseCredentials(project, {
      managedUrl: apiConfig.USER_DATA_SUPABASE_URL,
      managedAnonKey: apiConfig.USER_DATA_SUPABASE_ANON_KEY,
    });

    supabaseUrl = supabaseConfig.supabaseUrl;
    supabaseAnonKey = supabaseConfig.supabaseAnonKey;
    dbSchema = supabaseConfig.dbSchema;

    if (supabaseConfig.source === "byo") {
      console.log("[vercel deploy] injecting BYO Supabase creds into published bundle");
    } else if (supabaseConfig.source === "managed") {
      console.log(`[vercel deploy] injecting real DB creds for schema ${dbSchema}`);
    } else {
      console.log(`[vercel deploy] app uses Supabase but db_wired=false — injecting placeholder creds`);
    }
  }

  if (usesNeon) {
    if (provider === "neon" || provider === "postgres") {
      neonDbUrl = getProjectPostgresUrl(project, limits);
      if (neonDbUrl) {
        console.log("[vercel deploy] injecting Postgres DB URL into published bundle");
      } else {
        console.warn(`[vercel deploy] provider=${provider} but no Postgres connection string was resolved — leaving VITE_DATABASE_URL unresolved`);
      }
    } else {
      console.log(`[vercel deploy] app references Neon but resolved provider=${provider ?? "null"} — leaving VITE_DATABASE_URL unresolved`);
    }
  }

  const generatedFiles = rawGeneratedFiles.map((f) => {
    let content = f.content;

    if (usesSupabase) {
      content = injectSupabaseEnvVars(content, supabaseUrl, supabaseAnonKey, dbSchema);
    }

    if (neonDbUrl) {
      content = injectNeonEnvVars(content, neonDbUrl);
    }

    return {
      filename: f.filename,
      content,
    };
  });

  console.log("[vercel] project id:", project?.id, "byo_db_url:", project?.byo_db_url, "has_anon_key:", !!project?.byo_db_anon_key);

  const deployGeneratedFiles = replaceDeployEnvFile(generatedFiles, project, {
    provider,
    neonDbUrl,
  });

  if (typeof project.byo_db_url === "string" && typeof project.byo_db_anon_key === "string") {
    console.log("[vercel deploy] overwrote src/.env.local with BYO Supabase credentials");
  } else if (provider === "neon" && neonDbUrl) {
    console.log("[vercel deploy] overwrote src/.env.local with managed Neon connection string");
  }

  // Scaffold + generated files (scaffold first so generated files can override if needed)
  const deployFiles = [...buildScaffold(), ...deployGeneratedFiles];

  // Phase 1: upload files + create deployment (~5-10s) — synchronous so errors surface
  let handle: Awaited<ReturnType<typeof vercelDeployStart>>;
  try {
    handle = await startDeploy({ files: deployFiles, slug });
  } catch (err) {
    console.error("[vercel deploy] start failed:", err);
    return c.json({ error: "deploy_failed", detail: String(err) }, 502);
  }

  const { deploymentId, url, _token, _teamId } = handle;
  console.log(`[vercel deploy] deployment created: ${deploymentId} for slug ${slug}`);

  // Phase 2: poll in background — fresh DB client so it outlives the request
  void (async () => {
    const db = createDbClient();
    try {
      await pollDeployUntilReady(_token, _teamId, deploymentId);
      await db.updateProject(projectId, {
        beomz_app_url: url,
        beomz_app_deployed_at: new Date().toISOString(),
      });
      console.log(`[vercel deploy] ready: ${url}`);
    } catch (err) {
      console.error("[vercel deploy] background poll failed:", err);
    }
  })();

  return c.json({ ok: true, deploymentId, status: "deploying" }, 202);
  });

// ── DELETE /api/projects/:id/deploy/vercel ────────────────────────────────────

  vercelDeployRoute.delete("/", authMiddleware, loadOrgContextMiddleware, async (c) => {
  const orgContext = c.get("orgContext") as OrgContext;
  const projectId = c.req.param("id") as string;

  const project = await orgContext.db.findProjectById(projectId);
  if (!project || project.org_id !== orgContext.org.id) {
    return c.json({ error: "Project not found" }, 404);
  }

  if (!project.beomz_app_url) {
    return c.json({ error: "not_deployed" }, 400);
  }

  // Extract slug from 'https://slug.beomz.app' → 'slug'
  const appUrl = project.beomz_app_url as string;
  const slugMatch = appUrl.match(/^https?:\/\/([^.]+)\.beomz\.app/);
  if (!slugMatch) {
    return c.json({ error: "invalid_url", detail: appUrl }, 400);
  }
  const slug = slugMatch[1];
  const domain = `${slug}.beomz.app`;

  const { VERCEL_TOKEN, VERCEL_PROJECT_ID, VERCEL_TEAM_ID } = apiConfig;
  if (!VERCEL_TOKEN || !VERCEL_PROJECT_ID || !VERCEL_TEAM_ID) {
    return c.json({ error: "Vercel not configured" }, 503);
  }

  // Remove the alias from the Vercel project
  const domainRes = await fetch(
    `https://api.vercel.com/v9/projects/${VERCEL_PROJECT_ID}/domains/${domain}?teamId=${VERCEL_TEAM_ID}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${VERCEL_TOKEN}` },
    },
  );

  if (!domainRes.ok && domainRes.status !== 404) {
    const body = await domainRes.text();
    console.error(`[vercel undeploy] domain removal failed (${domainRes.status}):`, body);
    return c.json({ error: "domain_removal_failed", detail: body }, 502);
  }

  console.log(`[vercel undeploy] removed domain ${domain} for project ${projectId}`);

  // Clear deploy columns
  await orgContext.db.updateProject(projectId, {
    beomz_app_url: null,
    beomz_app_deployed_at: null,
  });

  return c.json({ ok: true });
  });

// ── GET /api/projects/:id/deploy/vercel/status ───────────────────────────────

  vercelDeployRoute.get("/status", authMiddleware, loadOrgContextMiddleware, async (c) => {
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

  return vercelDeployRoute;
}

export function createVercelDomainsRoute(deps: VercelDomainsRouteDeps = {}) {
  const vercelDomainsRoute = new Hono();
  const authMiddleware = deps.authMiddleware ?? verifyPlatformJwt;
  const loadOrgContextMiddleware = deps.loadOrgContextMiddleware ?? loadOrgContext;
  const addDomain = deps.addProjectDomain ?? addProjectDomain;
  const verifyDomain = deps.verifyProjectDomain ?? verifyProjectDomain;
  const fetchProjectDomain = deps.getProjectDomain ?? getProjectDomain;
  const removeProjectDomainFromVercel = deps.deleteProjectDomain ?? deleteProjectDomain;
  const assignCurrentDeploymentDomain = deps.assignDomainToCurrentDeployment ?? assignDomainToCurrentDeployment;

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
      await orgContext.db.updateProject(projectId, {
        custom_domains: addDomainToProjectRecord(project, domain),
      });

      if (result.verified) {
        await assignCurrentDeploymentDomain(project, domain);
      }

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
      await orgContext.db.updateProject(projectId, {
        custom_domains: addDomainToProjectRecord(project, domain),
      });

      if (result.verified) {
        await assignCurrentDeploymentDomain(project, domain);
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

    const domains = readProjectCustomDomains(project);
    if (domains.length === 0) {
      return c.json([]);
    }

    try {
      const statuses = await Promise.all(
        domains.map(async (domain) => {
          try {
            const result = await fetchProjectDomain(domain);
            return domainResponsePayload(domain, result);
          } catch (error) {
            if (error instanceof VercelApiError && error.status === 404) {
              return { domain, verified: false, verification: [] };
            }
            throw error;
          }
        }),
      );

      return c.json(statuses);
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
      await orgContext.db.updateProject(projectId, {
        custom_domains: removeDomainFromProjectRecord(project, domain),
      });
      return c.json({ deleted: true });
    } catch (error) {
      return respondToVercelError(c, error);
    }
  });

  return vercelDomainsRoute;
}

export const vercelDeployRoute = createVercelDeployRoute();
export const vercelDomainsRoute = createVercelDomainsRoute();
