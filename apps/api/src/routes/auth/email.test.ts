import assert from "node:assert/strict";
import test from "node:test";

import { Hono } from "hono";

process.env.ANTHROPIC_API_KEY ??= "test-anthropic-key";
process.env.STUDIO_SUPABASE_URL ??= "https://example.supabase.co";
process.env.STUDIO_SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const { createEmailAuthRoute } = await import("./email.js");

type StoredUser = {
  avatar_url: string | null;
  created_at: string;
  email: string;
  email_verified?: boolean;
  email_verify_expires?: string | null;
  email_verify_token?: string | null;
  full_name: string | null;
  id: string;
  last_credits_low_email?: string | null;
  password_hash?: string | null;
  password_reset_expires?: string | null;
  password_reset_token?: string | null;
  platform_user_id: string;
  referred_by: string | null;
};

type StoredOrg = {
  created_at: string;
  credits: number;
  credits_period_end: string | null;
  credits_period_start: string | null;
  daily_reset_at: string | null;
  downgrade_at_period_end: boolean;
  id: string;
  monthly_credits: number;
  name: string;
  owner_id: string;
  pending_plan: string | null;
  plan: string;
  rollover_cap: number;
  rollover_credits: number;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  topup_credits: number;
};

type StoredMembership = {
  created_at: string;
  org_id: string;
  role: string;
  user_id: string;
};

function createTestDb() {
  let userSeq = 1;
  let orgSeq = 1;
  const users = new Map<string, StoredUser>();
  const orgs = new Map<string, StoredOrg>();
  const memberships = new Map<string, StoredMembership>();

  function toPublicUser(user: StoredUser) {
    return {
      avatar_url: user.avatar_url,
      created_at: user.created_at,
      email: user.email,
      email_verified: user.email_verified,
      full_name: user.full_name,
      id: user.id,
      last_credits_low_email: user.last_credits_low_email ?? null,
      platform_user_id: user.platform_user_id,
      referred_by: user.referred_by,
    };
  }

  return {
    db: {
      async createOrg(input: { credits?: number; name: string; owner_id: string }) {
        const org: StoredOrg = {
          created_at: new Date().toISOString(),
          credits: input.credits ?? 0,
          credits_period_end: null,
          credits_period_start: null,
          daily_reset_at: null,
          downgrade_at_period_end: false,
          id: `org-${orgSeq++}`,
          monthly_credits: 0,
          name: input.name,
          owner_id: input.owner_id,
          pending_plan: null,
          plan: "free",
          rollover_cap: 0,
          rollover_credits: 0,
          stripe_customer_id: null,
          stripe_subscription_id: null,
          topup_credits: 0,
        };
        orgs.set(org.id, org);
        return org;
      },
      async createOrgMembership(input: { org_id: string; role: string; user_id: string }) {
        const membership: StoredMembership = {
          created_at: new Date().toISOString(),
          org_id: input.org_id,
          role: input.role,
          user_id: input.user_id,
        };
        memberships.set(input.user_id, membership);
        return membership;
      },
      async createUser(input: Record<string, unknown>) {
        const user: StoredUser = {
          avatar_url: null,
          created_at: new Date().toISOString(),
          email: String(input.email),
          email_verified: input.email_verified as boolean | undefined,
          email_verify_expires: input.email_verify_expires as string | null | undefined,
          email_verify_token: input.email_verify_token as string | null | undefined,
          full_name: null,
          id: String(input.id ?? `user-${userSeq}`),
          last_credits_low_email: null,
          password_hash: input.password_hash as string | null | undefined,
          password_reset_expires: input.password_reset_expires as string | null | undefined,
          password_reset_token: input.password_reset_token as string | null | undefined,
          platform_user_id: String(input.platform_user_id ?? `platform-${userSeq++}`),
          referred_by: null,
        };
        userSeq += 1;
        users.set(user.id, user);
        return toPublicUser(user);
      },
      async findEmailAuthUserByEmail(email: string) {
        return Array.from(users.values()).find((user) => user.email === email) ?? null;
      },
      async findEmailAuthUserByResetToken(token: string) {
        return Array.from(users.values()).find((user) => user.password_reset_token === token) ?? null;
      },
      async findEmailAuthUserByVerifyToken(token: string) {
        return Array.from(users.values()).find((user) => user.email_verify_token === token) ?? null;
      },
      async findMembershipByUserId(userId: string) {
        return memberships.get(userId) ?? null;
      },
      async findOrgById(orgId: string) {
        return orgs.get(orgId) ?? null;
      },
      async findPrimaryOrgByUserId(userId: string) {
        return Array.from(orgs.values()).find((org) => org.owner_id === userId) ?? null;
      },
      async updateUser(userId: string, patch: Record<string, unknown>) {
        const current = users.get(userId);
        if (!current) {
          throw new Error(`Unknown user ${userId}`);
        }
        const next = { ...current, ...patch };
        users.set(userId, next);
        return toPublicUser(next);
      },
    },
    getUserByEmail(email: string) {
      return Array.from(users.values()).find((user) => user.email === email) ?? null;
    },
  };
}

function createTestApp(deps: Parameters<typeof createEmailAuthRoute>[0]) {
  const app = new Hono();
  app.route("/auth/email", createEmailAuthRoute(deps));
  return app;
}

test("email signup -> verify -> login returns the same auth response shape as platform auth", async () => {
  const sentVerificationEmails: Array<{ email: string; verifyUrl: string }> = [];
  const sentWelcomeEmails: Array<{ email: string }> = [];
  const { db, getUserByEmail } = createTestDb();
  const app = createTestApp({
    comparePassword: async (password, hash) => hash === `hash:${password}`,
    createStudioDbClient: () => db,
    hashPassword: async (password) => `hash:${password}`,
    sendVerificationEmail: async ({ email, verifyUrl }) => {
      sentVerificationEmails.push({ email, verifyUrl });
    },
    sendWelcomeEmail: async ({ email }) => {
      sentWelcomeEmails.push({ email });
    },
  });

  const signupResponse = await app.request("http://localhost/auth/email/signup", {
    body: JSON.stringify({
      email: "founder@example.com",
      password: "password123",
    }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });

  assert.equal(signupResponse.status, 201);
  assert.deepEqual(await signupResponse.json(), {
    message: "Check your email to verify your account",
  });
  assert.equal(sentVerificationEmails.length, 1);
  assert.equal(sentVerificationEmails[0]?.email, "founder@example.com");
  assert.match(sentVerificationEmails[0]?.verifyUrl ?? "", /verify-email\?token=/);

  const createdUser = getUserByEmail("founder@example.com");
  assert.equal(createdUser?.email_verified, false);
  assert.equal(createdUser?.password_hash, "hash:password123");

  const verifyToken = new URL(sentVerificationEmails[0]!.verifyUrl).searchParams.get("token");
  assert.ok(verifyToken);

  const verifyResponse = await app.request("http://localhost/auth/email/verify", {
    body: JSON.stringify({ token: verifyToken }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });

  assert.equal(verifyResponse.status, 200);
  const verifyBody = await verifyResponse.json() as Record<string, any>;
  assert.equal(verifyBody.user.email, "founder@example.com");
  assert.equal(verifyBody.org.credits, 100);
  assert.equal(verifyBody.membership.role, "owner");
  assert.equal(typeof verifyBody.session.accessToken, "string");
  assert.equal(sentWelcomeEmails.length, 1);

  const verifiedUser = getUserByEmail("founder@example.com");
  assert.equal(verifiedUser?.email_verified, true);
  assert.equal(verifiedUser?.email_verify_token, null);

  const loginResponse = await app.request("http://localhost/auth/email/login", {
    body: JSON.stringify({
      email: "founder@example.com",
      password: "password123",
    }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });

  assert.equal(loginResponse.status, 200);
  const loginBody = await loginResponse.json() as Record<string, any>;
  assert.equal(loginBody.user.email, "founder@example.com");
  assert.equal(loginBody.membership.role, "owner");
  assert.equal(typeof loginBody.session.accessToken, "string");
});

test("forgot password, reset password, and resend verification update the stored tokens", async () => {
  const resetEmails: Array<{ email: string; resetUrl: string }> = [];
  const verifyEmails: Array<{ email: string; verifyUrl: string }> = [];
  const { db, getUserByEmail } = createTestDb();

  await db.createUser({
    email: "pending@example.com",
    email_verified: false,
    id: "user-pending",
    password_hash: "hash:password123",
    platform_user_id: "platform-pending",
  });

  const app = createTestApp({
    comparePassword: async (password, hash) => hash === `hash:${password}`,
    createStudioDbClient: () => db,
    hashPassword: async (password) => `hash:${password}`,
    sendResetPasswordEmail: async ({ email, resetUrl }) => {
      resetEmails.push({ email, resetUrl });
    },
    sendVerificationEmail: async ({ email, verifyUrl }) => {
      verifyEmails.push({ email, verifyUrl });
    },
  });

  const resendResponse = await app.request("http://localhost/auth/email/resend-verification", {
    body: JSON.stringify({ email: "pending@example.com" }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });

  assert.equal(resendResponse.status, 200);
  assert.deepEqual(await resendResponse.json(), {
    message: "Verification email resent",
  });
  assert.equal(verifyEmails.length, 1);

  const forgotPasswordResponse = await app.request("http://localhost/auth/email/forgot-password", {
    body: JSON.stringify({ email: "pending@example.com" }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });

  assert.equal(forgotPasswordResponse.status, 200);
  assert.deepEqual(await forgotPasswordResponse.json(), {
    message: "If that email exists, a reset link has been sent",
  });
  assert.equal(resetEmails.length, 1);

  const resetToken = new URL(resetEmails[0]!.resetUrl).searchParams.get("token");
  assert.ok(resetToken);

  const resetResponse = await app.request("http://localhost/auth/email/reset-password", {
    body: JSON.stringify({
      password: "new-password123",
      token: resetToken,
    }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });

  assert.equal(resetResponse.status, 200);
  assert.deepEqual(await resetResponse.json(), {
    message: "Password updated",
  });

  const updatedUser = getUserByEmail("pending@example.com");
  assert.equal(updatedUser?.password_hash, "hash:new-password123");
  assert.equal(updatedUser?.password_reset_token, null);
});
