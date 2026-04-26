import { createClient } from "@supabase/supabase-js";
import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import sharp from "sharp";
import { z } from "zod";

import { apiConfig } from "../config.js";
import { buildAssetProxyUrl, createStudioStorageClient } from "../lib/images/index.js";
import { loadOrgContext } from "../middleware/loadOrgContext.js";
import { verifyPlatformJwt } from "../middleware/verifyPlatformJwt.js";
import type { OrgContext } from "../types.js";

const USER_AVATAR_BUCKET = "project-assets";
const USER_AVATAR_MAX_BYTES = 5 * 1024 * 1024;
const USER_AVATAR_ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

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
  workspace_knowledge: z.string().trim().max(20_000).optional(),
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
  workspace_knowledge: string | null;
  is_admin: boolean;
}

interface MeRouteDeps {
  authMiddleware?: MiddlewareHandler;
  loadOrgContextMiddleware?: MiddlewareHandler;
  fetchUserProfile?: (userId: string) => Promise<UserProfileRow | null>;
  updateUserProfile?: (
    userId: string,
    patch: Partial<Pick<UserProfileRow, "full_name" | "display_name" | "avatar_url" | "building_for" | "referral_source" | "workspace_knowledge">>,
  ) => Promise<UserProfileRow | null>;
  completeOnboarding?: (userId: string) => Promise<void>;
}

type UserProfilePatch = Partial<Pick<UserProfileRow, "full_name" | "display_name" | "avatar_url" | "building_for" | "referral_source" | "workspace_knowledge">>;

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
    workspace_knowledge: typeof row.workspace_knowledge === "string" ? row.workspace_knowledge : null,
    is_admin: row.is_admin === true,
  };
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return String(error);
}

function isMissingColumnError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  return message.includes("column")
    && (message.includes("does not exist") || message.includes("could not find"));
}

function extractMissingColumnName(error: unknown): string | null {
  const message = getErrorMessage(error);
  const match = message.match(/column ['"]?([a-zA-Z0-9_]+)['"]?/i)
    ?? message.match(/could not find the ['"]([a-zA-Z0-9_]+)['"] column/i);
  return match?.[1] ?? null;
}

async function fetchBaseUserProfileFromDb(supabase: ReturnType<typeof createStudioAdminClient>, userId: string) {
  const response = await supabase
    .from("users")
    .select("id,email,created_at")
    .eq("id", userId)
    .maybeSingle<Record<string, unknown>>();

  if (response.error) {
    throw new Error(getErrorMessage(response.error));
  }

  return response.data ? normaliseUserProfileRow(response.data) : null;
}

async function fetchUserProfileFromDb(userId: string): Promise<UserProfileRow | null> {
  const supabase = createStudioAdminClient();
  const response = await supabase
    .from("users")
    .select("*")
    .eq("id", userId)
    .maybeSingle<Record<string, unknown>>();

  if (response.error) {
    if (isMissingColumnError(response.error)) {
      return fetchBaseUserProfileFromDb(supabase, userId);
    }
    throw new Error(getErrorMessage(response.error));
  }

  return response.data ? normaliseUserProfileRow(response.data) : null;
}

async function updateUserProfileInDb(
  userId: string,
  patch: UserProfilePatch,
): Promise<UserProfileRow | null> {
  const supabase = createStudioAdminClient();
  const safePatch: UserProfilePatch = { ...patch };

  while (true) {
    if (Object.keys(safePatch).length === 0) {
      return fetchUserProfileFromDb(userId);
    }

    const response = await supabase
      .from("users")
      .update(safePatch)
      .eq("id", userId)
      .select("*")
      .maybeSingle<Record<string, unknown>>();

    if (!response.error) {
      return response.data ? normaliseUserProfileRow(response.data) : null;
    }

    const missingColumn = extractMissingColumnName(response.error);
    if (!missingColumn || !(missingColumn in safePatch)) {
      throw new Error(getErrorMessage(response.error));
    }

    console.warn(`[me] users.${missingColumn} missing from schema; skipping profile field update.`);
    delete safePatch[missingColumn as keyof UserProfilePatch];
  }
}

async function completeOnboardingInDb(userId: string): Promise<void> {
  const supabase = createStudioAdminClient();
  const response = await supabase
    .from("users")
    .update({ onboarding_completed: true })
    .eq("id", userId);

  if (response.error) {
    if (extractMissingColumnName(response.error) === "onboarding_completed") {
      console.warn("[me] users.onboarding_completed missing from schema; skipping onboarding completion write.");
      return;
    }
    throw new Error(getErrorMessage(response.error));
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
    workspace_knowledge: user.workspace_knowledge,
    created_at: user.created_at,
    plan: org.plan,
    credits: Number(org.credits ?? 0) + Number(org.topup_credits ?? 0),
    is_admin: user.is_admin,
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
      console.error("[GET /me] error:", error);
      return c.json({ error: "Failed to load user profile." }, 500);
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
      ) as UserProfilePatch;

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
      console.error("[PATCH /me] error:", error);
      return c.json({ error: "Failed to update user profile." }, 500);
    }
  });

  meRoute.post("/avatar", authMiddleware, loadOrgContextMiddleware, async (c) => {
    try {
      const orgContext = c.get("orgContext") as OrgContext;
      const formData = await c.req.formData().catch(() => null);
      if (!formData) {
        return c.json({ error: "Invalid multipart form data." }, 400);
      }

      const avatarField = formData.get("avatar");
      if (!(avatarField instanceof File)) {
        return c.json({ error: "Avatar file is required." }, 400);
      }
      if (avatarField.size > USER_AVATAR_MAX_BYTES) {
        return c.json({ error: "Avatar must be under 5MB." }, 400);
      }
      const mimeType = avatarField.type.split(";")[0]?.trim() ?? "";
      if (!USER_AVATAR_ALLOWED_TYPES.includes(mimeType)) {
        return c.json({ error: "Unsupported image type. Use PNG, JPEG, WebP, or GIF." }, 400);
      }

      const bytes = Buffer.from(await avatarField.arrayBuffer());
      const compressed = await sharp(bytes, { failOn: "none" })
        .rotate()
        .resize({ width: 256, height: 256, fit: "cover" })
        .jpeg({ quality: 85, mozjpeg: true })
        .toBuffer();

      const path = `user-avatars/${orgContext.user.id}.jpg`;
      const client = createStudioStorageClient();
      const uploadResult = await client.storage
        .from(USER_AVATAR_BUCKET)
        .upload(path, compressed, {
          cacheControl: "3600",
          contentType: "image/jpeg",
          upsert: true,
        });

      if (uploadResult.error) {
        console.error("[POST /me/avatar] upload failed:", uploadResult.error);
        return c.json({ error: "Failed to upload avatar." }, 500);
      }

      const avatar_url = buildAssetProxyUrl(USER_AVATAR_BUCKET, path);

      const updatedUser = await updateUserProfile(orgContext.user.id, { avatar_url });
      if (!updatedUser) {
        return c.json({ error: "User not found." }, 404);
      }

      return c.json({ avatar_url });
    } catch (error) {
      console.error("[POST /me/avatar] error:", error);
      return c.json({ error: "Failed to save avatar." }, 500);
    }
  });

  meRoute.post("/complete-onboarding", authMiddleware, loadOrgContextMiddleware, async (c) => {
    try {
      const orgContext = c.get("orgContext") as OrgContext;
      await completeOnboarding(orgContext.user.id);
      return c.json({ success: true });
    } catch (error) {
      console.error("[POST /me/complete-onboarding] error:", error);
      return c.json({ error: "Failed to complete onboarding." }, 500);
    }
  });

  return meRoute;
}

const meRoute = createMeRoute();

export default meRoute;
