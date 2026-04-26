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

test("GET /referrals sums all reward credits and counts upgrade rows from raw referral events", async () => {
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
                credits_awarded: 50,
                event: "signup",
                id: "event-2",
                referred_id: "user-3",
                referrer_id: "user-1",
              },
              {
                created_at: now,
                credits_awarded: 50,
                event: "signup",
                id: "event-3",
                referred_id: "user-4",
                referrer_id: "user-1",
              },
              {
                created_at: now,
                credits_awarded: 200,
                event_type: "upgrade",
                id: "event-4",
                referred_id: "user-2",
                referrer_id: "user-1",
              },
              {
                created_at: now,
                credits_awarded: 200,
                event_type: "upgrade",
                id: "event-5",
                referred_id: "user-3",
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
    credits_earned: 550,
    link: "https://beomz.ai/signup?ref=REFCODE1",
    referral_code: "REFCODE1",
    referral_link: "https://beomz.ai/signup?ref=REFCODE1",
    signup_count: 3,
    stats: {
      signupCapReached: true,
      signupCredits: 150,
      signups: 3,
      totalCredits: 550,
      upgradeCredits: 400,
      upgrades: 2,
    },
    upgrade_count: 2,
  });
});

test("POST /referrals/attribution applies the existing signup referral reward flow", async () => {
  const app = new Hono();
  const orgUpdates: Array<{ credits: number; orgId: string }> = [];
  const referralEvents: Array<Record<string, unknown>> = [];

  const route = createReferralsRoute({
    authMiddleware: async (_c, next) => {
      await next();
    },
    loadOrgContextMiddleware: async (c, next) => {
      c.set("orgContext", {
        db: {
          createReferralEvent: async (input: Record<string, unknown>) => {
            referralEvents.push(input);
            return {
              created_at: now,
              credits_awarded: Number(input.credits_awarded ?? 0),
              event: "signup",
              id: "event-1",
              referred_id: String(input.referred_id),
              referrer_id: String(input.referrer_id),
              signup_ip: typeof input.signup_ip === "string" ? input.signup_ip : null,
            };
          },
          findPrimaryOrgByUserId: async (userId: string) => {
            assert.equal(userId, "referrer-1");
            return buildOrg({ credits: 180, id: "referrer-org", owner_id: userId });
          },
          findReferralCodeByCode: async (code: string) => {
            assert.equal(code, "REFCODE1");
            return {
              code,
              created_at: now,
              id: "ref-1",
              user_id: "referrer-1",
            };
          },
          findUserById: async (userId: string) => buildUser({ email: "referrer@example.com", id: userId }),
          getOrgWithBalance: async (orgId: string) => buildOrg({ credits: 100, id: orgId, owner_id: "user-2" }),
          hasReferralEvent: async () => false,
          listReferralEventsByReferrerId: async () => [],
          updateOrg: async (orgId: string, patch: { credits?: number }) => {
            orgUpdates.push({ credits: Number(patch.credits ?? 0), orgId });
            return buildOrg({ credits: Number(patch.credits ?? 0), id: orgId, owner_id: "referrer-1" });
          },
          updateUser: async (userId: string, patch: { referred_by?: string | null }) => {
            assert.equal(userId, "user-2");
            assert.equal(patch.referred_by, "referrer-1");
            return buildUser({ id: userId, referred_by: patch.referred_by ?? null });
          },
        },
        membership: {
          created_at: now,
          org_id: "org-2",
          role: "owner",
          user_id: "user-2",
        },
        org: buildOrg({ id: "org-2", owner_id: "user-2" }),
        user: buildUser({ id: "user-2" }),
      });
      await next();
    },
  });

  app.route("/referrals", route);

  const response = await app.request("http://localhost/referrals/attribution", {
    body: JSON.stringify({ referral_code: "refcode1" }),
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": "203.0.113.7, 10.0.0.1",
    },
    method: "POST",
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.deepEqual(orgUpdates, [{
    credits: 230,
    orgId: "referrer-org",
  }]);
  assert.equal(referralEvents.length, 1);
  assert.equal(referralEvents[0]?.signup_ip, "203.0.113.7");
  assert.equal(referralEvents[0]?.credits_awarded, 50);
});

test("POST /referrals/attribution returns 200 when the referral code does not exist", async () => {
  const app = new Hono();
  const route = createReferralsRoute({
    authMiddleware: async (_c, next) => {
      await next();
    },
    loadOrgContextMiddleware: async (c, next) => {
      c.set("orgContext", {
        db: {
          findReferralCodeByCode: async (code: string) => {
            assert.equal(code, "UNKNOWN");
            return null;
          },
        },
        membership: {
          created_at: now,
          org_id: "org-2",
          role: "owner",
          user_id: "user-2",
        },
        org: buildOrg({ id: "org-2", owner_id: "user-2" }),
        user: buildUser({ id: "user-2" }),
      });
      await next();
    },
  });

  app.route("/referrals", route);

  const response = await app.request("http://localhost/referrals/attribution", {
    body: JSON.stringify({ referral_code: "unknown" }),
    headers: {
      "content-type": "application/json",
    },
    method: "POST",
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
});

test("POST /referrals/attribution returns 200 when the user is already attributed", async () => {
  const app = new Hono();
  const route = createReferralsRoute({
    authMiddleware: async (_c, next) => {
      await next();
    },
    loadOrgContextMiddleware: async (c, next) => {
      c.set("orgContext", {
        db: {
          findReferralCodeByCode: async () => {
            throw new Error("existing attribution should short-circuit before lookup");
          },
        },
        membership: {
          created_at: now,
          org_id: "org-2",
          role: "owner",
          user_id: "user-2",
        },
        org: buildOrg({ id: "org-2", owner_id: "user-2" }),
        user: buildUser({ id: "user-2", referred_by: "referrer-1" }),
      });
      await next();
    },
  });

  app.route("/referrals", route);

  const response = await app.request("http://localhost/referrals/attribution", {
    body: JSON.stringify({ referral_code: "refcode1" }),
    headers: {
      "content-type": "application/json",
    },
    method: "POST",
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
});
