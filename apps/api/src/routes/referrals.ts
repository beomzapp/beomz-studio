import { Hono } from "hono";

import { ensureReferralCodeForUser, summariseReferralStats } from "../lib/referrals.js";
import { loadOrgContext } from "../middleware/loadOrgContext.js";
import { verifyPlatformJwt } from "../middleware/verifyPlatformJwt.js";
import type { OrgContext } from "../types.js";

const referralsRoute = new Hono();

referralsRoute.get("/", verifyPlatformJwt, loadOrgContext, async (c) => {
  try {
    const orgContext = c.get("orgContext") as OrgContext;
    const referralCode = await ensureReferralCodeForUser(orgContext.db, orgContext.user.id);
    const events = await orgContext.db.listReferralEventsByReferrerId(orgContext.user.id);
    const stats = summariseReferralStats(events);

    return c.json({
      code: referralCode.code,
      link: `https://beomz.ai/signup?ref=${referralCode.code}`,
      referral_code: referralCode.code,
      stats,
    });
  } catch (error) {
    console.error("[GET /referrals] error:", error);
    return c.json({ error: "Failed to load referrals." }, 500);
  }
});

export default referralsRoute;
