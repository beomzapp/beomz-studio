import { Hono } from "hono";

import { loadOrgContext } from "../../middleware/loadOrgContext.js";
import { verifyPlatformJwt } from "../../middleware/verifyPlatformJwt.js";
import { PLAN_LIMITS } from "../../lib/credits.js";
import type { OrgContext } from "../../types.js";

const creditsRoute = new Hono();

// GET /credits — returns the org's current balance and plan
creditsRoute.get("/", verifyPlatformJwt, loadOrgContext, async (c) => {
  const orgContext = c.get("orgContext") as OrgContext;
  const org = await orgContext.db.getOrgWithBalance(orgContext.org.id);
  if (!org) return c.json({ error: "Org not found." }, 404);

  const monthly = Number(org.credits ?? 0);
  const topup = Number(org.topup_credits ?? 0);
  const plan = org.plan ?? "free";
  const planLimit = PLAN_LIMITS[plan] ?? PLAN_LIMITS.free!;

  return c.json({
    balance: monthly + topup,
    monthly,
    topup,
    plan,
    planCredits: planLimit.credits,
  });
});

// GET /credits/transactions — returns the last 50 credit transactions for the org
creditsRoute.get("/transactions", verifyPlatformJwt, loadOrgContext, async (c) => {
  const orgContext = c.get("orgContext") as OrgContext;
  const limitParam = c.req.query("limit");
  const limit = limitParam ? Math.min(200, Math.max(1, parseInt(limitParam, 10))) : 50;
  const transactions = await orgContext.db.listCreditTransactions(orgContext.org.id, limit);
  return c.json({ transactions });
});

export default creditsRoute;
