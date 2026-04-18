import "dotenv/config";
import { serve } from "@hono/node-server";
import { cors } from "hono/cors";
import { Hono } from "hono";

import { activeBuilds } from "./lib/activeBuilds.js";
import { createStudioDbClient } from "@beomz-studio/studio-db";
import { apiConfig } from "./config.js";
import authLoginRoute from "./routes/auth/login.js";
import authMeRoute from "./routes/auth/me.js";
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
import { vercelDeployRoute } from "./routes/projects/vercel.js";
import nextPhaseRoute from "./routes/projects/next-phase.js";
const app = new Hono();

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

app.get("/", (c) => c.json({ status: "ok" }));
app.get("/health", (c) => c.json({ status: "ok" }));
app.route("/auth/login", authLoginRoute);
app.route("/auth/me", authMeRoute);
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
app.route("/payments/checkout", checkoutRoute);
app.route("/payments/confirm-topup", confirmTopupRoute);
app.route("/payments/portal", portalRoute);
app.route("/payments/topup/checkout", topupCheckoutRoute);
app.route("/payments/webhook", webhookRoute);
// BEO-329 / BEO-404: Storage add-on checkout + public add-on list
app.route("/payments/storage-addon", createStorageAddonRoute());
app.route("/payments/storage-addons", createStorageAddonRoute());
// BEO-130: Built-in DB + BYO Supabase
app.route("/projects/:id/db", dbRouter);
// BEO-262: Publish
app.route("/projects/:id/publish", publishRoute);
app.route("/projects/:id/export", exportRoute);
app.route("/projects/check-slug", checkSlugRoute);
app.route("/p", publicSlugRoute);
// Vercel deploy — slug.beomz.app
app.route("/projects/:id/deploy/vercel", vercelDeployRoute);
// BEO-197: Phased build system
app.route("/projects/:id/next-phase", nextPhaseRoute);

serve(
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

// ── Graceful shutdown (BEO-255 / BEO-318) ────────────────────────────────────
// PM2 sends SIGTERM when reloading. We:
//  1. Write a server_restarting error event to each active build's builderTrace
//     (so events.ts SSE relay delivers it to the frontend before the stream dies).
//  2. Mark the generation as failed so the polling loop terminates cleanly.
//  3. Exit — no 180s drain needed; the DB write is the only critical work.
//     kill_timeout in ecosystem.config.cjs is set to 35s to allow the write.

/** Read the builderTrace from generation metadata (same logic as readTrace in generate.ts). */
function readBuilderTrace(metadata: Record<string, unknown>): {
  events: unknown[];
  lastEventId: string | null;
  previewReady: boolean;
  fallbackUsed: boolean;
  fallbackReason: string | null;
} {
  const t = metadata.builderTrace;
  if (typeof t === "object" && t !== null && !Array.isArray(t)) {
    const raw = t as Record<string, unknown>;
    return {
      events: Array.isArray(raw.events) ? raw.events : [],
      lastEventId: typeof raw.lastEventId === "string" ? raw.lastEventId : null,
      previewReady: raw.previewReady === true,
      fallbackUsed: raw.fallbackUsed === true,
      fallbackReason: typeof raw.fallbackReason === "string" ? raw.fallbackReason : null,
    };
  }
  return { events: [], lastEventId: null, previewReady: false, fallbackUsed: false, fallbackReason: null };
}

async function gracefulShutdown(signal: string): Promise<void> {
  if (activeBuilds.size === 0) {
    console.log(`[shutdown] ${signal} received — no active builds. Exiting immediately.`);
    process.exit(0);
  }

  console.log(`[shutdown] ${signal} received — ${activeBuilds.size} active build(s). Writing server_restarting events...`);

  try {
    const db = createStudioDbClient();
    const completedAt = new Date().toISOString();

    await Promise.allSettled(
      [...activeBuilds].map(async (buildId) => {
        try {
          const row = await db.findGenerationById(buildId);
          if (!row) {
            // Row not found — just mark failed without trace update
            await db.updateGeneration(buildId, {
              status: "failed",
              error: "Server restarted during build",
              completed_at: completedAt,
            });
            return;
          }

          const meta = typeof row.metadata === "object" && row.metadata !== null
            ? (row.metadata as Record<string, unknown>)
            : {};

          const trace = readBuilderTrace(meta);

          // Append server_restarting error event to trace so events.ts emits
          // it as the terminal event — frontend receives code "server_restarting"
          // (CC's frontend handler keeps the overlay up rather than dropping it).
          const restartingEvent = {
            id: `${buildId}:server-restarting`,
            type: "error" as const,
            code: "server_restarting",
            message: "Server is restarting. Your build will resume shortly.",
            buildId,
            projectId: row.project_id,
            operation: "initial_build" as const,
            timestamp: completedAt,
          };

          const newTrace = {
            ...trace,
            events: [...trace.events, restartingEvent],
            lastEventId: restartingEvent.id,
          };

          await db.updateGeneration(buildId, {
            status: "failed",
            error: "Server restarted during build",
            completed_at: completedAt,
            metadata: { ...meta, builderTrace: newTrace },
          });

          console.log(`[shutdown] server_restarting event written for build ${buildId}`);
        } catch (err) {
          console.warn(`[shutdown] failed to write server_restarting for build ${buildId}:`, err instanceof Error ? err.message : String(err));
          // Best-effort fallback: mark failed without trace
          try {
            await db.updateGeneration(buildId, {
              status: "failed",
              error: "Server restarted during build",
              completed_at: completedAt,
            });
          } catch { /* ignore */ }
        }
      }),
    );

    console.log(`[shutdown] DB writes complete. Exiting.`);
  } catch (err) {
    console.warn("[shutdown] gracefulShutdown DB write failed (non-fatal):", err instanceof Error ? err.message : String(err));
  }

  process.exit(0);
}

process.on("SIGTERM", () => { void gracefulShutdown("SIGTERM"); });
process.on("SIGINT", () => { void gracefulShutdown("SIGINT"); });
