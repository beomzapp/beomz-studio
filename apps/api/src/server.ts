import { serve } from "@hono/node-server";
import { cors } from "hono/cors";
import { Hono } from "hono";

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
import planClarifyRoute from "./routes/plan/clarify.js";
import planGenerateRoute from "./routes/plan/generate.js";
import planSessionRoute from "./routes/plan/session.js";
import previewsSessionRoute from "./routes/previews/session.js";

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
app.route("/builds/:id/events", buildsEventsRoute);
app.route("/builds/:id/fork", buildsForkRoute);
app.route("/builds/:id/restore", buildsRestoreRoute);
app.route("/builds/start", buildsStartRoute);
app.route("/builds/:id/status", buildsStatusRoute);
app.route("/projects/:projectId/builds", buildsListRoute);
app.route("/projects/:projectId/latest-build", buildsLatestRoute);
app.route("/plan/clarify", planClarifyRoute);
app.route("/plan/generate", planGenerateRoute);
app.route("/plan/session", planSessionRoute);
app.route("/previews/session", previewsSessionRoute);

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
