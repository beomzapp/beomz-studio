import assert from "node:assert/strict";
import test from "node:test";

import type {
  OrgRow,
  ReferralCodeRow,
  ReferralEventRow,
  UserRow,
} from "@beomz-studio/studio-db";

import {
  applySignupReferralReward,
  applyUpgradeReferralReward,
  ensureReferralCodeForUser,
  REFERRAL_SIGNUP_REWARD_CREDITS,
  REFERRAL_UPGRADE_REWARD_CREDITS,
  getReferralCodeFromRequest,
  summariseReferralStats,
} from "./referrals.js";

const now = new Date().toISOString();

function buildUser(overrides: Partial<UserRow> = {}): UserRow {
  return {
    created_at: now,
    email: "user@example.com",
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
    name: "Studio",
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

function buildReferralCode(overrides: Partial<ReferralCodeRow> = {}): ReferralCodeRow {
  return {
    code: "REFCODE1",
    created_at: now,
    id: "ref-1",
    user_id: "referrer-1",
    ...overrides,
  };
}

function buildReferralEvent(overrides: Partial<ReferralEventRow> = {}): ReferralEventRow {
  return {
    created_at: now,
    credits_awarded: 50,
    event: "signup",
    id: "event-1",
    referred_id: "user-2",
    referrer_id: "referrer-1",
    ...overrides,
  };
}

test("ensureReferralCodeForUser reuses an existing code", async () => {
  const existingCode = buildReferralCode({ code: "ABCDEFGH", user_id: "user-1" });
  const db = {
    createReferralCode: async () => {
      throw new Error("should not create a new code");
    },
    findReferralCodeByUserId: async (userId: string) => {
      assert.equal(userId, "user-1");
      return existingCode;
    },
  };

  const result = await ensureReferralCodeForUser(db as never, "user-1");
  assert.deepEqual(result, existingCode);
});

test("getReferralCodeFromRequest prefers the request query param", () => {
  const result = getReferralCodeFromRequest(
    "https://beomz.ai/api/credits?ref=refcode1",
    {
      user_metadata: { referral_code: "ignored" },
    },
  );

  assert.equal(result, "REFCODE1");
});

test("applySignupReferralReward credits both sides while under the signup cap", async () => {
  const updates: Array<{ orgId: string; credits: number }> = [];
  const eventInserts: ReferralEventRow[] = [];
  const db = {
    countReferralEventsByReferrerId: async () => 1,
    createReferralCode: async () => null,
    createReferralEvent: async (input: ReferralEventRow) => {
      const event = buildReferralEvent(input);
      eventInserts.push(event);
      return event;
    },
    findPrimaryOrgByUserId: async (userId: string) => {
      assert.equal(userId, "referrer-1");
      return buildOrg({ credits: 180, id: "referrer-org", owner_id: userId });
    },
    findReferralCodeByCode: async (code: string) => {
      assert.equal(code, "REFCODE1");
      return buildReferralCode();
    },
    findReferralCodeByUserId: async () => null,
    findUserById: async (userId: string) => buildUser({ id: userId }),
    getOrgWithBalance: async (orgId: string) => buildOrg({ credits: 100, id: orgId, owner_id: "user-2" }),
    hasReferralEvent: async () => false,
    listReferralEventsByReferrerId: async () => [],
    updateOrg: async (orgId: string, patch: { credits?: number }) => {
      updates.push({ credits: Number(patch.credits ?? 0), orgId });
      return buildOrg({ credits: Number(patch.credits ?? 0), id: orgId, owner_id: orgId === "referrer-org" ? "referrer-1" : "user-2" });
    },
    updateUser: async (userId: string, patch: { referred_by?: string | null }) => {
      assert.equal(userId, "user-2");
      assert.equal(patch.referred_by, "referrer-1");
      return buildUser({ id: userId, referred_by: patch.referred_by ?? null });
    },
  };

  const result = await applySignupReferralReward({
    db: db as never,
    referredOrgId: "referred-org",
    referredUserId: "user-2",
    referralCode: "refcode1",
  });

  assert.equal(result.referrerRewarded, true);
  assert.equal(result.referredUser?.referred_by, "referrer-1");
  assert.deepEqual(updates, [
    { credits: 100 + REFERRAL_SIGNUP_REWARD_CREDITS, orgId: "referred-org" },
    { credits: 180 + REFERRAL_SIGNUP_REWARD_CREDITS, orgId: "referrer-org" },
  ]);
  assert.equal(eventInserts.length, 1);
  assert.equal(eventInserts[0]?.event, "signup");
});

test("applyUpgradeReferralReward is idempotent and only rewards once", async () => {
  let hasExistingReward = false;
  const orgUpdates: Array<{ orgId: string; credits: number }> = [];

  const db = {
    countReferralEventsByReferrerId: async () => 0,
    createReferralCode: async () => null,
    createReferralEvent: async (input: ReferralEventRow) => {
      hasExistingReward = true;
      return buildReferralEvent({
        credits_awarded: input.credits_awarded,
        event: "upgrade",
        referred_id: input.referred_id,
        referrer_id: input.referrer_id,
      });
    },
    findPrimaryOrgByUserId: async (userId: string) => buildOrg({ credits: 200, id: "referrer-org", owner_id: userId }),
    findReferralCodeByCode: async () => null,
    findReferralCodeByUserId: async () => null,
    findUserById: async (userId: string) => buildUser({ id: userId, referred_by: "referrer-1" }),
    getOrgWithBalance: async () => buildOrg(),
    hasReferralEvent: async () => hasExistingReward,
    listReferralEventsByReferrerId: async () => [],
    updateOrg: async (orgId: string, patch: { credits?: number }) => {
      orgUpdates.push({ credits: Number(patch.credits ?? 0), orgId });
      return buildOrg({ credits: Number(patch.credits ?? 0), id: orgId, owner_id: "referrer-1" });
    },
    updateUser: async () => buildUser(),
  };

  const first = await applyUpgradeReferralReward(db as never, "user-2");
  const second = await applyUpgradeReferralReward(db as never, "user-2");

  assert.equal(first?.event, "upgrade");
  assert.equal(second, null);
  assert.deepEqual(orgUpdates, [{
    credits: 200 + REFERRAL_UPGRADE_REWARD_CREDITS,
    orgId: "referrer-org",
  }]);
});

test("summariseReferralStats splits signup and upgrade credits correctly", () => {
  const stats = summariseReferralStats([
    buildReferralEvent({ credits_awarded: 50, event: "signup" }),
    buildReferralEvent({ credits_awarded: 200, event: "upgrade", id: "event-2" }),
  ]);

  assert.deepEqual(stats, {
    signupCapReached: false,
    signupCredits: 50,
    signups: 1,
    totalCredits: 250,
    upgradeCredits: 200,
    upgrades: 1,
  });
});
