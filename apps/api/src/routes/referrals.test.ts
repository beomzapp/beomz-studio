import assert from "node:assert/strict";
import test from "node:test";

process.env.ANTHROPIC_API_KEY ??= "test-anthropic-key";
process.env.STUDIO_SUPABASE_URL ??= "https://example.supabase.co";
process.env.STUDIO_SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

import { Hono } from "hono";

import type { OrgRow, UserRow } from "@beomz-studio/studio-db";

const { createReferralsRoute } = await import("./referrals.js");

const now = new Date().toISOString();

function buildUser(overrides: Partial<UserRow> = {}): UserRow {
  return {
    avatar_url: null,
    created_at: now,
    email: "referrer@example.com",
    full_name: null,
    id: "user-1",
    platform_user_id: "platform-user-1",
    referred_by: null,
    ...overrides,
  };
}

function buildOrg(overrides: Partial<OrgRow> = {}): OrgRow {
  return {
    created_at: now,
    credits: 100,
    credits_period_end: null,
    credits_period_start: null,
    daily_reset_at: null,
    downgrade_at_period_end: false,
    id: "org-1",
    monthly_credits: 0,
    name: "Referrer Studio",
    owner_id: "user-1",
    pending_plan: null,
    plan: "free",
    rollover_cap: 0,
    rollover_credits: 0,
    stripe_customer_id: null,
    stripe_subscription_id: null,
    topup_credits: 0,
    ...overrides,
  };
}

test("GET /referrals returns the flat stats shape expected by the frontend", async () => {
  const app = new Hono();
  const route = createReferralsRoute({
    authMiddleware: async (_c, next) => {
      await next();
    },
    loadOrgContextMiddleware: async (c, next) => {
      c.set("orgContext", {
        db: {
          createReferralCode: async () => null,
          findReferralCodeByUserId: async () => ({
            code: "REFCODE1",
            created_at: now,
            id: "ref-1",
            user_id: "user-1",
          }),
          listReferralEventsByReferrerId: async (referrerId: string) => {
            assert.equal(referrerId, "user-1");
            return [
              {
                created_at: now,
                credits_awarded: 50,
                event: "signup",
                id: "event-1",
                referred_id: "user-2",
                referrer_id: "user-1",
              },
              {
                created_at: now,
                credits_awarded: 200,
                event: "upgrade",
                id: "event-2",
                referred_id: "user-2",
                referrer_id: "user-1",
              },
            ];
          },
        },
        membership: {
          created_at: now,
          org_id: "org-1",
          role: "owner",
          user_id: "user-1",
        },
        org: buildOrg(),
        user: buildUser(),
      });
      await next();
    },
  });

  app.route("/referrals", route);

  const response = await app.request("http://localhost/referrals");

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    code: "REFCODE1",
    credits_earned: 250,
    link: "https://beomz.ai/signup?ref=REFCODE1",
    referral_code: "REFCODE1",
    referral_link: "https://beomz.ai/signup?ref=REFCODE1",
    signup_count: 1,
    stats: {
      signupCapReached: false,
      signupCredits: 50,
      signups: 1,
      totalCredits: 250,
      upgradeCredits: 200,
      upgrades: 1,
    },
    upgrade_count: 1,
  });
});
