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

interface UserUpsertInput {
  email: string;
  platformUserId: string;
}

interface AuthBootstrapStore {
  ensureOrgMembership(input: OrgMembershipInsert): Promise<void>;
  findAuthUserById(authUserId: string): Promise<{ id: string } | null>;
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

      return response.data.user ? { id: response.data.user.id } : null;
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
      const upsert = async (includeUpdatedAt: boolean) => {
        const payload: Record<string, unknown> = {
          email: input.email,
          platform_user_id: input.platformUserId,
        };

        if (includeUpdatedAt) {
          payload.updated_at = new Date().toISOString();
        }

        const response = await client
          .from("users")
          .upsert(payload, {
            onConflict: "email",
          })
          .select("*")
          .maybeSingle<UserRow>();

        return unwrapMaybeSingle(response);
      };

      try {
        return await upsert(true);
      } catch (error) {
        if (!isMissingColumnError(error, "updated_at")) {
          throw error;
        }

        return upsert(false);
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

      if (!authUser) {
        return c.json({ error: "User not found" }, 401);
      }

      let user = await db.findUserByPlatformUserId(jwt.sub);
      let isNew = false;

      if (!user) {
        const existingUser = await authStore.findUserByEmail(email);
        isNew = !existingUser;
        user = await authStore.upsertUserByEmail({
          email,
          platformUserId: jwt.sub,
        });
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
