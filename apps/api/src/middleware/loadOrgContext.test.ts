import assert from "node:assert/strict";
import test from "node:test";

import { Hono } from "hono";

import type {
  OrgMembershipRow,
  OrgRow,
  ReferralCodeRow,
  ReferralEventRow,
  UserRow,
} from "@beomz-studio/studio-db";

process.env.ANTHROPIC_API_KEY ??= "test-anthropic-key";
process.env.STUDIO_SUPABASE_URL ??= "https://example.supabase.co";
process.env.STUDIO_SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const { createLoadOrgContext } = await import("./loadOrgContext.js");
const { PLAN_LIMITS } = await import("../lib/credits.js");

const now = new Date().toISOString();

function buildUser(overrides: Partial<UserRow> = {}): UserRow {
  return {
    avatar_url: null,
    id: "user-1",
    email: "omar@example.com",
    full_name: null,
    platform_user_id: "platform-user-1",
    created_at: now,
    ...overrides,
  };
}

function buildMembership(overrides: Partial<OrgMembershipRow> = {}): OrgMembershipRow {
  return {
    org_id: "org-1",
    user_id: "user-1",
    role: "owner",
    created_at: now,
    ...overrides,
  };
}

function buildOrg(overrides: Partial<OrgRow> = {}): OrgRow {
  return {
    id: "org-1",
    owner_id: "user-1",
    name: "omar's Studio",
    plan: "free",
    credits: 50,
    topup_credits: 0,
    monthly_credits: 0,
    rollover_credits: 0,
    rollover_cap: 0,
    credits_period_start: null,
    credits_period_end: null,
    downgrade_at_period_end: false,
    pending_plan: null,
    stripe_customer_id: null,
    stripe_subscription_id: null,
    daily_reset_at: null,
    created_at: now,
    ...overrides,
  };
}

function createApp(options: {
  authStore: {
    ensureOrgMembership: (input: { org_id: string; role: string; user_id: string }) => Promise<void>;
    findAuthUserById: (authUserId: string) => Promise<{
      app_metadata?: Record<string, unknown> | null;
      id: string;
      user_metadata?: Record<string, unknown> | null;
    } | null>;
    findMembershipByUserId: (userId: string) => Promise<OrgMembershipRow | null>;
    findUserByEmail: (email: string) => Promise<UserRow | null>;
    upsertUserByEmail: (input: {
      avatarUrl?: string | null;
      email: string;
      fullName?: string | null;
      platformUserId: string;
    }) => Promise<UserRow | null>;
  };
  db: {
    countReferralEventsByReferrerId?: (referrerId: string, event: "signup" | "upgrade") => Promise<number>;
    createReferralEvent?: (input: {
      credits_awarded: number;
      event: "signup" | "upgrade";
      referred_id: string;
      referrer_id: string;
      signup_ip?: string | null;
    }) => Promise<ReferralEventRow>;
    createReferralCode?: (input: { code: string; user_id: string }) => Promise<ReferralCodeRow | null>;
    createOrg: (input: { credits: number; name: string; owner_id: string }) => Promise<OrgRow>;
    findPrimaryOrgByUserId?: (userId: string) => Promise<OrgRow | null>;
    findOrgById: (id: string) => Promise<OrgRow | null>;
    findReferralCodeByCode?: (code: string) => Promise<ReferralCodeRow | null>;
    findReferralCodeByUserId?: (userId: string) => Promise<ReferralCodeRow | null>;
    findUserById?: (userId: string) => Promise<UserRow | null>;
    findUserByPlatformUserId: (platformUserId: string) => Promise<UserRow | null>;
    getOrgWithBalance?: (orgId: string) => Promise<OrgRow | null>;
    hasReferralEvent?: (referrerId: string, referredId: string, event: "signup" | "upgrade") => Promise<boolean>;
    listReferralEventsByReferrerId?: (referrerId: string) => Promise<ReferralEventRow[]>;
    updateOrg?: (orgId: string, patch: { credits?: number }) => Promise<OrgRow>;
    updateUser?: (userId: string, patch: { referred_by?: string | null }) => Promise<UserRow>;
    updateUserEmail: (id: string, email: string) => Promise<UserRow>;
  };
  jwt: {
    email?: string;
    sub: string;
  };
  queueLoginEvent?: (input: { accessToken: string; ip: string; userId: string }) => void;
}) {
  const app = new Hono();

  app.use("*", async (c, next) => {
    c.set("platformJwt", options.jwt);
    await next();
  });

  app.use("*", createLoadOrgContext({
    createAuthBootstrapStore: () => options.authStore,
    createDbClient: () => options.db as never,
    queueLoginEvent: options.queueLoginEvent,
  }));

  app.get("/", (c) => {
    const orgContext = c.get("orgContext");
    return c.json({
      membership: orgContext.membership,
      org: orgContext.org,
      user: orgContext.user,
    });
  });

  return app;
}

test("reuses the existing org when Google OAuth resolves an existing email", async () => {
  const user = buildUser({ platform_user_id: "legacy-platform-user" });
  const membership = buildMembership();
  const org = buildOrg();
  const createOrgCalls: unknown[] = [];
  const consoleCalls: unknown[] = [];
  const originalConsoleLog = console.log;
  console.log = (...args: unknown[]) => {
    consoleCalls.push(args);
  };

  try {
    const app = createApp({
      authStore: {
        ensureOrgMembership: async () => {
          throw new Error("membership should not be created");
        },
        findAuthUserById: async (authUserId) => {
          assert.equal(authUserId, "google-user-2");
          return { id: authUserId };
        },
        findMembershipByUserId: async () => membership,
        findUserByEmail: async (email) => {
          assert.equal(email, "omar@example.com");
          return user;
        },
        upsertUserByEmail: async (input) => {
          assert.deepEqual(input, {
            email: "omar@example.com",
            platformUserId: "google-user-2",
          });
          return user;
        },
      },
      db: {
        createOrg: async (input) => {
          createOrgCalls.push(input);
          return org;
        },
        findOrgById: async (id) => {
          assert.equal(id, "org-1");
          return org;
        },
        findUserByPlatformUserId: async (platformUserId) => {
          assert.equal(platformUserId, "google-user-2");
          return null;
        },
        updateUserEmail: async () => {
          throw new Error("email should not be updated");
        },
      },
      jwt: {
        email: "omar@example.com",
        sub: "google-user-2",
      },
    });

    const response = await app.request("http://localhost/");

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      membership,
      org,
      user,
    });
    assert.equal(createOrgCalls.length, 0);
    assert.deepEqual(consoleCalls, [[
      "[auth] user resolved:",
      {
        email: "omar@example.com",
        isNew: false,
        userId: "user-1",
      },
    ]]);
  } finally {
    console.log = originalConsoleLog;
  }
});

test("creates the first org only for a genuine first signup", async () => {
  const user = buildUser({ id: "user-2", email: "first@example.com", platform_user_id: "google-user-3" });
  const org = buildOrg({ id: "org-2", name: "first's Studio", owner_id: "user-2" });
  const membership = buildMembership({ org_id: "org-2", user_id: "user-2" });
  const membershipLookups: string[] = [];
  const membershipCreates: unknown[] = [];
  const consoleCalls: unknown[] = [];
  const originalConsoleLog = console.log;
  console.log = (...args: unknown[]) => {
    consoleCalls.push(args);
  };

  try {
    const app = createApp({
      authStore: {
        ensureOrgMembership: async (input) => {
          membershipCreates.push(input);
        },
        findAuthUserById: async (authUserId) => {
          assert.equal(authUserId, "google-user-3");
          return {
            id: authUserId,
            user_metadata: {
              name: "First User",
              picture: "https://example.com/google-avatar.png",
            },
          };
        },
        findMembershipByUserId: async (userId) => {
          membershipLookups.push(userId);
          return membershipLookups.length === 1 ? null : membership;
        },
        findUserByEmail: async (email) => {
          assert.equal(email, "first@example.com");
          return null;
        },
        upsertUserByEmail: async (input) => {
          assert.deepEqual(input, {
            avatarUrl: "https://example.com/google-avatar.png",
            email: "first@example.com",
            fullName: "First User",
            platformUserId: "google-user-3",
          });
          return user;
        },
      },
      db: {
        createReferralCode: async ({ code, user_id }) => ({
          code,
          created_at: now,
          id: "ref-code-1",
          user_id,
        }),
        createOrg: async (input) => {
          assert.deepEqual(input, {
            credits: PLAN_LIMITS.free.signupGrant,
            name: "first's Studio",
            owner_id: "user-2",
          });
          return org;
        },
        findOrgById: async (id) => {
          assert.equal(id, "org-2");
          return org;
        },
        findReferralCodeByUserId: async (userId) => {
          assert.equal(userId, "user-2");
          return null;
        },
        findUserByPlatformUserId: async (platformUserId) => {
          assert.equal(platformUserId, "google-user-3");
          return null;
        },
        updateUserEmail: async () => {
          throw new Error("email should not be updated");
        },
      },
      jwt: {
        email: "first@example.com",
        sub: "google-user-3",
      },
    });

    const response = await app.request("http://localhost/");

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      membership,
      org,
      user,
    });
    assert.deepEqual(membershipCreates, [{
      org_id: "org-2",
      role: "owner",
      user_id: "user-2",
    }]);
    assert.deepEqual(consoleCalls, [[
      "[auth] user resolved:",
      {
        email: "first@example.com",
        isNew: true,
        userId: "user-2",
      },
    ]]);
  } finally {
    console.log = originalConsoleLog;
  }
});

test("applies signup referral rewards from the request query on a true first signup", async () => {
  const user = buildUser({ id: "user-3", email: "refd@example.com", platform_user_id: "google-user-4" });
  const membership = buildMembership({ org_id: "org-3", user_id: "user-3" });
  const createdOrg = buildOrg({ credits: 100, id: "org-3", name: "refd's Studio", owner_id: "user-3" });
  const referrerOrg = buildOrg({ credits: 260, id: "referrer-org", owner_id: "referrer-1" });
  const membershipLookups: string[] = [];
  const orgUpdates: Array<{ credits: number; orgId: string }> = [];
  const referralEvents: ReferralEventRow[] = [];

  const app = createApp({
    authStore: {
      ensureOrgMembership: async () => undefined,
      findAuthUserById: async (authUserId) => {
        assert.equal(authUserId, "google-user-4");
        return { id: authUserId };
      },
      findMembershipByUserId: async (userId) => {
        membershipLookups.push(userId);
        return membershipLookups.length === 1 ? null : membership;
      },
      findUserByEmail: async (email) => {
        assert.equal(email, "refd@example.com");
        return null;
      },
      upsertUserByEmail: async (input) => {
        assert.deepEqual(input, {
          email: "refd@example.com",
          platformUserId: "google-user-4",
        });
        return user;
      },
    },
    db: {
      createReferralCode: async ({ code, user_id }) => ({
        code,
        created_at: now,
        id: "ref-code-2",
        user_id,
      }),
      createReferralEvent: async (input) => {
        assert.equal("is_vpn" in input, false);
        const event: ReferralEventRow = {
          created_at: now,
          credits_awarded: input.credits_awarded,
          event: input.event,
          id: "event-1",
          is_vpn: false,
          referred_id: input.referred_id,
          referrer_id: input.referrer_id,
          signup_ip: input.signup_ip ?? null,
        };
        referralEvents.push(event);
        return event;
      },
      createOrg: async (input) => {
        assert.deepEqual(input, {
          credits: PLAN_LIMITS.free.signupGrant,
          name: "refd's Studio",
          owner_id: "user-3",
        });
        return createdOrg;
      },
      findOrgById: async (id) => {
        assert.equal(id, "org-3");
        return createdOrg;
      },
      findPrimaryOrgByUserId: async (userId) => {
        assert.equal(userId, "referrer-1");
        return buildOrg({ credits: 210, id: "referrer-org", owner_id: userId });
      },
      findReferralCodeByCode: async (code) => {
        assert.equal(code, "REFCODE1");
        return {
          code,
          created_at: now,
          id: "ref-code-existing",
          user_id: "referrer-1",
        };
      },
      findReferralCodeByUserId: async (userId) => {
        assert.equal(userId, "user-3");
        return null;
      },
      findUserById: async (userId) => {
        assert.equal(userId, "user-3");
        return buildUser({ email: "refd@example.com", id: userId, platform_user_id: "google-user-4" });
      },
      findUserByPlatformUserId: async (platformUserId) => {
        assert.equal(platformUserId, "google-user-4");
        return null;
      },
      getOrgWithBalance: async (orgId) => {
        assert.equal(orgId, "org-3");
        return createdOrg;
      },
      hasReferralEvent: async (referrerId, referredId, event) => {
        assert.equal(referrerId, "referrer-1");
        assert.equal(referredId, "user-3");
        assert.equal(event, "signup");
        return false;
      },
      listReferralEventsByReferrerId: async () => [],
      updateOrg: async (orgId, patch) => {
        orgUpdates.push({ credits: Number(patch.credits ?? 0), orgId });
        return referrerOrg;
      },
      updateUser: async (userId, patch) => {
        assert.equal(userId, "user-3");
        assert.equal(patch.referred_by, "referrer-1");
        return buildUser({
          email: "refd@example.com",
          id: userId,
          platform_user_id: "google-user-4",
          referred_by: "referrer-1",
        });
      },
      updateUserEmail: async () => {
        throw new Error("email should not be updated");
      },
    },
    jwt: {
      email: "refd@example.com",
      sub: "google-user-4",
    },
  });

  const response = await app.request("http://localhost/?ref=refcode1", {
    headers: {
      "cf-connecting-ip": "203.0.113.10",
    },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    membership,
    org: createdOrg,
    user: buildUser({
      email: "refd@example.com",
      id: "user-3",
      platform_user_id: "google-user-4",
      referred_by: "referrer-1",
    }),
  });
  assert.deepEqual(orgUpdates, [{ credits: 260, orgId: "referrer-org" }]);
  assert.deepEqual(referralEvents, [{
    created_at: now,
    credits_awarded: 50,
    event: "signup",
    id: "event-1",
    is_vpn: false,
    referred_id: "user-3",
    referrer_id: "referrer-1",
    signup_ip: "203.0.113.10",
  }]);
});

test("skips self-referral rewards silently for brand new users", async () => {
  const user = buildUser({ id: "user-9", email: "self@example.com", platform_user_id: "google-user-9" });
  const membership = buildMembership({ org_id: "org-9", user_id: "user-9" });
  const org = buildOrg({ credits: 100, id: "org-9", name: "self's Studio", owner_id: "user-9" });
  const membershipLookups: string[] = [];

  const app = createApp({
    authStore: {
      ensureOrgMembership: async () => undefined,
      findAuthUserById: async () => ({ id: "google-user-9" }),
      findMembershipByUserId: async (userId) => {
        membershipLookups.push(userId);
        return membershipLookups.length === 1 ? null : membership;
      },
      findUserByEmail: async () => null,
      upsertUserByEmail: async () => user,
    },
    db: {
      createReferralCode: async ({ code, user_id }) => ({
        code,
        created_at: now,
        id: "ref-self",
        user_id,
      }),
      createReferralEvent: async () => {
        throw new Error("self referrals should not create events");
      },
      createOrg: async () => org,
      findOrgById: async () => org,
      findReferralCodeByCode: async () => ({
        code: "SELFREF1",
        created_at: now,
        id: "ref-self-existing",
        user_id: "user-9",
      }),
      findReferralCodeByUserId: async () => null,
      findUserById: async () => user,
      findUserByPlatformUserId: async () => null,
      getOrgWithBalance: async () => org,
      hasReferralEvent: async () => false,
      listReferralEventsByReferrerId: async () => [],
      updateOrg: async () => {
        throw new Error("self referrals should not update org credits");
      },
      updateUser: async () => {
        throw new Error("self referrals should not update referred_by");
      },
      updateUserEmail: async () => {
        throw new Error("email should not be updated");
      },
    },
    jwt: {
      email: "self@example.com",
      sub: "google-user-9",
    },
  });

  const response = await app.request("http://localhost/?ref=selfref1");

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    membership,
    org,
    user,
  });
});

test("updates the stored email when the platform user already exists", async () => {
  const updatedUser = buildUser({ email: "new@example.com" });
  const membership = buildMembership();
  const org = buildOrg();
  const consoleCalls: unknown[] = [];
  const originalConsoleLog = console.log;
  console.log = (...args: unknown[]) => {
    consoleCalls.push(args);
  };

  try {
    const app = createApp({
      authStore: {
        ensureOrgMembership: async () => {
          throw new Error("membership should not be created");
        },
        findAuthUserById: async (authUserId) => {
          assert.equal(authUserId, "platform-user-1");
          return { id: authUserId };
        },
        findMembershipByUserId: async () => membership,
        findUserByEmail: async () => {
          throw new Error("email lookup should not be needed");
        },
        upsertUserByEmail: async () => {
          throw new Error("upsert should not be needed");
        },
      },
      db: {
        createOrg: async () => {
          throw new Error("org should not be created");
        },
        findOrgById: async () => org,
        findUserByPlatformUserId: async (platformUserId) => {
          assert.equal(platformUserId, "platform-user-1");
          return buildUser({ email: "old@example.com" });
        },
        updateUserEmail: async (id, email) => {
          assert.equal(id, "user-1");
          assert.equal(email, "new@example.com");
          return updatedUser;
        },
      },
      jwt: {
        email: "new@example.com",
        sub: "platform-user-1",
      },
    });

    const response = await app.request("http://localhost/");

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      membership,
      org,
      user: updatedUser,
    });
    assert.deepEqual(consoleCalls, [[
      "[auth] user resolved:",
      {
        email: "new@example.com",
        isNew: false,
        userId: "user-1",
      },
    ]]);
  } finally {
    console.log = originalConsoleLog;
  }
});

test("queues a login event asynchronously after the authenticated org context is resolved", async () => {
  const user = buildUser();
  const membership = buildMembership();
  const org = buildOrg();
  const queuedEvents: Array<{ accessToken: string; ip: string; userId: string }> = [];

  const app = createApp({
    authStore: {
      ensureOrgMembership: async () => {
        throw new Error("membership should not be created");
      },
      findAuthUserById: async () => ({ id: "platform-user-1" }),
      findMembershipByUserId: async () => membership,
      findUserByEmail: async () => {
        throw new Error("email lookup should not be needed");
      },
      upsertUserByEmail: async () => {
        throw new Error("upsert should not be needed");
      },
    },
    db: {
      createOrg: async () => {
        throw new Error("org should not be created");
      },
      findOrgById: async () => org,
      findUserByPlatformUserId: async () => user,
      updateUserEmail: async () => user,
    },
    jwt: {
      email: "omar@example.com",
      sub: "platform-user-1",
    },
    queueLoginEvent: (input) => {
      queuedEvents.push(input);
    },
  });

  const response = await app.request("http://localhost/", {
    headers: {
      authorization: "Bearer platform-token-1",
      "x-forwarded-for": "203.0.113.7, 10.0.0.1",
    },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(queuedEvents, [{
    accessToken: "platform-token-1",
    ip: "203.0.113.7",
    userId: "user-1",
  }]);
});

test("returns 401 when the Supabase auth user no longer exists", async () => {
  const app = createApp({
    authStore: {
      ensureOrgMembership: async () => {
        throw new Error("membership should not be created");
      },
      findAuthUserById: async (authUserId) => {
        assert.equal(authUserId, "deleted-auth-user");
        return null;
      },
      findMembershipByUserId: async () => {
        throw new Error("membership lookup should not run");
      },
      findUserByEmail: async () => {
        throw new Error("email lookup should not run");
      },
      upsertUserByEmail: async () => {
        throw new Error("upsert should not run");
      },
    },
    db: {
      createOrg: async () => {
        throw new Error("org should not be created");
      },
      findOrgById: async () => {
        throw new Error("org lookup should not run");
      },
      findUserByPlatformUserId: async () => {
        throw new Error("user lookup should not run");
      },
      updateUserEmail: async () => {
        throw new Error("email should not be updated");
      },
    },
    jwt: {
      email: "deleted@example.com",
      sub: "deleted-auth-user",
    },
  });

  const response = await app.request("http://localhost/");

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "User not found" });
});

test("returns 401 when user upsert resolves no platform user row", async () => {
  const app = createApp({
    authStore: {
      ensureOrgMembership: async () => {
        throw new Error("membership should not be created");
      },
      findAuthUserById: async (authUserId) => {
        assert.equal(authUserId, "google-user-4");
        return { id: authUserId };
      },
      findMembershipByUserId: async () => {
        throw new Error("membership lookup should not run");
      },
      findUserByEmail: async (email) => {
        assert.equal(email, "missing@example.com");
        return null;
      },
      upsertUserByEmail: async (input) => {
        assert.deepEqual(input, {
          email: "missing@example.com",
          platformUserId: "google-user-4",
        });
        return null;
      },
    },
    db: {
      createOrg: async () => {
        throw new Error("org should not be created");
      },
      findOrgById: async () => {
        throw new Error("org lookup should not run");
      },
      findUserByPlatformUserId: async (platformUserId) => {
        assert.equal(platformUserId, "google-user-4");
        return null;
      },
      updateUserEmail: async () => {
        throw new Error("email should not be updated");
      },
    },
    jwt: {
      email: "missing@example.com",
      sub: "google-user-4",
    },
  });

  const response = await app.request("http://localhost/");

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "User not found" });
});
