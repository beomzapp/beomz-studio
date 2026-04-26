import { Hono, type MiddlewareHandler } from "hono";

import { ensureReferralCodeForUser, REFERRAL_SIGNUP_CAP } from "../lib/referrals.js";
import { loadOrgContext } from "../middleware/loadOrgContext.js";
import { verifyPlatformJwt } from "../middleware/verifyPlatformJwt.js";
import type { OrgContext } from "../types.js";

interface ReferralsRouteDeps {
  authMiddleware?: MiddlewareHandler;
  loadOrgContextMiddleware?: MiddlewareHandler;
}

function readEventType(event: Record<string, unknown>): string | null {
  if (typeof event.event === "string" && event.event.length > 0) {
    return event.event;
  }

  if (typeof event.event_type === "string" && event.event_type.length > 0) {
    return event.event_type;
  }

  return null;
}

function buildReferralStats(events: Array<Record<string, unknown>>) {
  let signups = 0;
  let signupCredits = 0;
  let upgrades = 0;
  let upgradeCredits = 0;
  let totalCredits = 0;

  for (const event of events) {
    const eventType = readEventType(event);
    const credits = Number(event.credits_awarded ?? 0);

    if (eventType === "signup" && credits > 0) {
      signups += 1;
      signupCredits += credits;
    }

    if (eventType === "upgrade") {
      upgrades += 1;
      upgradeCredits += credits;
    }

    totalCredits += credits;
  }

  return {
    signupCapReached: signups >= REFERRAL_SIGNUP_CAP,
    signupCredits,
    signups,
    totalCredits,
    upgradeCredits,
    upgrades,
  };
}

export function createReferralsRoute(deps: ReferralsRouteDeps = {}) {
  const referralsRoute = new Hono();
  const authMiddleware = deps.authMiddleware ?? verifyPlatformJwt;
  const loadOrgContextMiddleware = deps.loadOrgContextMiddleware ?? loadOrgContext;

  referralsRoute.get("/", authMiddleware, loadOrgContextMiddleware, async (c) => {
    try {
      const orgContext = c.get("orgContext") as OrgContext;
      const referralCode = await ensureReferralCodeForUser(orgContext.db, orgContext.user.id);
      const referralLink = `https://beomz.ai/signup?ref=${referralCode.code}`;
      console.log("[referrals] code for user:", referralCode.code);
      const events = await orgContext.db.listReferralEventsByReferrerId(referralCode.user_id);
      const stats = buildReferralStats(events as Array<Record<string, unknown>>);

      return c.json({
        code: referralCode.code,
        credits_earned: stats.totalCredits,
        link: referralLink,
        referral_code: referralCode.code,
        referral_link: referralLink,
        signup_count: stats.signups,
        stats,
        upgrade_count: stats.upgrades,
      });
    } catch (error) {
      console.error("[GET /referrals] error:", error);
      return c.json({ error: "Failed to load referrals." }, 500);
    }
  });

  return referralsRoute;
}

const referralsRoute = createReferralsRoute();

export default referralsRoute;
