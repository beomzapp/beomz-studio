import type { FileSystemTree, WebContainer, WebContainerProcess } from "@webcontainer/api";

import type { Project, StudioFile } from "@beomz-studio/contracts";
import {
  buildGeneratedManifest,
  buildGeneratedNavigationFromManifest,
  buildGeneratedRoutesFromManifest,
  normalizeGeneratedPath,
  readGeneratedManifestFromFiles,
} from "@beomz-studio/contracts";
import { getTemplateDefinition } from "@beomz-studio/templates";

// ─── Workspace scaffold (mirrors workers/preview-e2b/src/templates/vite-react/workspace) ───

const WORKSPACE_PACKAGE_JSON = JSON.stringify(
  {
    name: "beomz-preview",
    private: true,
    type: "module",
    scripts: { dev: "vite" },
    dependencies: {
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
      "@types/react": "^19.2.2",
      "@types/react-dom": "^19.2.2",
      "@vitejs/plugin-react": "^6.0.1",
      typescript: "^5.9.3",
      vite: "^8.0.1",
    },
  },
  null,
  2,
);

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
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
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

const WORKSPACE_INDEX_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Beomz Preview</title>
    <!-- Tailwind play CDN: scans the DOM via MutationObserver and generates
         utility CSS on the fly so generated TSX classes are applied. -->
    <script src="https://cdn.tailwindcss.com"></script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/apps/web/src/main.tsx"></script>
  </body>
</html>
`;

const WORKSPACE_MAIN_TSX = `import React from "react";
import ReactDOM from "react-dom/client";

import { PreviewApp } from "./preview/App";
import "./preview/styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <PreviewApp />
  </React.StrictMode>,
);
`;

const WORKSPACE_PREVIEW_APP_TSX = `import { useMemo, type ComponentType } from "react";

import runtime from "../.beomz/runtime.json";

type RouteModule = {
  default: ComponentType;
};

const generatedModules = import.meta.glob("../app/generated/**/*.tsx", {
  eager: true,
}) as Record<string, RouteModule>;

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

function EmptyRoute() {
  return (
    <section className="beomz-stage">
      <div className="beomz-eyebrow">Preview route missing</div>
      <h1>This route has not been generated yet.</h1>
    </section>
  );
}

export function PreviewApp() {
  const activeRoute = useMemo(resolveActiveRoute, []);
  const ActiveRoute =
    generatedModules[resolveModuleKey(activeRoute.filePath)]?.default ??
    EmptyRoute;

  return (
    <div className={\`preview-shell shell-\${runtime.shell}\`}>
      <header className="preview-header">
        <div>
          <div className="beomz-eyebrow">{runtime.shell} shell</div>
          <h1>{runtime.project.name}</h1>
        </div>
        <nav className="preview-nav">
          {runtime.navigation.map((item) => (
            <a
              key={item.id}
              href={item.href}
              className={item.href === activeRoute.path ? "active" : undefined}
            >
              {item.label}
            </a>
          ))}
        </nav>
      </header>

      <div className="preview-body">
        {runtime.shell === "website" ? null : (
          <aside className="preview-sidebar">
            {runtime.routes.map((route) => (
              <a
                key={route.id}
                href={route.path}
                className={
                  route.path === activeRoute.path ? "active" : undefined
                }
              >
                <strong>{route.label}</strong>
                <span>{route.summary}</span>
              </a>
            ))}
          </aside>
        )}

        <main className="preview-main">
          <div className="preview-route-meta">
            <div className="beomz-eyebrow">Live route</div>
            <h2>{activeRoute.label}</h2>
            <p>{activeRoute.summary}</p>
          </div>
          <ActiveRoute />
        </main>
      </div>
    </div>
  );
}
`;

const WORKSPACE_PREVIEW_STYLES_CSS = `:root {
  color-scheme: dark;
  font-family: "Geist Sans", system-ui, sans-serif;
  --bg: #050816;
  --panel: rgba(13, 20, 42, 0.94);
  --panel-soft: rgba(255, 255, 255, 0.04);
  --border: rgba(255, 255, 255, 0.08);
  --text: rgba(255, 255, 255, 0.94);
  --muted: rgba(255, 255, 255, 0.62);
  --accent: #f97316;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  min-height: 100vh;
  background:
    radial-gradient(circle at top, rgba(249, 115, 22, 0.2), transparent 42%),
    linear-gradient(160deg, #050816 0%, #0d1630 48%, #050816 100%);
  color: var(--text);
}

a { color: inherit; }

.preview-shell { min-height: 100vh; padding: 20px; }

.preview-header,
.preview-sidebar,
.preview-main,
.beomz-card,
.beomz-stage {
  border: 1px solid var(--border);
  background: var(--panel);
  backdrop-filter: blur(18px);
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.35);
}

.preview-header {
  border-radius: 28px;
  padding: 22px 24px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
}

.preview-header h1, .preview-route-meta h2, .beomz-stage h1 { margin: 0; }

.preview-nav { display: flex; flex-wrap: wrap; gap: 10px; }

.preview-nav a, .preview-sidebar a {
  text-decoration: none;
  border: 1px solid var(--border);
  color: var(--muted);
  transition: border-color 180ms ease, color 180ms ease, background 180ms ease;
}

.preview-nav a { padding: 10px 14px; border-radius: 999px; }

.preview-nav a.active, .preview-sidebar a.active {
  border-color: rgba(249, 115, 22, 0.55);
  color: var(--text);
  background: rgba(249, 115, 22, 0.12);
}

.preview-body {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  gap: 18px;
  margin-top: 18px;
}

.shell-website .preview-body { display: block; }

.preview-sidebar {
  border-radius: 24px;
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.preview-sidebar a {
  padding: 14px 16px;
  border-radius: 18px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.preview-sidebar span, .preview-route-meta p, .beomz-stage p, .beomz-card span {
  color: var(--muted);
}

.preview-main {
  border-radius: 24px;
  padding: 24px;
  min-height: calc(100vh - 144px);
}

.preview-route-meta { margin-bottom: 20px; }

.beomz-eyebrow {
  font-size: 11px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--accent);
  margin-bottom: 12px;
}

.beomz-stage { border-radius: 28px; padding: 28px; }

.beomz-stage-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
  margin-top: 22px;
}

.beomz-card { border-radius: 20px; padding: 16px; }
.beomz-card strong { display: block; margin-top: 8px; }

@media (max-width: 900px) {
  .preview-header { flex-direction: column; }
  .preview-body { grid-template-columns: 1fr; }
  .preview-main { min-height: auto; }
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

function buildRuntimeJson(
  files: readonly Pick<StudioFile, "path" | "content">[],
  project: Pick<Project, "id" | "name" | "templateId">,
): string {
  const template = getTemplateDefinition(project.templateId);
  const manifest =
    readGeneratedManifestFromFiles(project.templateId, files) ??
    buildGeneratedManifest(template);

  const contract = {
    mode: "preview" as const,
    provider: "local" as const,
    project: {
      id: project.id,
      name: project.name,
      templateId: project.templateId,
    },
    templateId: template.id,
    shell: manifest.shell,
    entryPath: manifest.entryPath,
    navigation: buildGeneratedNavigationFromManifest(manifest),
    routes: buildGeneratedRoutesFromManifest(manifest),
  };

  return JSON.stringify(contract, null, 2);
}

// ─── Public: build the full FileSystemTree for a preview ─────────────────────

export function buildPreviewFileTree(
  files: readonly StudioFile[],
  project: Pick<Project, "id" | "name" | "templateId">,
): FileSystemTree {
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
    ...files.map((file) => ({
      path: normalizeGeneratedPath(file.path),
      contents: file.content,
    })),
  ];

  return pathsToFileTree(flatFiles);
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
