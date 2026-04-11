import "dotenv/config";
import { serve } from "@hono/node-server";
import { cors } from "hono/cors";
import { Hono } from "hono";

import { activeBuilds } from "./lib/activeBuilds.js";
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
import webhookRoute from "./routes/payments/webhook.js";
const app = new Hono();

app.use(
  "*",
  cors({
    origin: [
      "https://beomz.ai",
      "https://www.beomz.ai",
      "http://localhost:5173",
      "http://localhost:5188",
      "http://localhost:3000",
    ],
    credentials: true,
  }),
);

app.get("/", (c) => c.json({ status: "ok" }));
app.get("/health", (c) => c.json({ status: "ok" }));
app.route("/auth/login", authLoginRoute);
app.route("/auth/me", authMeRoute);
app.route("/builds/start", buildsStartRoute);
app.route("/builds/summary", buildsSummaryRoute);
app.route("/builds/:id/events", buildsEventsRoute);
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
app.route("/payments/webhook", webhookRoute);

serve(
  {
    fetch: app.fetch,
    hostname: "0.0.0.0",
    port: apiConfig.PORT,
  },
  (info) => {
    // eslint-disable-next-line no-console
    console.log(`Beomz Studio API listening on http://localhost:${info.port}`);
  },
);

// ── Graceful shutdown (BEO-255) ──────────────────────────────────────────────
// PM2 sends SIGTERM (or SIGINT) when restarting. If any Sonnet build is still
// running we wait up to 60s before exiting so the build can complete and write
// its result to Supabase rather than dying mid-generation.
async function gracefulShutdown(signal: string): Promise<void> {
  if (activeBuilds.size > 0) {
    console.log(`[shutdown] ${signal} received — ${activeBuilds.size} active build(s) in flight. Waiting up to 60s...`);
    const deadline = Date.now() + 60_000;
    while (activeBuilds.size > 0 && Date.now() < deadline) {
      await new Promise<void>((resolve) => setTimeout(resolve, 1_000));
    }
    if (activeBuilds.size > 0) {
      console.warn(`[shutdown] Deadline reached — forcing exit with ${activeBuilds.size} build(s) still running.`);
    } else {
      console.log("[shutdown] All builds drained. Exiting cleanly.");
    }
  } else {
    console.log(`[shutdown] ${signal} received — no active builds. Exiting immediately.`);
  }
  process.exit(0);
}

process.on("SIGTERM", () => { void gracefulShutdown("SIGTERM"); });
process.on("SIGINT", () => { void gracefulShutdown("SIGINT"); });
