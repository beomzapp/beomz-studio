/**
 * POST /api/projects/:id/deploy/vercel
 *   → uploads files + scaffold, creates Vercel deployment, returns 202 immediately.
 *   → polls in background; writes beomz_app_url to DB when READY.
 *
 * GET  /api/projects/:id/deploy/vercel/status
 *   → { status: 'deploying' | 'ready' | 'error', url?: string }
 */
import { Hono } from "hono";

import { loadOrgContext } from "../../middleware/loadOrgContext.js";
import { verifyPlatformJwt } from "../../middleware/verifyPlatformJwt.js";
import type { OrgContext } from "../../types.js";
import { vercelDeployStart, pollUntilReady } from "../../lib/vercelDeploy.js";
import { createStudioDbClient } from "@beomz-studio/studio-db";
import { apiConfig } from "../../config.js";

// ── Scaffold files required for Vercel to build a Vite + React project ────────
// Mirrors the WebContainer scaffold in apps/web/src/lib/webcontainer.ts

const SCAFFOLD_PACKAGE_JSON = JSON.stringify(
  {
    name: "beomz-app",
    private: true,
    type: "module",
    scripts: { build: "vite build" },
    dependencies: {
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

// ── Routes ────────────────────────────────────────────────────────────────────

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

  let supabaseUrl = PLACEHOLDER_SUPABASE_URL;
  let supabaseAnonKey = PLACEHOLDER_SUPABASE_KEY;
  let dbSchema = PLACEHOLDER_SUPABASE_SCHEMA;

  if (usesSupabase) {
    if (project.db_wired && project.db_schema) {
      const cfgUrl = apiConfig.USER_DATA_SUPABASE_URL;
      const cfgKey = apiConfig.USER_DATA_SUPABASE_ANON_KEY;
      if (cfgUrl && cfgKey) {
        supabaseUrl = cfgUrl;
        supabaseAnonKey = cfgKey;
        dbSchema = project.db_schema;
        console.log(`[vercel deploy] injecting real DB creds for schema ${dbSchema}`);
      } else {
        console.warn(`[vercel deploy] db_wired=true but USER_DATA_SUPABASE_* not configured — using placeholders`);
      }
    } else {
      console.log(`[vercel deploy] app uses Supabase but db_wired=false — injecting placeholder creds`);
    }
  }

  const generatedFiles = usesSupabase
    ? rawGeneratedFiles.map((f) => ({
        filename: f.filename,
        content: injectSupabaseEnvVars(f.content, supabaseUrl, supabaseAnonKey, dbSchema),
      }))
    : rawGeneratedFiles;

  // Scaffold + generated files (scaffold first so generated files can override if needed)
  const deployFiles = [...buildScaffold(), ...generatedFiles];

  // Phase 1: upload files + create deployment (~5-10s) — synchronous so errors surface
  let handle: Awaited<ReturnType<typeof vercelDeployStart>>;
  try {
    handle = await vercelDeployStart({ files: deployFiles, slug });
  } catch (err) {
    console.error("[vercel deploy] start failed:", err);
    return c.json({ error: "deploy_failed", detail: String(err) }, 502);
  }

  const { deploymentId, url, _token, _teamId } = handle;
  console.log(`[vercel deploy] deployment created: ${deploymentId} for slug ${slug}`);

  // Phase 2: poll in background — fresh DB client so it outlives the request
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

  return c.json({ ok: true, deploymentId, status: "deploying" }, 202);
});

// ── DELETE /api/projects/:id/deploy/vercel ────────────────────────────────────

vercelDeployRoute.delete("/", verifyPlatformJwt, loadOrgContext, async (c) => {
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
