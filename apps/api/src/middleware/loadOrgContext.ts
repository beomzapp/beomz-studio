import type { MiddlewareHandler } from "hono";
import { createClient } from "@supabase/supabase-js";

import {
  createStudioDbClient,
  type OrgMembershipInsert,
  type OrgMembershipRow,
  type OrgRow,
  type UserRow,
} from "@beomz-studio/studio-db";

import { apiConfig } from "../config.js";
import { PLAN_LIMITS } from "../lib/credits.js";
import {
  applySignupReferralReward,
  ensureReferralCodeForUser,
  getReferralCodeFromRequest,
} from "../lib/referrals.js";
import type { VerifiedPlatformJwt } from "./verifyPlatformJwt.js";

function buildDefaultOrgName(email: string | undefined, platformUserId: string) {
  if (email && email.includes("@")) {
    const [localPart] = email.split("@");
    const cleaned = localPart.trim();
    if (cleaned.length > 0) {
      return `${cleaned}'s Studio`;
    }
  }

  return `Studio ${platformUserId.slice(0, 8)}`;
}

function buildUserFallbackEmail(jwt: VerifiedPlatformJwt) {
  if (typeof jwt.email === "string" && jwt.email.length > 0) {
    return jwt.email;
  }

  return `${jwt.sub}@platform.local`;
}

function createStudioAdminClient() {
  return createClient(apiConfig.STUDIO_SUPABASE_URL, apiConfig.STUDIO_SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function readProfileString(
  metadata: Record<string, unknown> | null | undefined,
  keys: string[],
): string | null {
  if (!metadata) {
    return null;
  }

  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

function extractUserProfile(authUser: {
  app_metadata?: Record<string, unknown> | null;
  user_metadata?: Record<string, unknown> | null;
}) {
  return {
    avatarUrl:
      readProfileString(authUser.user_metadata, ["avatar_url", "picture", "avatarUrl"])
      ?? readProfileString(authUser.app_metadata, ["avatar_url", "picture", "avatarUrl"]),
    fullName:
      readProfileString(authUser.user_metadata, ["name", "full_name", "fullName"])
      ?? readProfileString(authUser.app_metadata, ["name", "full_name", "fullName"]),
  };
}

function extractClientIp(request: {
  header(name: string): string | undefined;
}): string | null {
  const cloudflareIp = request.header("cf-connecting-ip")?.trim();
  if (cloudflareIp) {
    return cloudflareIp;
  }

  const forwardedFor = request.header("x-forwarded-for");
  if (!forwardedFor) {
    return null;
  }

  const firstHop = forwardedFor
    .split(",")
    .map((value) => value.trim())
    .find((value) => value.length > 0);

  return firstHop ?? null;
}

interface UserUpsertInput {
  avatarUrl?: string | null;
  email: string;
  fullName?: string | null;
  platformUserId: string;
}

interface AuthBootstrapStore {
  ensureOrgMembership(input: OrgMembershipInsert): Promise<void>;
  findAuthUserById(authUserId: string): Promise<{
    app_metadata?: Record<string, unknown> | null;
    id: string;
    user_metadata?: Record<string, unknown> | null;
  } | null>;
  findMembershipByUserId(userId: string): Promise<OrgMembershipRow | null>;
  findUserByEmail(email: string): Promise<UserRow | null>;
  upsertUserByEmail(input: UserUpsertInput): Promise<UserRow | null>;
}

interface LoadOrgContextDeps {
  createAuthBootstrapStore?: () => AuthBootstrapStore;
  createDbClient?: typeof createStudioDbClient;
}

function unwrapMaybeSingle<T extends Record<string, unknown>>(response: {
  data: T | null;
  error: { message: string } | null;
}): T | null {
  if (response.error) {
    throw new Error(response.error.message);
  }

  return response.data;
}

function isMissingColumnError(error: unknown, columnName: string): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return message.includes(columnName.toLowerCase()) && message.includes("column");
}

function createAuthBootstrapStore(): AuthBootstrapStore {
  const client = createStudioAdminClient();

  return {
    async ensureOrgMembership(input) {
      const response = await client
        .from("org_members")
        .upsert(input, {
          ignoreDuplicates: true,
          onConflict: "org_id,user_id",
        });

      if (response.error) {
        throw new Error(response.error.message);
      }
    },
    async findAuthUserById(authUserId) {
      const response = await client.auth.admin.getUserById(authUserId);

      if (response.error) {
        const message = response.error.message.toLowerCase();
        if (message.includes("not found") || message.includes("user") && message.includes("exist")) {
          return null;
        }

        throw new Error(response.error.message);
      }

      return response.data.user
        ? {
          app_metadata:
            typeof response.data.user.app_metadata === "object" && response.data.user.app_metadata !== null
              ? response.data.user.app_metadata as Record<string, unknown>
              : null,
          id: response.data.user.id,
          user_metadata:
            typeof response.data.user.user_metadata === "object" && response.data.user.user_metadata !== null
              ? response.data.user.user_metadata as Record<string, unknown>
              : null,
        }
        : null;
    },
    async findMembershipByUserId(userId) {
      const response = await client
        .from("org_members")
        .select("*")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle<OrgMembershipRow>();

      return unwrapMaybeSingle(response);
    },
    async findUserByEmail(email) {
      const response = await client
        .from("users")
        .select("*")
        .eq("email", email)
        .limit(1)
        .maybeSingle<UserRow>();

      return unwrapMaybeSingle(response);
    },
    async upsertUserByEmail(input) {
      const payload: Record<string, unknown> = {
        avatar_url: input.avatarUrl,
        email: input.email,
        full_name: input.fullName,
        platform_user_id: input.platformUserId,
        updated_at: new Date().toISOString(),
      };

      Object.keys(payload).forEach((key) => {
        if (payload[key] === null || payload[key] === undefined || payload[key] === "") {
          delete payload[key];
        }
      });

      const upsert = async (currentPayload: Record<string, unknown>) => {
        const response = await client
          .from("users")
          .upsert(currentPayload, {
            onConflict: "email",
          })
          .select("*")
          .maybeSingle<UserRow>();

        return unwrapMaybeSingle(response);
      };

      while (true) {
        try {
          return await upsert(payload);
        } catch (error) {
          const missingColumn = Object.keys(payload).find((columnName) =>
            !["email", "platform_user_id"].includes(columnName) && isMissingColumnError(error, columnName),
          );

          if (!missingColumn) {
            throw error;
          }

          delete payload[missingColumn];
        }
      }
    },
  };
}

export function createLoadOrgContext(deps: LoadOrgContextDeps = {}): MiddlewareHandler {
  const createDbClient = deps.createDbClient ?? createStudioDbClient;
  const createAuthStore = deps.createAuthBootstrapStore ?? createAuthBootstrapStore;

  return async (c, next) => {
    try {
      const jwt = c.get("platformJwt") as VerifiedPlatformJwt | undefined;
      if (!jwt) {
        return c.json({ error: "JWT context missing." }, 401);
      }

      const db = createDbClient();
      const authStore = createAuthStore();
      const email = buildUserFallbackEmail(jwt);
      const authUser = await authStore.findAuthUserById(jwt.sub);
      const profile = authUser ? extractUserProfile(authUser) : { avatarUrl: null, fullName: null };

      if (!authUser) {
        return c.json({ error: "User not found" }, 401);
      }

      let user = await db.findUserByPlatformUserId(jwt.sub);
      let isNew = false;

      if (!user) {
        const existingUser = await authStore.findUserByEmail(email);
        isNew = !existingUser;
        const upsertInput: UserUpsertInput = {
          email,
          platformUserId: jwt.sub,
        };

        if (profile.avatarUrl) {
          upsertInput.avatarUrl = profile.avatarUrl;
        }

        if (profile.fullName) {
          upsertInput.fullName = profile.fullName;
        }

        user = await authStore.upsertUserByEmail(upsertInput);
        if (!user) {
          return c.json({ error: "User not found" }, 401);
        }
      } else if (user.email !== email) {
        user = await db.updateUserEmail(user.id, email);
      }

      console.log("[auth] user resolved:", { userId: user.id, email, isNew });

      let membership = await authStore.findMembershipByUserId(user.id);
      let org: OrgRow | null = null;

      if (membership) {
        org = await db.findOrgById(membership.org_id);
      }

      if (!membership || !org) {
        org = await db.createOrg({
          name: buildDefaultOrgName(jwt.email, jwt.sub),
          owner_id: user.id,
          credits: PLAN_LIMITS.free!.signupGrant,
        });

        await authStore.ensureOrgMembership({
          org_id: org.id,
          role: "owner",
          user_id: user.id,
        });

        membership = await authStore.findMembershipByUserId(user.id);
      }

      if (!membership) {
        throw new Error(`Membership missing for user ${user.id}.`);
      }

      if (!org || org.id !== membership.org_id) {
        org = await db.findOrgById(membership.org_id);
      }

      if (!org) {
        throw new Error(`Org missing for membership ${membership.org_id}.`);
      }

      if (isNew) {
        await ensureReferralCodeForUser(db, user.id);

        const referralCode = getReferralCodeFromRequest(c.req.url, authUser);
        if (referralCode) {
          const referralCodeOwner = await db.findReferralCodeByCode(referralCode);

          if (referralCodeOwner && referralCodeOwner.user_id !== user.id) {
            const referralResult = await applySignupReferralReward({
              clientIp: extractClientIp(c.req),
              db,
              ipqsApiKey: apiConfig.IPQS_API_KEY,
              referralCode,
              referredOrgId: org.id,
              referredUserId: user.id,
              referrerId: referralCodeOwner.user_id,
            });

            if (referralResult.referredUser) {
              user = referralResult.referredUser;
            }

            if (referralResult.referredOrg) {
              org = referralResult.referredOrg;
            }
          }
        }
      }

      c.set("orgContext", {
        db,
        jwt,
        membership,
        org,
        user,
      });

      await next();
    } catch (err) {
      console.error("[loadOrgContext] DB error:", err);
      return c.json({ error: "Authentication failed." }, 401);
    }
  };
}

export const loadOrgContext = createLoadOrgContext();
