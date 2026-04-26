import { createClient } from "@supabase/supabase-js";
import type { MiddlewareHandler } from "hono";

import { apiConfig } from "../config.js";
import type { OrgContext } from "../types.js";

interface RequireAdminDeps {
  fetchAdminStatus?: (userId: string) => Promise<boolean>;
}

function createStudioAdminClient() {
  return createClient(apiConfig.STUDIO_SUPABASE_URL, apiConfig.STUDIO_SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

async function fetchAdminStatusFromDb(userId: string): Promise<boolean> {
  const client = createStudioAdminClient();
  const response = await client
    .from("users")
    .select("is_admin")
    .eq("id", userId)
    .maybeSingle<{ is_admin: boolean | null }>();

  if (response.error) {
    throw new Error(response.error.message);
  }

  return response.data?.is_admin === true;
}

export function createRequireAdmin(deps: RequireAdminDeps = {}): MiddlewareHandler {
  const fetchAdminStatus = deps.fetchAdminStatus ?? fetchAdminStatusFromDb;

  return async (c, next) => {
    const orgContext = c.get("orgContext") as OrgContext | undefined;
    const userId = orgContext?.user?.id;

    if (!userId) {
      return c.json({ error: "Authentication failed." }, 401);
    }

    try {
      const isAdmin = await fetchAdminStatus(userId);
      if (!isAdmin) {
        return c.json({ error: "Admin access required." }, 403);
      }

      await next();
    } catch (error) {
      console.error("[requireAdmin] error:", error);
      return c.json({ error: "Failed to verify admin access." }, 500);
    }
  };
}

export const requireAdmin = createRequireAdmin();
