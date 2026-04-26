import { randomBytes, randomUUID } from "node:crypto";

import bcrypt from "bcryptjs";
import {
  createStudioDbClient,
  type EmailAuthUserRow,
  type OrgMembershipRow,
  type OrgRow,
  type StudioDbClient,
  type UserRow,
} from "@beomz-studio/studio-db";
import { Hono } from "hono";
import { z } from "zod";

import { PLAN_LIMITS } from "../../lib/credits.js";
import { buildPlatformAuthResponse, signLocalPlatformJwt } from "../../lib/auth/platformJwt.js";
import {
  sendResetPasswordEmail,
  sendVerificationEmail,
  sendWelcomeEmail,
} from "../../lib/email/service.js";

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const verifySchema = z.object({
  token: z.string().min(1),
});

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  password: z.string().min(8),
  token: z.string().min(1),
});

const resendVerificationSchema = z.object({
  email: z.string().email(),
});

type EmailAuthDb = Pick<
  StudioDbClient,
  | "createOrg"
  | "createOrgMembership"
  | "createUser"
  | "findEmailAuthUserByEmail"
  | "findEmailAuthUserByResetToken"
  | "findEmailAuthUserByVerifyToken"
  | "findMembershipByUserId"
  | "findOrgById"
  | "findPrimaryOrgByUserId"
  | "updateUser"
>;

interface EmailAuthRouteDeps {
  createStudioDbClient?: () => EmailAuthDb;
  comparePassword?: typeof bcrypt.compare;
  hashPassword?: typeof bcrypt.hash;
  now?: () => Date;
  randomBytes?: typeof randomBytes;
  sendResetPasswordEmail?: typeof sendResetPasswordEmail;
  sendVerificationEmail?: typeof sendVerificationEmail;
  sendWelcomeEmail?: typeof sendWelcomeEmail;
  signLocalPlatformJwt?: typeof signLocalPlatformJwt;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function buildDefaultOrgName(user: Pick<UserRow, "email" | "full_name" | "platform_user_id">): string {
  const fullName = user.full_name?.trim();
  if (fullName) {
    return `${fullName}'s Studio`;
  }

  const [localPart] = user.email.split("@");
  if (localPart?.trim()) {
    return `${localPart.trim()}'s Studio`;
  }

  return `Studio ${user.platform_user_id.slice(0, 8)}`;
}

function toPublicUser(user: EmailAuthUserRow): UserRow {
  return {
    avatar_url: user.avatar_url ?? null,
    created_at: user.created_at,
    email: user.email,
    email_verified: user.email_verified,
    full_name: user.full_name ?? null,
    id: user.id,
    last_credits_low_email: user.last_credits_low_email ?? null,
    platform_user_id: user.platform_user_id,
    referred_by: user.referred_by ?? null,
  };
}

function isExpired(value: string | null | undefined, now: Date): boolean {
  if (!value) {
    return true;
  }

  const expiresAt = Date.parse(value);
  return !Number.isFinite(expiresAt) || expiresAt <= now.getTime();
}

async function ensureUserOrgContext(
  db: EmailAuthDb,
  user: UserRow,
  signupGrant: number,
): Promise<{ membership: OrgMembershipRow; org: OrgRow }> {
  let membership = await db.findMembershipByUserId(user.id);
  let org = membership ? await db.findOrgById(membership.org_id) : null;

  if (!membership || !org) {
    const existingPrimaryOrg = await db.findPrimaryOrgByUserId(user.id);
    if (existingPrimaryOrg) {
      org = existingPrimaryOrg;
      membership = await db.createOrgMembership({
        org_id: existingPrimaryOrg.id,
        role: "owner",
        user_id: user.id,
      });
    } else {
      org = await db.createOrg({
        credits: signupGrant,
        name: buildDefaultOrgName(user),
        owner_id: user.id,
      });
      membership = await db.createOrgMembership({
        org_id: org.id,
        role: "owner",
        user_id: user.id,
      });
    }
  }

  return {
    membership,
    org,
  };
}

export function createEmailAuthRoute(deps: EmailAuthRouteDeps = {}) {
  const emailAuthRoute = new Hono();
  const createStudioDbClientFn = deps.createStudioDbClient ?? createStudioDbClient;
  const comparePasswordFn = deps.comparePassword ?? bcrypt.compare;
  const hashPasswordFn = deps.hashPassword ?? bcrypt.hash;
  const nowFn = deps.now ?? (() => new Date());
  const randomBytesFn = deps.randomBytes ?? randomBytes;
  const sendResetPasswordEmailFn = deps.sendResetPasswordEmail ?? sendResetPasswordEmail;
  const sendVerificationEmailFn = deps.sendVerificationEmail ?? sendVerificationEmail;
  const sendWelcomeEmailFn = deps.sendWelcomeEmail ?? sendWelcomeEmail;
  const signLocalPlatformJwtFn = deps.signLocalPlatformJwt ?? signLocalPlatformJwt;

  emailAuthRoute.post("/signup", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = signupSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "Invalid signup payload" }, 400);
    }

    const db = createStudioDbClientFn();
    const email = normalizeEmail(parsed.data.email);
    const existingUser = await db.findEmailAuthUserByEmail(email);
    if (existingUser) {
      return c.json({ error: "Email is already registered" }, 409);
    }

    const now = nowFn();
    const verifyToken = randomBytesFn(32).toString("hex");
    await db.createUser({
      email,
      email_verified: false,
      email_verify_expires: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      email_verify_token: verifyToken,
      id: randomUUID(),
      password_hash: await hashPasswordFn(parsed.data.password, 12),
      platform_user_id: randomUUID(),
    });

    await sendVerificationEmailFn({
      email,
      verifyUrl: `https://beomz.ai/verify-email?token=${verifyToken}`,
    });

    return c.json({ message: "Check your email to verify your account" }, 201);
  });

  emailAuthRoute.post("/verify", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = verifySchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "Invalid verification payload" }, 400);
    }

    const db = createStudioDbClientFn();
    const authUser = await db.findEmailAuthUserByVerifyToken(parsed.data.token);
    if (!authUser || isExpired(authUser.email_verify_expires, nowFn())) {
      return c.json({ error: "Invalid or expired verification token" }, 400);
    }

    const user = await db.updateUser(authUser.id, {
      email_verified: true,
      email_verify_expires: null,
      email_verify_token: null,
    });
    const { membership, org } = await ensureUserOrgContext(db, user, PLAN_LIMITS.free.signupGrant);

    await sendWelcomeEmailFn({
      email: user.email,
      name: user.full_name ?? null,
    });

    const token = signLocalPlatformJwtFn(user);
    return c.json(buildPlatformAuthResponse({
      membership,
      org,
      token,
      user,
    }));
  });

  emailAuthRoute.post("/login", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "Invalid login payload" }, 400);
    }

    const db = createStudioDbClientFn();
    const authUser = await db.findEmailAuthUserByEmail(normalizeEmail(parsed.data.email));
    if (!authUser?.password_hash) {
      return c.json({ error: "Invalid email or password" }, 401);
    }

    if (!authUser.email_verified) {
      return c.json({ error: "Please verify your email before logging in" }, 403);
    }

    const passwordMatches = await comparePasswordFn(parsed.data.password, authUser.password_hash);
    if (!passwordMatches) {
      return c.json({ error: "Invalid email or password" }, 401);
    }

    const user = toPublicUser(authUser);
    const { membership, org } = await ensureUserOrgContext(db, user, 0);
    const token = signLocalPlatformJwtFn(user);

    return c.json(buildPlatformAuthResponse({
      membership,
      org,
      token,
      user,
    }));
  });

  emailAuthRoute.post("/forgot-password", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = forgotPasswordSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "Invalid forgot-password payload" }, 400);
    }

    const db = createStudioDbClientFn();
    const authUser = await db.findEmailAuthUserByEmail(normalizeEmail(parsed.data.email));

    if (authUser?.password_hash) {
      const now = nowFn();
      const resetToken = randomBytesFn(32).toString("hex");
      await db.updateUser(authUser.id, {
        password_reset_expires: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
        password_reset_token: resetToken,
      });
      await sendResetPasswordEmailFn({
        email: authUser.email,
        name: authUser.full_name ?? null,
        resetUrl: `https://beomz.ai/reset-password?token=${resetToken}`,
      });
    }

    return c.json({ message: "If that email exists, a reset link has been sent" });
  });

  emailAuthRoute.post("/reset-password", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = resetPasswordSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "Invalid reset-password payload" }, 400);
    }

    const db = createStudioDbClientFn();
    const authUser = await db.findEmailAuthUserByResetToken(parsed.data.token);
    if (!authUser || isExpired(authUser.password_reset_expires, nowFn())) {
      return c.json({ error: "Invalid or expired reset token" }, 400);
    }

    await db.updateUser(authUser.id, {
      password_hash: await hashPasswordFn(parsed.data.password, 12),
      password_reset_expires: null,
      password_reset_token: null,
    });

    return c.json({ message: "Password updated" });
  });

  emailAuthRoute.post("/resend-verification", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = resendVerificationSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "Invalid resend-verification payload" }, 400);
    }

    const db = createStudioDbClientFn();
    const authUser = await db.findEmailAuthUserByEmail(normalizeEmail(parsed.data.email));
    if (!authUser?.password_hash) {
      return c.json({ error: "User not found" }, 404);
    }

    if (authUser.email_verified) {
      return c.json({ error: "Email is already verified" }, 400);
    }

    const now = nowFn();
    const verifyToken = randomBytesFn(32).toString("hex");
    await db.updateUser(authUser.id, {
      email_verify_expires: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      email_verify_token: verifyToken,
    });

    await sendVerificationEmailFn({
      email: authUser.email,
      name: authUser.full_name ?? null,
      verifyUrl: `https://beomz.ai/verify-email?token=${verifyToken}`,
    });

    return c.json({ message: "Verification email resent" });
  });

  return emailAuthRoute;
}

const emailAuthRoute = createEmailAuthRoute();

export default emailAuthRoute;
