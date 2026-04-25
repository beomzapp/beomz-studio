import assert from "node:assert/strict";
import test from "node:test";

import { Hono } from "hono";

import type { OrgMembershipRow, OrgRow, UserRow } from "@beomz-studio/studio-db";

process.env.ANTHROPIC_API_KEY ??= "test-anthropic-key";
process.env.STUDIO_SUPABASE_URL ??= "https://example.supabase.co";
process.env.STUDIO_SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const { createLoadOrgContext } = await import("./loadOrgContext.js");
const { PLAN_LIMITS } = await import("../lib/credits.js");

const now = new Date().toISOString();

function buildUser(overrides: Partial<UserRow> = {}): UserRow {
  return {
    id: "user-1",
    email: "omar@example.com",
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
    findAuthUserById: (authUserId: string) => Promise<{ id: string } | null>;
    findMembershipByUserId: (userId: string) => Promise<OrgMembershipRow | null>;
    findUserByEmail: (email: string) => Promise<UserRow | null>;
    upsertUserByEmail: (input: { email: string; platformUserId: string }) => Promise<UserRow | null>;
  };
  db: {
    createOrg: (input: { credits: number; name: string; owner_id: string }) => Promise<OrgRow>;
    findOrgById: (id: string) => Promise<OrgRow | null>;
    findUserByPlatformUserId: (platformUserId: string) => Promise<UserRow | null>;
    updateUserEmail: (id: string, email: string) => Promise<UserRow>;
  };
  jwt: {
    email?: string;
    sub: string;
  };
}) {
  const app = new Hono();

  app.use("*", async (c, next) => {
    c.set("platformJwt", options.jwt);
    await next();
  });

  app.use("*", createLoadOrgContext({
    createAuthBootstrapStore: () => options.authStore,
    createDbClient: () => options.db as never,
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
          return { id: authUserId };
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
            email: "first@example.com",
            platformUserId: "google-user-3",
          });
          return user;
        },
      },
      db: {
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
