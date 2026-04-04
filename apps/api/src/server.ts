import { serve } from "@hono/node-server";
import { cors } from "hono/cors";
import { Hono } from "hono";

import { apiConfig } from "./config.js";
import authLoginRoute from "./routes/auth/login.js";
import authMeRoute from "./routes/auth/me.js";
import buildsStartRoute from "./routes/builds/start.js";
import buildsStatusRoute from "./routes/builds/status.js";
import checkpointsRoute from "./routes/checkpoints.js";
import planClarifyRoute from "./routes/plan/clarify.js";
import planGenerateRoute from "./routes/plan/generate.js";
import planSessionRoute from "./routes/plan/session.js";
import previewsSessionRoute from "./routes/previews/session.js";

const app = new Hono();

app.use(
  "*",
  cors({
    origin: ["https://beomz.ai", "http://localhost:5173"],
    credentials: true,
  }),
);

app.get("/health", (c) => c.json({ status: "ok" }));
app.route("/auth/login", authLoginRoute);
app.route("/auth/me", authMeRoute);
app.route("/builds/start", buildsStartRoute);
app.route("/builds/:id/status", buildsStatusRoute);
app.route("/checkpoints", checkpointsRoute);
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
