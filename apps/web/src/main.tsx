import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { router } from "./router";
import "./index.css";

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
}
