/**
 * DB routes aggregated under /projects/:id/db/
 *
 * POST   /enable   — provision built-in DB (plan-gated)
 * GET    /status   — DB status + WC env vars
 * GET    /schema   — live tables + columns
 * POST   /wire     — wire app to DB via Gemini
 * POST   /disable  — drop schema + cleanup
 * POST   /connect  — BYO Supabase connect (url + anonKey only)
 * POST   /migrate  — execute SQL migrations
 */
import { Hono } from "hono";

import enableDbRoute from "./enable.js";
import statusDbRoute from "./status.js";
import schemaDbRoute from "./schema.js";
import wireDbRoute from "./wire.js";
import disableDbRoute from "./disable.js";
import connectDbRoute from "./connect.js";
import migrateDbRoute from "./migrate.js";
import usageDbRoute from "./usage.js";

const dbRouter = new Hono();

dbRouter.route("/enable", enableDbRoute);
dbRouter.route("/status", statusDbRoute);
dbRouter.route("/schema", schemaDbRoute);
dbRouter.route("/wire", wireDbRoute);
dbRouter.route("/disable", disableDbRoute);
dbRouter.route("/connect", connectDbRoute);
dbRouter.route("/migrate", migrateDbRoute);
dbRouter.route("/usage", usageDbRoute);

export default dbRouter;
