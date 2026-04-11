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

const WORKSPACE_PREVIEW_APP_TSX = `import { useMemo, type ComponentType } from "react";

import runtime from "../.beomz/runtime.json";

type AnyGeneratedModule = { default?: ComponentType; [key: string]: unknown };

// Include .ts so theme.ts (and other utility modules) are in Vite's module graph
// and can be resolved via relative imports from .tsx components.
const generatedModules = import.meta.glob("../app/generated/**/*.{ts,tsx}", {
  eager: true,
}) as Record<string, AnyGeneratedModule>;

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
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0a0a", color: "#9ca3af" }}>
      <div style={{ textAlign: "center" }}>
        <p style={{ fontSize: "16px", fontWeight: 500, color: "#e5e7eb", margin: 0 }}>Route not found</p>
        <p style={{ fontSize: "14px", marginTop: "8px", color: "#9ca3af" }}>This route has not been generated yet.</p>
      </div>
    </div>
  );
}

export function PreviewApp() {
  const activeRoute = useMemo(resolveActiveRoute, []);
  const ActiveRoute =
    generatedModules[resolveModuleKey(activeRoute.filePath)]?.default ??
    EmptyRoute;

  return <ActiveRoute />;
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
  const template = getTemplateDefinitionSafe(project.templateId);
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
