import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { router } from "./router";
import "./index.css";

// BEO-580: hide the inline app shell once React paints. Done in two steps so
// the browser gets a chance to commit the React tree before the shell fades.
function hideAppShell() {
  const shell = document.getElementById("app-shell");
  if (!shell) return;
  shell.classList.add("app-shell-hidden");
  window.setTimeout(() => shell.remove(), 250);
}

// Subdomain redirect: slug.beomz.ai → /p/slug
// Must run before the router renders so TanStack picks up the /p/:slug route.
const _hostname = window.location.hostname;
const _isPublishedSubdomain =
  _hostname.endsWith(".beomz.ai") &&
  _hostname !== "beomz.ai" &&
  _hostname !== "www.beomz.ai";

if (_isPublishedSubdomain && !window.location.pathname.startsWith("/p/")) {
  const _slug = _hostname.replace(".beomz.ai", "");
  window.location.replace("/p/" + _slug);
} else {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>
  );
  // Wait one frame so the first React paint has committed before fading the
  // shell — prevents a flash of unstyled / empty content.
  requestAnimationFrame(() => requestAnimationFrame(hideAppShell));
}
