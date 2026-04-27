import "dotenv/config";
import { serve } from "@hono/node-server";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { Hono } from "hono";

import { apiConfig } from "./config.js";
import assetImageRoute from "./routes/assets/image.js";
import authLoginRoute from "./routes/auth/login.js";
import authMeRoute from "./routes/auth/me.js";
import meRoute from "./routes/me.js";
import activityRoute from "./routes/activity.js";
import adminBuildsRoute from "./routes/admin/builds.js";
import adminCreditsRoute from "./routes/admin/credits.js";
import adminHeatmapRoute from "./routes/admin/heatmap.js";
import adminUsersRoute from "./routes/admin/users.js";
import buildsEventsRoute from "./routes/builds/events.js";
import buildsForkRoute from "./routes/builds/fork.js";
import buildsLatestRoute from "./routes/builds/latest.js";
import buildsListRoute from "./routes/builds/list.js";
import buildsRestoreRoute from "./routes/builds/restore.js";
import buildsStartRoute from "./routes/builds/start.js";
import buildsStatusRoute from "./routes/builds/status.js";
import buildsSummaryRoute from "./routes/builds/summary.js";
import buildsChatRoute from "./routes/builds/chat.js";
import buildsSummariseChatRoute from "./routes/builds/summarise-chat.js";
import buildsUploadImageRoute from "./routes/builds/upload-image.js";
import buildsConfirmScopeRoute from "./routes/builds/confirm-scope.js";
import buildsForceSimpleRoute from "./routes/builds/force-simple.js";
import planAnalyzeRoute from "./routes/plan/analyze.js";
import planClarifyRoute from "./routes/plan/clarify.js";
import planGenerateRoute from "./routes/plan/generate.js";
import planSessionRoute from "./routes/plan/session.js";
import enhanceRoute from "./routes/enhance/index.js";
import fixRoute from "./routes/fix/index.js";
import projectsRoute from "./routes/projects/index.js";
import avatarRoute from "./routes/avatar/index.js";
import creditsRoute from "./routes/credits/index.js";
import referralsRoute from "./routes/referrals.js";
import checkoutRoute from "./routes/payments/checkout.js";
import confirmTopupRoute from "./routes/payments/confirm-topup.js";
import portalRoute from "./routes/payments/portal.js";
import topupCheckoutRoute from "./routes/payments/topup.js";
import webhookRoute from "./routes/payments/webhook.js";
import {
  createStorageAddonRoute,
} from "./routes/payments/storage-addon.js";
import dbRouter from "./routes/db/index.js";
import {
  checkSlugRoute,
  exportRoute,
  publicSlugRoute,
  publishRoute,
} from "./routes/projects/publish.js";
import projectVersionsRoute from "./routes/projects/versions.js";
import { vercelDeployRoute, vercelDomainsRoute } from "./routes/projects/vercel.js";
import nextPhaseRoute from "./routes/projects/next-phase.js";
import projectAuthRoute, { PROJECT_AUTH_CORS_HEADERS } from "./routes/projects/auth.js";
import supabaseIntegrationsRoute from "./routes/integrations/supabase.js";
import websitesGenerateRoute from "./routes/websites/generate.js";

const app = new Hono();
const activeSseConnections = new Set<string>();
const REQUEST_BODY_LIMIT_BYTES = 20 * 1024 * 1024;
const SSE_DRAIN_TIMEOUT_MS = 25_000;
const SSE_DRAIN_POLL_INTERVAL_MS = 500;

let isShuttingDown = false;
let shutdownPromise: Promise<void> | null = null;

if (!process.env.BEOMZ_JWT_SECRET) {
  console.warn("[auth] BEOMZ_JWT_SECRET not set — Neon auth will use fallback");
}

app.use("/projects/:id/auth/*", async (c, next) => {
  if (c.req.method === "OPTIONS") {
    return new Response(null, {
      headers: PROJECT_AUTH_CORS_HEADERS,
      status: 204,
    });
  }

  await next();
});

app.use(
  "*",
  cors({
    origin: (origin) => {
      if (!origin) return origin;
      // Allow all *.beomz.ai subdomains (published apps)
      if (origin.endsWith(".beomz.ai")) return origin;
      const allowed = [
        "https://beomz.ai",
        "https://www.beomz.ai",
        "http://localhost:5173",
        "http://localhost:5188",
        "http://localhost:3000",
      ];
      return allowed.includes(origin) ? origin : null;
    },
    credentials: true,
  }),
);

app.use(
  "*",
  bodyLimit({
    maxSize: REQUEST_BODY_LIMIT_BYTES,
    onError: (c) => c.json({ error: "Request body must be 20MB or smaller." }, 413),
  }),
);

app.use("*", async (c, next) => {
  if (isShuttingDown) {
    return c.json({ error: "Server is restarting. Please retry shortly." }, 503);
  }

  await next();

  const contentType = c.res.headers.get("content-type") ?? "";
  if (!contentType.includes("text/event-stream") || !c.res.body) {
    return;
  }

  const connectionId = `${Date.now()}:${Math.random().toString(36).slice(2)}`;
  activeSseConnections.add(connectionId);

  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    activeSseConnections.delete(connectionId);
    c.req.raw.signal.removeEventListener("abort", cleanup);
  };

  c.req.raw.signal.addEventListener("abort", cleanup, { once: true });

  const reader = c.res.body.getReader();
  const trackedBody = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          cleanup();
          controller.close();
          return;
        }

        if (value) {
          controller.enqueue(value);
        }
      } catch (error) {
        cleanup();
        controller.error(error);
      }
    },
    async cancel(reason) {
      cleanup();
      await reader.cancel(reason);
    },
  });

  c.res = new Response(trackedBody, {
    headers: new Headers(c.res.headers),
    status: c.res.status,
    statusText: c.res.statusText,
  });
});

app.get("/", (c) => c.json({ status: "ok" }));
app.get("/health", (c) => c.json({ status: "ok" }));
app.route("/assets/image", assetImageRoute);
app.route("/auth/login", authLoginRoute);
app.route("/auth/me", authMeRoute);
app.route("/me", meRoute);
app.route("/activity", activityRoute);
app.route("/admin/builds", adminBuildsRoute);
app.route("/admin/credits", adminCreditsRoute);
app.route("/admin/heatmap", adminHeatmapRoute);
app.route("/admin/users", adminUsersRoute);
app.route("/projects/:id/auth", projectAuthRoute);
app.route("/builds/start", buildsStartRoute);
app.route("/builds/upload-image", buildsUploadImageRoute);
app.route("/builds/summary", buildsSummaryRoute);
app.route("/builds/chat", buildsChatRoute);
app.route("/builds/summarise-chat", buildsSummariseChatRoute);
app.route("/builds/:id/events", buildsEventsRoute);
app.route("/builds/:id/confirm-scope", buildsConfirmScopeRoute);
app.route("/builds/:id/force-simple", buildsForceSimpleRoute);
app.route("/builds/:id/fork", buildsForkRoute);
app.route("/builds/:id/restore", buildsRestoreRoute);
app.route("/builds/:id/status", buildsStatusRoute);
app.route("/projects/:projectId/builds", buildsListRoute);
app.route("/projects/:projectId/latest-build", buildsLatestRoute);
app.route("/plan/analyze", planAnalyzeRoute);
app.route("/plan/clarify", planClarifyRoute);
app.route("/plan/generate", planGenerateRoute);
app.route("/plan/session", planSessionRoute);
app.route("/enhance", enhanceRoute);
app.route("/fix", fixRoute);
app.route("/projects", projectsRoute);
app.route("/avatar", avatarRoute);
// BEO-261: Credits & Payments
app.route("/credits", creditsRoute);
app.route("/referrals", referralsRoute);
app.route("/payments/checkout", checkoutRoute);
app.route("/payments/confirm-topup", confirmTopupRoute);
app.route("/payments/portal", portalRoute);
app.route("/payments/topup/checkout", topupCheckoutRoute);
app.route("/payments/webhook", webhookRoute);
// BEO-329 / BEO-404: Storage add-on checkout + public add-on list
app.route("/payments/storage-addon", createStorageAddonRoute());
app.route("/payments/storage-addons", createStorageAddonRoute());
app.route("/integrations/supabase", supabaseIntegrationsRoute);
app.route("/websites", websitesGenerateRoute);
// BEO-130: Built-in DB + BYO Supabase
app.route("/projects/:id/db", dbRouter);
// BEO-262: Publish
app.route("/projects/:id/publish", publishRoute);
app.route("/projects/:id/export", exportRoute);
app.route("/projects/:id/versions", projectVersionsRoute);
app.route("/projects/check-slug", checkSlugRoute);
app.route("/p", publicSlugRoute);
// Vercel deploy — slug.beomz.app
app.route("/projects/:id/deploy/vercel", vercelDeployRoute);
app.route("/projects/:id/domains", vercelDomainsRoute);
// BEO-197: Phased build system
app.route("/projects/:id/next-phase", nextPhaseRoute);

const server = serve(
  {
    fetch: app.fetch,
    hostname: "0.0.0.0",
    port: apiConfig.PORT,
  },
  (info) => {
    // eslint-disable-next-line no-console
    console.log(`Beomz Studio API listening on http://localhost:${info.port}`);
    // Signal pm2 that the process is ready so it stops counting sub-restarts
    // during graceful reloads (fixes the 350-restart-in-8h race condition).
    if (process.send) {
      process.send("ready");
    }
  },
);

async function gracefulShutdown(signal: string): Promise<void> {
  if (shutdownPromise) {
    return shutdownPromise;
  }

  isShuttingDown = true;
  console.log(`[shutdown] ${signal} received — ${activeSseConnections.size} active SSE stream(s). Draining before exit.`);

  server.close();

  shutdownPromise = (async () => {
    const startedAt = Date.now();

    while (activeSseConnections.size > 0 && Date.now() - startedAt < SSE_DRAIN_TIMEOUT_MS) {
      await new Promise((resolve) => setTimeout(resolve, SSE_DRAIN_POLL_INTERVAL_MS));
    }

    const timedOut = activeSseConnections.size > 0;
    if (timedOut) {
      console.warn(`[shutdown] drain timeout reached with ${activeSseConnections.size} active SSE stream(s). Exiting.`);
    } else {
      console.log("[shutdown] all active SSE streams drained. Exiting.");
    }

    process.exit(0);
  })();

  return shutdownPromise;
}

process.on("SIGTERM", () => { void gracefulShutdown("SIGTERM"); });
process.on("SIGINT", () => { void gracefulShutdown("SIGINT"); });
