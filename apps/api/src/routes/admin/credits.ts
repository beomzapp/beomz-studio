import { createClient } from "@supabase/supabase-js";
import { Hono, type MiddlewareHandler } from "hono";
import { z } from "zod";

import { apiConfig } from "../../config.js";
import { loadOrgContext } from "../../middleware/loadOrgContext.js";
import { requireAdmin } from "../../middleware/requireAdmin.js";
import { verifyPlatformJwt } from "../../middleware/verifyPlatformJwt.js";

interface CreditTransactionAdminRow {
  amount: number;
  created_at: string;
  description: string | null;
  id: string;
  org_id: string;
  type: string;
}

interface OrgOwnerRow {
  id: string;
  owner_id: string;
}

interface UserEmailRow {
  email: string;
  id: string;
}

export interface AdminCreditTransaction {
  created_at: string;
  delta: number;
  id: string;
  reason: string;
  source: string;
  user_email: string;
}

interface AdminCreditsRouteDeps {
  authMiddleware?: MiddlewareHandler;
  listCredits?: (input: {
    limit: number;
    page: number;
    source?: string;
  }) => Promise<{
    limit: number;
    page: number;
    total: number;
    transactions: AdminCreditTransaction[];
  }>;
  loadOrgContextMiddleware?: MiddlewareHandler;
  requireAdminMiddleware?: MiddlewareHandler;
}

const FALLBACK_USER_EMAIL = "unknown";

const listCreditsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  page: z.coerce.number().int().min(1).default(1),
  source: z.string().trim().min(1).max(100).optional(),
});

const CREDIT_SOURCE_FILTERS: Record<string, string[]> = {
  build: ["usage"],
  manual_admin: ["manual_admin"],
  referral: ["referral", "referral_signup", "referral_upgrade", "signup_bonus", "upgrade_bonus"],
  stripe: ["purchase", "subscription_reset", "topup"],
};

function createStudioAdminClient() {
  return createClient(apiConfig.STUDIO_SUPABASE_URL, apiConfig.STUDIO_SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function normalizeCreditSource(type: string): string {
  if (CREDIT_SOURCE_FILTERS.build.includes(type)) {
    return "build";
  }

  if (CREDIT_SOURCE_FILTERS.referral.includes(type)) {
    return "referral";
  }

  if (type === "manual_admin") {
    return "manual_admin";
  }

  if (CREDIT_SOURCE_FILTERS.stripe.includes(type)) {
    return "stripe";
  }

  return type;
}

async function fetchUserEmailMap(
  client: ReturnType<typeof createStudioAdminClient>,
  orgIds: string[],
): Promise<Map<string, string>> {
  const emailByOrgId = new Map<string, string>();
  if (orgIds.length === 0) {
    return emailByOrgId;
  }

  const orgsResponse = await client
    .from("orgs")
    .select("id,owner_id")
    .in("id", orgIds);

  if (orgsResponse.error) {
    throw new Error(orgsResponse.error.message);
  }

  const orgRows = (orgsResponse.data ?? []) as OrgOwnerRow[];
  const ownerIds = Array.from(new Set(orgRows.map((row) => row.owner_id)));
  if (ownerIds.length === 0) {
    return emailByOrgId;
  }

  const usersResponse = await client
    .from("users")
    .select("id,email")
    .in("id", ownerIds);

  if (usersResponse.error) {
    throw new Error(usersResponse.error.message);
  }

  const userRows = (usersResponse.data ?? []) as UserEmailRow[];
  const emailByUserId = new Map(userRows.map((row) => [row.id, row.email]));

  for (const row of orgRows) {
    const email = emailByUserId.get(row.owner_id);
    if (email) {
      emailByOrgId.set(row.id, email);
    }
  }

  return emailByOrgId;
}

async function listCreditsFromDb(input: {
  limit: number;
  page: number;
  source?: string;
}) {
  const client = createStudioAdminClient();
  const from = (input.page - 1) * input.limit;
  const to = from + input.limit - 1;
  const source = input.source?.trim().toLowerCase();
  const mappedTypes = source ? CREDIT_SOURCE_FILTERS[source] : undefined;

  if (source && mappedTypes && mappedTypes.length === 0) {
    return {
      limit: input.limit,
      page: input.page,
      total: 0,
      transactions: [],
    };
  }

  let query = client
    .from("credit_transactions")
    .select("id,org_id,amount,type,description,created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (source) {
    if (mappedTypes && mappedTypes.length > 0) {
      query = mappedTypes.length === 1
        ? query.eq("type", mappedTypes[0]!)
        : query.in("type", mappedTypes);
    } else {
      query = query.eq("type", source);
    }
  }

  const response = await query;
  if (response.error) {
    throw new Error(response.error.message);
  }

  const rows = (response.data ?? []) as CreditTransactionAdminRow[];
  const orgIds = Array.from(new Set(rows.map((row) => row.org_id)));
  const emailByOrgId = await fetchUserEmailMap(client, orgIds);

  return {
    limit: input.limit,
    page: input.page,
    total: response.count ?? 0,
    transactions: rows.map((row) => ({
      created_at: row.created_at,
      delta: Number(row.amount ?? 0),
      id: row.id,
      reason: row.description ?? "",
      source: normalizeCreditSource(row.type),
      user_email: emailByOrgId.get(row.org_id) ?? FALLBACK_USER_EMAIL,
    })),
  };
}

export function createAdminCreditsRoute(deps: AdminCreditsRouteDeps = {}) {
  const route = new Hono();
  const authMiddleware = deps.authMiddleware ?? verifyPlatformJwt;
  const loadOrgContextMiddleware = deps.loadOrgContextMiddleware ?? loadOrgContext;
  const requireAdminMiddleware = deps.requireAdminMiddleware ?? requireAdmin;
  const listCredits = deps.listCredits ?? listCreditsFromDb;

  route.get("/", authMiddleware, loadOrgContextMiddleware, requireAdminMiddleware, async (c) => {
    try {
      const parsed = listCreditsQuerySchema.safeParse({
        limit: c.req.query("limit"),
        page: c.req.query("page"),
        source: c.req.query("source"),
      });

      if (!parsed.success) {
        return c.json({ details: parsed.error.flatten(), error: "Invalid credits query." }, 400);
      }

      const payload = await listCredits(parsed.data);
      return c.json(payload);
    } catch (error) {
      console.error("[GET /admin/credits] error:", error);
      return c.json({ error: "Failed to load admin credits." }, 500);
    }
  });

  return route;
}

const adminCreditsRoute = createAdminCreditsRoute();

export default adminCreditsRoute;
