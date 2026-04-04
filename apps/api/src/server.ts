import { serve } from "@hono/node-server";
import { Hono } from "hono";

import { apiConfig } from "./config.js";
import authLoginRoute from "./routes/auth/login.js";
import authMeRoute from "./routes/auth/me.js";
import buildsStartRoute from "./routes/builds/start.js";
import buildsStatusRoute from "./routes/builds/status.js";
import previewsSessionRoute from "./routes/previews/session.js";

const app = new Hono();

app.get("/health", (c) => c.json({ ok: true }));
app.route("/auth/login", authLoginRoute);
app.route("/auth/me", authMeRoute);
app.route("/builds/start", buildsStartRoute);
app.route("/builds/:id/status", buildsStatusRoute);
app.route("/previews/session", previewsSessionRoute);

serve(
  {
    fetch: app.fetch,
    port: apiConfig.PORT,
  },
  (info) => {
    // eslint-disable-next-line no-console
    console.log(`Beomz Studio API listening on http://localhost:${info.port}`);
  },
);
