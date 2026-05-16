import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { router } from "./router";
import { MaintenancePage } from "./app/maintenance/page";
import "./index.css";

// BEO-580: hide the inline app shell once React paints. Done in two steps so
// the browser gets a chance to commit the React tree before the shell fades.
function hideAppShell() {
  const shell = document.getElementById("app-shell");
  if (!shell) return;
  shell.classList.add("app-shell-hidden");
  window.setTimeout(() => shell.remove(), 250);
}

// NOTE: The Beomz subdomain redirect (slug.beomz.ai → /p/slug) that ships in
// apps/web is intentionally removed here. Myndlab playground doesn't host
// published apps — it's its own studio served at myndlab-dev.beomz.ai. The
// redirect would otherwise bounce visitors to /p/myndlab-dev → WebContainer
// route → SharedArrayBuffer check → "Browser not supported" dead-end.

function hasMaintenanceAccess() {
  try {
    if (window.localStorage.getItem("beomz_access") === "1") return true;
  } catch {
    // ignore
  }

  try {
    return document.cookie.split("; ").some((entry) => entry === "beomz_access=1");
  } catch {
    return false;
  }
}

function AppGate() {
  const [hasAccess, setHasAccess] = useState(() => !window.__VITE_MAINTENANCE_MODE__ && hasMaintenanceAccess());

  useEffect(() => {
    if (!window.__VITE_MAINTENANCE_MODE__) {
      setHasAccess(true);
      return;
    }
    setHasAccess(hasMaintenanceAccess());
  }, []);

  if (window.__VITE_MAINTENANCE_MODE__ && !hasAccess) {
    return <MaintenancePage />;
  }

  return <RouterProvider router={router} />;
}

declare global {
  interface Window {
    __VITE_MAINTENANCE_MODE__?: boolean;
  }
}

window.__VITE_MAINTENANCE_MODE__ = true;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppGate />
  </StrictMode>,
);
// Wait one frame so the first React paint has committed before fading the
// shell — prevents a flash of unstyled / empty content.
requestAnimationFrame(() => requestAnimationFrame(hideAppShell));
