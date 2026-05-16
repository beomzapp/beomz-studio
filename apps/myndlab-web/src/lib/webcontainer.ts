import type { FileSystemTree, WebContainer, WebContainerProcess } from "@webcontainer/api";

import type { Project, StudioFile } from "@beomz-studio/contracts";
import {
  buildGeneratedManifest,
  buildGeneratedNavigationFromManifest,
  buildGeneratedRoutesFromManifest,
  normalizeGeneratedPath,
  readGeneratedManifestFromFiles,
} from "@beomz-studio/contracts";
import { getTemplateDefinitionSafe } from "@beomz-studio/templates";

// ─── Workspace scaffold (mirrors workers/preview-e2b/src/templates/vite-react/workspace) ───

export const WORKSPACE_PACKAGE_JSON = JSON.stringify(
  {
    name: "beomz-preview",
    private: true,
    type: "module",
    scripts: { dev: "vite" },
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

// ─── Website-only slim scaffold (BEO-688) ────────────────────────────────────
// Strips app-only packages: @neondatabase/serverless, @supabase/supabase-js,
// framer-motion, react-icons, react-router-dom.

export const WEBSITE_SCAFFOLD_PACKAGE_JSON = JSON.stringify(
  {
    name: "beomz-preview",
    private: true,
    type: "module",
    scripts: { dev: "vite" },
    dependencies: {
      clsx: "^2.0.0",
      "lucide-react": "^0.400.0",
      react: "^19.2.0",
      "react-dom": "^19.2.0",
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

const WEBSITE_VITE_CONFIG = `// @ts-nocheck
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "apps/web/src"),
    },
  },
  server: {
    allowedHosts: true,
    host: true,
    port: 5173,
    strictPort: false,
  },
});
`;

const WORKSPACE_TSCONFIG = JSON.stringify(
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
      strict: true,
      baseUrl: ".",
      paths: { "@/*": ["apps/web/src/*"] },
    },
    include: ["apps/web/src", "vite.config.ts"],
  },
  null,
  2,
);

const WORKSPACE_VITE_CONFIG = `// @ts-nocheck
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "apps/web/src"),
    },
  },
  optimizeDeps: {
    include: ["@neondatabase/serverless"],
  },
  server: {
    allowedHosts: true,
    host: true,
    port: 5173,
    strictPort: false,
  },
});
`;

const WORKSPACE_INDEX_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Beomz Preview</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/apps/web/src/main.tsx"></script>
  </body>
</html>
`;

const WORKSPACE_MAIN_TSX = `import React from "react";
import ReactDOM from "react-dom/client";
import { MemoryRouter } from "react-router-dom";

import { PreviewApp } from "./preview/App";
import "./preview/styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <MemoryRouter>
      <PreviewApp />
    </MemoryRouter>
  </React.StrictMode>,
);
`;

// BEO-456: Blank main used by the first-build shell.
// Renders nothing so Vite's initial page is a blank white canvas; the real
// main.tsx is delivered immediately after via wc.mount() + HMR.
const WORKSPACE_BLANK_MAIN_TSX = `import React from "react";
import ReactDOM from "react-dom/client";
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode><div /></React.StrictMode>,
);
`;

// BEO-692: Website-specific shell files.
// Website files use a flat src/ structure with their own index.html (entry:
// /src/main.tsx). The app-style scaffold (apps/web/src/main.tsx + PreviewApp +
// runtime.json) must never be mounted for websites — it points Vite at the
// wrong entry and the import.meta.glob("../app/generated/…") pattern misses
// all website files that live under src/.

const WEBSITE_SHELL_INDEX_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Beomz Preview</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;

const WEBSITE_SHELL_BLANK_MAIN_TSX = `import React from "react";
import ReactDOM from "react-dom/client";
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode><div /></React.StrictMode>,
);
`;

// BEO-708: Non-eager glob — loads each generated module on demand rather than
// as a static top-level import. Eager mode caused "Route not found" for DB
// builds: App.tsx threw "Missing VITE_DATABASE_URL" at module level before
// .env.local was written, Vite swallowed the error per-entry and left
// generatedModules[key].default undefined, so EmptyRoute rendered permanently.
// Lazy loading wraps each import in a promise so module-level throws are caught
// without crashing the shell, and the component loads once the env is ready.
const WORKSPACE_PREVIEW_APP_TSX = `import { useState, useEffect, useMemo, type ComponentType } from "react";

import runtime from "../.beomz/runtime.json";

type AnyGeneratedModule = { default?: ComponentType; [key: string]: unknown };

// Non-eager: Vite still tracks these files for HMR but loads them on demand.
const generatedModuleLoaders = import.meta.glob(
  "../app/generated/**/*.{ts,tsx}",
) as Record<string, () => Promise<AnyGeneratedModule>>;

function resolveModuleKey(filePath: string): string {
  return \`../\${filePath.replace(/^apps\\/web\\/src\\//, "")}\`;
}

function resolveActiveRoute() {
  const currentPath = window.location.pathname;

  return (
    runtime.routes.find((route) => route.path === currentPath) ??
    runtime.routes.find((route) => route.path === runtime.entryPath) ??
    runtime.routes[0]
  );
}

const ENTRY_NAMES = new Set(["App", "app", "main", "Main", "index", "Index"]);

// BEO-440 / BEO-708: Try the primary route key first; if that fails (module
// missing or throws), scan all loaders for a well-known entry-point name.
async function loadActiveComponent(
  moduleKey: string,
): Promise<ComponentType | undefined> {
  const loader = generatedModuleLoaders[moduleKey];
  if (loader) {
    try {
      const mod = await loader();
      if (typeof mod?.default === "function") return mod.default as ComponentType;
    } catch { /* fall through to name-based scan */ }
  }

  for (const [key, load] of Object.entries(generatedModuleLoaders)) {
    const baseName = key.replace(/^.*\\//, "").replace(/\\.(tsx?|jsx?)$/, "");
    if (!ENTRY_NAMES.has(baseName)) continue;
    try {
      const mod = await load();
      if (typeof mod?.default === "function") return mod.default as ComponentType;
    } catch { /* skip */ }
  }
  return undefined;
}

function EmptyRoute() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0a0a", color: "#9ca3af" }}>
      <div style={{ textAlign: "center" }}>
        <p style={{ fontSize: "16px", fontWeight: 500, color: "#e5e7eb", margin: 0 }}>Route not found</p>
        <p style={{ fontSize: "14px", marginTop: "8px", color: "#9ca3af" }}>This route has not been generated yet.</p>
      </div>
    </div>
  );
}

type RouteState =
  | { status: "loading" }
  | { status: "ready"; Component: ComponentType }
  | { status: "empty" };

export function PreviewApp() {
  const activeRoute = useMemo(resolveActiveRoute, []);
  const moduleKey = resolveModuleKey(activeRoute.filePath);
  const [routeState, setRouteState] = useState<RouteState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setRouteState({ status: "loading" });
    loadActiveComponent(moduleKey).then((Component) => {
      if (cancelled) return;
      setRouteState(Component ? { status: "ready", Component } : { status: "empty" });
    });
    return () => { cancelled = true; };
  }, [moduleKey]);

  if (routeState.status === "loading") return <div />;
  if (routeState.status === "empty") return <EmptyRoute />;
  const { Component } = routeState;
  return <Component />;
}
`;

const WORKSPACE_PREVIEW_STYLES_CSS = `@import "tailwindcss";

*, *::before, *::after { box-sizing: border-box; }

body {
  margin: 0;
  font-family: "Geist Sans", system-ui, -apple-system, sans-serif;
}

a { color: inherit; }
`;

// ─── BEO-130: Pre-built DB helper ────────────────────────────────────────────
// Injected into every WebContainer as apps/web/src/lib/beomz-db.ts
// AI prompt instructs: "Use beomz-db.ts helpers — do NOT import @supabase/supabase-js"

const BEOMZ_DB_HELPER_TS = `// Pre-built database helper — do NOT modify
// Import: import { dbRead, dbInsert, dbUpdate, dbDelete } from "@/lib/beomz-db"
const DB_URL = import.meta.env.VITE_BEOMZ_DB_URL as string | undefined;
const ANON_KEY = import.meta.env.VITE_BEOMZ_ANON_KEY as string | undefined;
const DB_SCHEMA = import.meta.env.VITE_BEOMZ_DB_SCHEMA as string | undefined;
const DB_NONCE = import.meta.env.VITE_BEOMZ_DB_NONCE as string | undefined;

async function callBeomzDb(
  op: string,
  table: string,
  data?: Record<string, unknown>,
): Promise<unknown> {
  if (!DB_URL || !ANON_KEY || !DB_SCHEMA) {
    throw new Error(
      "Database not configured. Enable the built-in database in project settings.",
    );
  }
  const body: Record<string, unknown> = {
    p_schema: DB_SCHEMA,
    p_table: table,
    p_op: op,
    p_data: data ?? null,
  };
  if (DB_NONCE) body.p_nonce = DB_NONCE;

  const res = await fetch(\`\${DB_URL.replace(/\\/$/, "")}/rest/v1/rpc/beomz_db\`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: ANON_KEY,
      Authorization: \`Bearer \${ANON_KEY}\`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(\`DB error (\${res.status}): \${err}\`);
  }
  return res.json();
}

export async function dbRead<T = Record<string, unknown>>(table: string): Promise<T[]> {
  return callBeomzDb("select", table) as Promise<T[]>;
}

export async function dbInsert<T = Record<string, unknown>>(
  table: string,
  data: Record<string, unknown>,
): Promise<T> {
  return callBeomzDb("insert", table, data) as Promise<T>;
}

export async function dbUpdate<T = Record<string, unknown>>(
  table: string,
  data: Record<string, unknown> & { id: string },
): Promise<T> {
  return callBeomzDb("update", table, data) as Promise<T>;
}

export async function dbDelete(table: string, id: string): Promise<void> {
  await callBeomzDb("delete", table, { id });
}
`;

// ─── FileSystemTree helper ────────────────────────────────────────────────────

function pathsToFileTree(
  flatFiles: ReadonlyArray<{ path: string; contents: string }>,
): FileSystemTree {
  const tree: FileSystemTree = {};

  for (const { path, contents } of flatFiles) {
    const parts = path.split("/").filter(Boolean);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let cursor: any = tree;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!cursor[part]) {
        cursor[part] = { directory: {} };
      }
      cursor = cursor[part].directory;
    }

    cursor[parts[parts.length - 1]] = { file: { contents } };
  }

  return tree;
}

// ─── Runtime contract builder ─────────────────────────────────────────────────

// Ordered candidates for finding the real app entry file when the manifest
// route path doesn't match any file in the injected tree (BEO-440).
function resolveRealEntryPath(
  filePaths: Set<string>,
  templateId: string,
): string | undefined {
  const base = `apps/web/src/app/generated/${templateId}/`;
  const CANDIDATES = [
    `${base}App.tsx`,
    `${base}app.tsx`,
    `${base}index.tsx`,
    "apps/web/src/App.tsx",
    "apps/web/src/main.tsx",
    "src/App.tsx",
    "src/main.tsx",
    "App.tsx",
    "main.tsx",
  ];
  return CANDIDATES.find((p) => filePaths.has(p));
}

export function buildRuntimeJson(
  files: readonly Pick<StudioFile, "path" | "content">[],
  project: Pick<Project, "id" | "name" | "templateId">,
): string {
  const template = getTemplateDefinitionSafe(project.templateId);
  const manifest =
    readGeneratedManifestFromFiles(project.templateId, files) ??
    buildGeneratedManifest(template);

  // BEO-440: Verify that the manifest's primary route filePath actually exists
  // in the injected file list. On a cold boot the scaffold module path can be
  // stale (template fallback uses page IDs that don't match what the AI
  // generated) causing the WC to boot from a non-existent entry and render
  // EmptyRoute → blank preview. Resolve from the real file tree instead.
  const filePaths = new Set(files.map((f) => normalizeGeneratedPath(f.path)));
  let resolvedManifest = manifest;

  if (manifest.routes.length > 0) {
    const primaryPath = normalizeGeneratedPath(manifest.routes[0]!.filePath);
    if (!filePaths.has(primaryPath)) {
      const realEntry = resolveRealEntryPath(filePaths, project.templateId);
      if (realEntry) {
        console.warn(
          `[BEO-440] WC runtime: manifest entry "${primaryPath}" not in file tree — resolved to "${realEntry}"`,
        );
        resolvedManifest = {
          ...manifest,
          routes: manifest.routes.map((route, i) =>
            i === 0 ? { ...route, filePath: realEntry } : route,
          ),
        };
      }
    }
  }

  const contract = {
    mode: "preview" as const,
    provider: "local" as const,
    project: {
      id: project.id,
      name: project.name,
      templateId: project.templateId,
    },
    templateId: template.id,
    shell: resolvedManifest.shell,
    entryPath: resolvedManifest.entryPath,
    navigation: buildGeneratedNavigationFromManifest(resolvedManifest),
    routes: buildGeneratedRoutesFromManifest(resolvedManifest),
  };

  return JSON.stringify(contract, null, 2);
}

// ─── Public: build the full FileSystemTree for a preview ─────────────────────

export interface DbEnv {
  url: string;
  anonKey: string;
  dbSchema: string;
  nonce: string;
}

export function buildPreviewFileTree(
  files: readonly StudioFile[],
  project: Pick<Project, "id" | "name" | "templateId">,
  dbEnv?: DbEnv | null,
  scaffoldType?: "app" | "website",
): FileSystemTree {
  const isWebsite = scaffoldType === "website";

  if (isWebsite) {
    // BEO-692: Website scaffold — files have their own flat src/ structure with
    // index.html (entry: /src/main.tsx) and src/main.tsx. Mount them as-is.
    // Do NOT inject apps/web/src/main.tsx (PreviewApp), runtime.json, or
    // preview/App.tsx — the PreviewApp import.meta.glob targets app/generated/**
    // and would miss all src/… website files, causing a blank preview.
    const flatFiles: Array<{ path: string; contents: string }> = [
      { path: "package.json", contents: WEBSITE_SCAFFOLD_PACKAGE_JSON },
      { path: "tsconfig.json", contents: WORKSPACE_TSCONFIG },
      { path: "vite.config.ts", contents: WEBSITE_VITE_CONFIG },
      ...files.map((file) => ({
        path: normalizeGeneratedPath(file.path),
        contents: file.content,
      })),
    ];
    return pathsToFileTree(flatFiles);
  }

  const flatFiles: Array<{ path: string; contents: string }> = [
    { path: "package.json", contents: WORKSPACE_PACKAGE_JSON },
    { path: "tsconfig.json", contents: WORKSPACE_TSCONFIG },
    { path: "vite.config.ts", contents: WORKSPACE_VITE_CONFIG },
    { path: "index.html", contents: WORKSPACE_INDEX_HTML },
    { path: "apps/web/src/main.tsx", contents: WORKSPACE_MAIN_TSX },
    { path: "apps/web/src/preview/App.tsx", contents: WORKSPACE_PREVIEW_APP_TSX },
    { path: "apps/web/src/preview/styles.css", contents: WORKSPACE_PREVIEW_STYLES_CSS },
    {
      path: "apps/web/src/.beomz/runtime.json",
      contents: buildRuntimeJson(files, project),
    },
    // BEO-130: always include the pre-built DB helper
    { path: "apps/web/src/lib/beomz-db.ts", contents: BEOMZ_DB_HELPER_TS },
    ...files.map((file) => ({
      path: normalizeGeneratedPath(file.path),
      contents: file.content,
    })),
  ];

  // BEO-130: inject DB credentials as .env.local at runtime (NOT embedded in source)
  if (dbEnv?.url && dbEnv.anonKey && dbEnv.dbSchema) {
    const envLines = [
      `VITE_BEOMZ_DB_URL=${dbEnv.url}`,
      `VITE_BEOMZ_ANON_KEY=${dbEnv.anonKey}`,
      `VITE_BEOMZ_DB_SCHEMA=${dbEnv.dbSchema}`,
      dbEnv.nonce ? `VITE_BEOMZ_DB_NONCE=${dbEnv.nonce}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    flatFiles.push({ path: ".env.local", contents: envLines });
  }

  return pathsToFileTree(flatFiles);
}

// ─── BEO-456: First-build shell ───────────────────────────────────────────────
// Mounts only the minimum Vite needs to boot: package.json, tsconfig,
// vite.config, index.html and a BLANK main.tsx. The preview renders nothing
// visible. Real app files are delivered via wc.mount(buildPreviewFileTree(...))
// once Vite's HMR watcher is live — the exact same path the iteration hot-swap
// uses, which is proven to work reliably with HMR.
export function buildShellFileTree(scaffoldType?: "app" | "website"): FileSystemTree {
  if (scaffoldType === "website") {
    // BEO-692: Website shell — entry at /src/main.tsx (blank), matching the
    // entry point that website-generated index.html uses. The real index.html
    // and src/main.tsx are replaced via wc.mount() once files arrive.
    return pathsToFileTree([
      { path: "package.json", contents: WEBSITE_SCAFFOLD_PACKAGE_JSON },
      { path: "tsconfig.json", contents: WORKSPACE_TSCONFIG },
      { path: "vite.config.ts", contents: WEBSITE_VITE_CONFIG },
      { path: "index.html", contents: WEBSITE_SHELL_INDEX_HTML },
      { path: "src/main.tsx", contents: WEBSITE_SHELL_BLANK_MAIN_TSX },
    ]);
  }
  return pathsToFileTree([
    { path: "package.json", contents: WORKSPACE_PACKAGE_JSON },
    { path: "tsconfig.json", contents: WORKSPACE_TSCONFIG },
    { path: "vite.config.ts", contents: WORKSPACE_VITE_CONFIG },
    { path: "index.html", contents: WORKSPACE_INDEX_HTML },
    { path: "apps/web/src/main.tsx", contents: WORKSPACE_BLANK_MAIN_TSX },
  ]);
}

// ─── Singleton management ─────────────────────────────────────────────────────

export type WcStatus =
  | "idle"
  | "booting"
  | "installing"
  | "starting"
  | "ready"
  | "error";

export interface WcInstance {
  wc: WebContainer;
  devProcess: WebContainerProcess | null;
  installedAt: number | null;
}

let wcSingleton: WcInstance | null = null;
let bootingPromise: Promise<WcInstance> | null = null;

export function isWebContainerSupported(): boolean {
  return typeof SharedArrayBuffer !== "undefined";
}

export async function getOrBootWebContainer(): Promise<WcInstance> {
  if (wcSingleton) return wcSingleton;
  if (bootingPromise) return bootingPromise;

  bootingPromise = (async () => {
    const { WebContainer: WC } = await import("@webcontainer/api");
    const wc = await WC.boot();
    const instance: WcInstance = { wc, devProcess: null, installedAt: null };
    wcSingleton = instance;
    return instance;
  })();

  return bootingPromise;
}

/** BEO-587: Tear down the WebContainer singleton so the next boot is fresh. */
export async function teardownWebContainer(): Promise<void> {
  const inst = wcSingleton;
  wcSingleton = null;
  bootingPromise = null;
  if (!inst) return;
  try { inst.devProcess?.kill(); } catch { /* ignore */ }
  try { await inst.wc.teardown(); } catch { /* ignore */ }
}
