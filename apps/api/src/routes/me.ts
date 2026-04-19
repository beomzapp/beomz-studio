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

async function fetchUserProfileFromDb(userId: string): Promise<UserProfileRow | null> {
  const supabase = createStudioAdminClient();
  const response = await supabase
    .from("users")
    .select("id,email,created_at,full_name,display_name,avatar_url,building_for,referral_source,onboarding_completed")
    .eq("id", userId)
    .maybeSingle<UserProfileRow>();

  if (response.error) {
    throw new Error(response.error.message);
  }

  return response.data;
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
    .select("id,email,created_at,full_name,display_name,avatar_url,building_for,referral_source,onboarding_completed")
    .maybeSingle<UserProfileRow>();

  if (response.error) {
    throw new Error(response.error.message);
  }

  return response.data;
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
  });

  meRoute.patch("/", authMiddleware, loadOrgContextMiddleware, async (c) => {
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
  });

  meRoute.post("/complete-onboarding", authMiddleware, loadOrgContextMiddleware, async (c) => {
    const orgContext = c.get("orgContext") as OrgContext;
    await completeOnboarding(orgContext.user.id);
    return c.json({ success: true });
  });

  return meRoute;
}

const meRoute = createMeRoute();

export default meRoute;
