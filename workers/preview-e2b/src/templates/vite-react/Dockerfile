FROM node:20-bookworm-slim

RUN corepack enable \
  && corepack prepare pnpm@9.15.4 --activate \
  && npm install --global tsx@4.20.6

WORKDIR /workspace

COPY runner.ts /opt/beomz/runner.ts

RUN mkdir -p /workspace/apps/web/src/preview \
  /workspace/apps/web/src/app/generated \
  /workspace/apps/web/src/.beomz

RUN cat <<'EOF' > /workspace/package.json
{
  "name": "beomz-e2b-preview",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@9.15.4",
  "scripts": {
    "build": "vite build"
  },
  "dependencies": {
    "react": "^19.2.0",
    "react-dom": "^19.2.0"
  },
  "devDependencies": {
    "@types/react": "^19.2.2",
    "@types/react-dom": "^19.2.2",
    "@vitejs/plugin-react": "^6.0.1",
    "typescript": "^5.9.3",
    "vite": "^8.0.1"
  }
}
EOF

RUN cat <<'EOF' > /workspace/tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true
  },
  "include": ["apps/web/src", "vite.config.ts"]
}
EOF

RUN cat <<'EOF' > /workspace/vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: Number(process.env.BEOMZ_PREVIEW_PORT ?? 4173),
    strictPort: true,
  },
  preview: {
    host: "0.0.0.0",
    port: Number(process.env.BEOMZ_PREVIEW_PORT ?? 4173),
    strictPort: true,
  },
});
EOF

RUN cat <<'EOF' > /workspace/index.html
<!doctype html>
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
EOF

RUN cat <<'EOF' > /workspace/apps/web/src/main.tsx
import React from "react";
import ReactDOM from "react-dom/client";

import { PreviewApp } from "./preview/App";
import "./preview/styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <PreviewApp />
  </React.StrictMode>,
);
EOF

RUN cat <<'EOF' > /workspace/apps/web/src/preview/App.tsx
import { useMemo, type ComponentType } from "react";

import runtime from "../.beomz/runtime.json";

type RouteModule = {
  default: ComponentType;
};

const generatedModules = import.meta.glob("../app/generated/**/*.tsx", {
  eager: true,
}) as Record<string, RouteModule>;

function resolveModuleKey(filePath: string): string {
  return `../${filePath.replace(/^apps\\/web\\/src\\//, "")}`;
}

function resolveActiveRoute() {
  const currentPath = window.location.pathname;

  return runtime.routes.find((route) => route.path === currentPath)
    ?? runtime.routes.find((route) => route.path === runtime.entryPath)
    ?? runtime.routes[0];
}

function EmptyRoute() {
  return (
    <section className="beomz-stage">
      <div className="beomz-eyebrow">Preview route missing</div>
      <h1>This route has not been generated yet.</h1>
      <p>
        The preview shell is ready. As files stream in, this page will update in place.
      </p>
    </section>
  );
}

export function PreviewApp() {
  const activeRoute = useMemo(resolveActiveRoute, []);
  const ActiveRoute = generatedModules[resolveModuleKey(activeRoute.filePath)]?.default ?? EmptyRoute;

  return (
    <div className={`preview-shell shell-${runtime.shell}`}>
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
                className={route.path === activeRoute.path ? "active" : undefined}
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
EOF

RUN cat <<'EOF' > /workspace/apps/web/src/preview/styles.css
:root {
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

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100vh;
  background:
    radial-gradient(circle at top, rgba(249, 115, 22, 0.2), transparent 42%),
    linear-gradient(160deg, #050816 0%, #0d1630 48%, #050816 100%);
  color: var(--text);
}

a {
  color: inherit;
}

.preview-shell {
  min-height: 100vh;
  padding: 20px;
}

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

.preview-header h1,
.preview-route-meta h2,
.beomz-stage h1 {
  margin: 0;
}

.preview-nav {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.preview-nav a,
.preview-sidebar a {
  text-decoration: none;
  border: 1px solid var(--border);
  color: var(--muted);
  transition: border-color 180ms ease, color 180ms ease, background 180ms ease;
}

.preview-nav a {
  padding: 10px 14px;
  border-radius: 999px;
}

.preview-nav a.active,
.preview-sidebar a.active {
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

.shell-website .preview-body {
  display: block;
}

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

.preview-sidebar span,
.preview-route-meta p,
.beomz-stage p,
.beomz-card span {
  color: var(--muted);
}

.preview-main {
  border-radius: 24px;
  padding: 24px;
  min-height: calc(100vh - 144px);
}

.preview-route-meta {
  margin-bottom: 20px;
}

.beomz-eyebrow {
  font-size: 11px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--accent);
  margin-bottom: 12px;
}

.beomz-stage {
  border-radius: 28px;
  padding: 28px;
}

.beomz-stage-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
  margin-top: 22px;
}

.beomz-card {
  border-radius: 20px;
  padding: 16px;
}

.beomz-card strong {
  display: block;
  margin-top: 8px;
}

@media (max-width: 900px) {
  .preview-header {
    flex-direction: column;
  }

  .preview-body {
    grid-template-columns: 1fr;
  }

  .preview-main {
    min-height: auto;
  }
}
EOF

RUN pnpm install
