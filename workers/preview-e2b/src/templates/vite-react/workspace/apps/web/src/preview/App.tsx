import { useMemo, type ComponentType } from "react";

import runtime from "../.beomz/runtime.json";

type RouteModule = {
  default: ComponentType;
};

const generatedModules = import.meta.glob("../app/generated/**/*.tsx", {
  eager: true,
}) as Record<string, RouteModule>;

function resolveModuleKey(filePath: string): string {
  return `../${filePath.replace(/^apps\/web\/src\//, "")}`;
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
