import { createClient } from "@supabase/supabase-js";
import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import { z } from "zod";

import { apiConfig } from "../config.js";
import { loadOrgContext } from "../middleware/loadOrgContext.js";
import { verifyPlatformJwt } from "../middleware/verifyPlatformJwt.js";
import type { OrgContext } from "../types.js";

const displayNameSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9-]{3,30}$/, "Display name must be 3-30 characters and use only letters, numbers, and hyphens.");

const patchMeSchema = z.object({
  full_name: z.string().trim().min(1).max(200).optional(),
  display_name: displayNameSchema.optional(),
  avatar_url: z.string().trim().url().max(500).optional(),
  building_for: z.string().trim().min(1).max(100).optional(),
  referral_source: z.string().trim().min(1).max(100).optional(),
}).strict();

interface UserProfileRow {
  id: string;
  email: string;
  created_at: string;
  full_name: string | null;
  display_name: string | null;
  avatar_url: string | null;
  building_for: string | null;
  referral_source: string | null;
  onboarding_completed: boolean;
}

interface MeRouteDeps {
  authMiddleware?: MiddlewareHandler;
  loadOrgContextMiddleware?: MiddlewareHandler;
  fetchUserProfile?: (userId: string) => Promise<UserProfileRow | null>;
  updateUserProfile?: (
    userId: string,
    patch: Partial<Pick<UserProfileRow, "full_name" | "display_name" | "avatar_url" | "building_for" | "referral_source">>,
  ) => Promise<UserProfileRow | null>;
  completeOnboarding?: (userId: string) => Promise<void>;
}

function createStudioAdminClient() {
  return createClient(apiConfig.STUDIO_SUPABASE_URL, apiConfig.STUDIO_SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function normaliseUserProfileRow(row: Record<string, unknown>): UserProfileRow {
  return {
    id: typeof row.id === "string" ? row.id : "",
    email: typeof row.email === "string" ? row.email : "",
    created_at: typeof row.created_at === "string" ? row.created_at : new Date(0).toISOString(),
    full_name: typeof row.full_name === "string" ? row.full_name : null,
    display_name: typeof row.display_name === "string" ? row.display_name : null,
    avatar_url: typeof row.avatar_url === "string" ? row.avatar_url : null,
    building_for: typeof row.building_for === "string" ? row.building_for : null,
    referral_source: typeof row.referral_source === "string" ? row.referral_source : null,
    onboarding_completed: row.onboarding_completed === true,
  };
}

function isMigrationMissingError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return message.includes("column")
    && (message.includes("does not exist") || message.includes("could not find"));
}

async function fetchUserProfileFromDb(userId: string): Promise<UserProfileRow | null> {
  const supabase = createStudioAdminClient();
  const response = await supabase
    .from("users")
    .select("*")
    .eq("id", userId)
    .maybeSingle<Record<string, unknown>>();

  if (response.error) {
    throw new Error(response.error.message);
  }

  return response.data ? normaliseUserProfileRow(response.data) : null;
}

async function updateUserProfileInDb(
  userId: string,
  patch: Partial<Pick<UserProfileRow, "full_name" | "display_name" | "avatar_url" | "building_for" | "referral_source">>,
): Promise<UserProfileRow | null> {
  const supabase = createStudioAdminClient();
  const response = await supabase
    .from("users")
    .update(patch)
    .eq("id", userId)
    .select("*")
    .maybeSingle<Record<string, unknown>>();

  if (response.error) {
    throw new Error(response.error.message);
  }

  return response.data ? normaliseUserProfileRow(response.data) : null;
}

async function completeOnboardingInDb(userId: string): Promise<void> {
  const supabase = createStudioAdminClient();
  const response = await supabase
    .from("users")
    .update({ onboarding_completed: true })
    .eq("id", userId);

  if (response.error) {
    throw new Error(response.error.message);
  }
}

function buildMeResponse(
  user: UserProfileRow,
  org: {
    plan: string;
    credits: number;
    topup_credits: number;
  },
) {
  return {
    id: user.id,
    email: user.email,
    full_name: user.full_name,
    display_name: user.display_name,
    avatar_url: user.avatar_url,
    building_for: user.building_for,
    referral_source: user.referral_source,
    onboarding_completed: user.onboarding_completed,
    created_at: user.created_at,
    plan: org.plan,
    credits: Number(org.credits ?? 0) + Number(org.topup_credits ?? 0),
  };
}

export function createMeRoute(deps: MeRouteDeps = {}) {
  const meRoute = new Hono();
  const authMiddleware = deps.authMiddleware ?? verifyPlatformJwt;
  const loadOrgContextMiddleware = deps.loadOrgContextMiddleware ?? loadOrgContext;
  const fetchUserProfile = deps.fetchUserProfile ?? fetchUserProfileFromDb;
  const updateUserProfile = deps.updateUserProfile ?? updateUserProfileInDb;
  const completeOnboarding = deps.completeOnboarding ?? completeOnboardingInDb;

  meRoute.get("/", authMiddleware, loadOrgContextMiddleware, async (c) => {
    try {
      const orgContext = c.get("orgContext") as OrgContext;
      const user = await fetchUserProfile(orgContext.user.id);
      if (!user) {
        return c.json({ error: "User not found." }, 404);
      }

      const org = await orgContext.db.getOrgWithBalance(orgContext.org.id);
      if (!org) {
        return c.json({ error: "Org not found." }, 404);
      }

      return c.json(buildMeResponse(user, org));
    } catch (error) {
      if (isMigrationMissingError(error)) {
        return c.json({ error: "Migration 011 not applied." }, 503);
      }
      throw error;
    }
  });

  meRoute.patch("/", authMiddleware, loadOrgContextMiddleware, async (c) => {
    try {
      const orgContext = c.get("orgContext") as OrgContext;
      const body = await c.req.json().catch(() => null);
      const parsed = patchMeSchema.safeParse(body);

      if (!parsed.success) {
        return c.json({ details: parsed.error.flatten(), error: "Invalid profile update body." }, 400);
      }

      const patch = Object.fromEntries(
        Object.entries(parsed.data).filter(([, value]) => value !== undefined),
      ) as Partial<Pick<UserProfileRow, "full_name" | "display_name" | "avatar_url" | "building_for" | "referral_source">>;

      if (Object.keys(patch).length === 0) {
        return c.json({ error: "At least one profile field is required." }, 400);
      }

      const updatedUser = await updateUserProfile(orgContext.user.id, patch);
      if (!updatedUser) {
        return c.json({ error: "User not found." }, 404);
      }

      const org = await orgContext.db.getOrgWithBalance(orgContext.org.id);
      if (!org) {
        return c.json({ error: "Org not found." }, 404);
      }

      return c.json(buildMeResponse(updatedUser, org));
    } catch (error) {
      if (isMigrationMissingError(error)) {
        return c.json({ error: "Migration 011 not applied." }, 503);
      }
      throw error;
    }
  });

  meRoute.post("/complete-onboarding", authMiddleware, loadOrgContextMiddleware, async (c) => {
    try {
      const orgContext = c.get("orgContext") as OrgContext;
      await completeOnboarding(orgContext.user.id);
      return c.json({ success: true });
    } catch (error) {
      if (isMigrationMissingError(error)) {
        return c.json({ error: "Migration 011 not applied." }, 503);
      }
      throw error;
    }
  });

  return meRoute;
}

const meRoute = createMeRoute();

export default meRoute;
