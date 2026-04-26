import { createClient } from "@supabase/supabase-js";
import { Hono, type MiddlewareHandler } from "hono";
import { z } from "zod";

import { apiConfig } from "../../config.js";
import { loadOrgContext } from "../../middleware/loadOrgContext.js";
import { requireAdmin } from "../../middleware/requireAdmin.js";
import { verifyPlatformJwt } from "../../middleware/verifyPlatformJwt.js";

const adminPlanSchema = z.enum(["free", "pro_starter", "pro_builder", "business"]);

const listUsersQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  page: z.coerce.number().int().min(1).default(1),
  plan: adminPlanSchema.optional(),
  search: z.string().trim().max(200).optional(),
});

const creditAdjustmentSchema = z.object({
  delta: z.number().finite(),
  reason: z.string().trim().min(1).max(500),
}).strict();

interface AdminUsersRouteDeps {
  adjustUserCredits?: (input: { delta: number; reason: string; userId: string }) => Promise<{ credits: number } | null>;
  authMiddleware?: MiddlewareHandler;
  getUserCreditHistory?: (userId: string) => Promise<Array<{
    created_at: string;
    delta: number;
    id: string;
    reason: string | null;
    source: string;
  }> | null>;
  listUsers?: (input: {
    limit: number;
    page: number;
    plan?: "free" | "pro_starter" | "pro_builder" | "business";
    search?: string;
  }) => Promise<{
    limit: number;
    page: number;
    total: number;
    users: Array<{
      created_at: string;
      credits: number;
      email: string;
      id: string;
      last_active: string | null;
      name: string | null;
      org_id: string | null;
      plan: string;
    }>;
  }>;
  loadOrgContextMiddleware?: MiddlewareHandler;
  requireAdminMiddleware?: MiddlewareHandler;
}

interface AdminUserRow {
  created_at: string;
  email: string;
  full_name: string | null;
  id: string;
  display_name: string | null;
}

interface OrgSummaryRow {
  created_at: string;
  credits: number;
  id: string;
  owner_id: string;
  plan: string;
}

interface OrgMembershipRow {
  created_at: string;
  org_id: string;
  user_id: string;
}

interface ProjectActivityRow {
  last_opened_at: string | null;
  org_id: string;
  updated_at: string;
}

interface CreditTransactionHistoryRow {
  amount: number;
  created_at: string;
  description: string | null;
  id: string;
  type: string;
}

function createStudioAdminClient() {
  return createClient(apiConfig.STUDIO_SUPABASE_URL, apiConfig.STUDIO_SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function cleanSearchTerm(search?: string) {
  if (!search) return undefined;
  const trimmed = search.trim();
  if (trimmed.length === 0) return undefined;
  return trimmed.replaceAll(",", " ");
}

function buildIlikePattern(search: string) {
  return `%${search}%`;
}

function pickUserName(row: Pick<AdminUserRow, "display_name" | "full_name">): string | null {
  const fullName = row.full_name?.trim();
  if (fullName) return fullName;

  const displayName = row.display_name?.trim();
  if (displayName) return displayName;

  return null;
}

function maxIsoDate(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

async function listPlanUserIds(
  client: ReturnType<typeof createStudioAdminClient>,
  plan: z.infer<typeof adminPlanSchema>,
): Promise<string[]> {
  const orgsResponse = await client
    .from("orgs")
    .select("id,owner_id")
    .eq("plan", plan);

  if (orgsResponse.error) {
    throw new Error(orgsResponse.error.message);
  }

  const orgIds: string[] = [];
  const userIds = new Set<string>();

  for (const row of orgsResponse.data ?? []) {
    if (typeof row.id === "string") {
      orgIds.push(row.id);
    }
    if (typeof row.owner_id === "string") {
      userIds.add(row.owner_id);
    }
  }

  if (orgIds.length === 0) {
    return [];
  }

  const membershipsResponse = await client
    .from("org_members")
    .select("user_id")
    .in("org_id", orgIds);

  if (membershipsResponse.error) {
    throw new Error(membershipsResponse.error.message);
  }

  for (const row of membershipsResponse.data ?? []) {
    if (typeof row.user_id === "string") {
      userIds.add(row.user_id);
    }
  }

  return Array.from(userIds);
}

async function resolveUserOrgMap(
  client: ReturnType<typeof createStudioAdminClient>,
  userIds: string[],
): Promise<Map<string, OrgSummaryRow>> {
  const userOrgMap = new Map<string, OrgSummaryRow>();
  if (userIds.length === 0) {
    return userOrgMap;
  }

  const ownedOrgsResponse = await client
    .from("orgs")
    .select("id,owner_id,plan,credits,created_at")
    .in("owner_id", userIds)
    .order("created_at", { ascending: true });

  if (ownedOrgsResponse.error) {
    throw new Error(ownedOrgsResponse.error.message);
  }

  for (const row of (ownedOrgsResponse.data ?? []) as OrgSummaryRow[]) {
    if (!userOrgMap.has(row.owner_id)) {
      userOrgMap.set(row.owner_id, row);
    }
  }

  const unresolvedUserIds = userIds.filter((userId) => !userOrgMap.has(userId));
  if (unresolvedUserIds.length === 0) {
    return userOrgMap;
  }

  const membershipsResponse = await client
    .from("org_members")
    .select("user_id,org_id,created_at")
    .in("user_id", unresolvedUserIds)
    .order("created_at", { ascending: true });

  if (membershipsResponse.error) {
    throw new Error(membershipsResponse.error.message);
  }

  const membershipOrgByUser = new Map<string, string>();
  for (const row of (membershipsResponse.data ?? []) as OrgMembershipRow[]) {
    if (!membershipOrgByUser.has(row.user_id)) {
      membershipOrgByUser.set(row.user_id, row.org_id);
    }
  }

  const fallbackOrgIds = Array.from(new Set(membershipOrgByUser.values()));
  if (fallbackOrgIds.length === 0) {
    return userOrgMap;
  }

  const fallbackOrgsResponse = await client
    .from("orgs")
    .select("id,owner_id,plan,credits,created_at")
    .in("id", fallbackOrgIds);

  if (fallbackOrgsResponse.error) {
    throw new Error(fallbackOrgsResponse.error.message);
  }

  const fallbackOrgById = new Map<string, OrgSummaryRow>();
  for (const row of (fallbackOrgsResponse.data ?? []) as OrgSummaryRow[]) {
    fallbackOrgById.set(row.id, row);
  }

  for (const [userId, orgId] of membershipOrgByUser.entries()) {
    const org = fallbackOrgById.get(orgId);
    if (org && !userOrgMap.has(userId)) {
      userOrgMap.set(userId, org);
    }
  }

  return userOrgMap;
}

async function loadLastActiveByOrgId(
  client: ReturnType<typeof createStudioAdminClient>,
  orgIds: string[],
): Promise<Map<string, string | null>> {
  const lastActiveByOrg = new Map<string, string | null>();
  if (orgIds.length === 0) {
    return lastActiveByOrg;
  }

  const response = await client
    .from("projects")
    .select("org_id,last_opened_at,updated_at")
    .in("org_id", orgIds);

  if (response.error) {
    throw new Error(response.error.message);
  }

  for (const row of (response.data ?? []) as ProjectActivityRow[]) {
    const candidate = maxIsoDate(row.last_opened_at, row.updated_at);
    const current = lastActiveByOrg.get(row.org_id) ?? null;
    lastActiveByOrg.set(row.org_id, maxIsoDate(current, candidate));
  }

  return lastActiveByOrg;
}

async function resolveUserOrg(
  client: ReturnType<typeof createStudioAdminClient>,
  userId: string,
): Promise<OrgSummaryRow | null> {
  const userResponse = await client
    .from("users")
    .select("id")
    .eq("id", userId)
    .maybeSingle<{ id: string }>();

  if (userResponse.error) {
    throw new Error(userResponse.error.message);
  }

  if (!userResponse.data) {
    return null;
  }

  const userOrgMap = await resolveUserOrgMap(client, [userId]);
  return userOrgMap.get(userId) ?? null;
}

async function listUsersFromDb(input: {
  limit: number;
  page: number;
  plan?: z.infer<typeof adminPlanSchema>;
  search?: string;
}) {
  const client = createStudioAdminClient();
  const search = cleanSearchTerm(input.search);
  const from = (input.page - 1) * input.limit;
  const to = from + input.limit - 1;

  let matchingUserIds: string[] | undefined;
  if (input.plan) {
    matchingUserIds = await listPlanUserIds(client, input.plan);
    if (matchingUserIds.length === 0) {
      return {
        limit: input.limit,
        page: input.page,
        total: 0,
        users: [],
      };
    }
  }

  let query = client
    .from("users")
    .select("id,email,full_name,display_name,created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (matchingUserIds) {
    query = query.in("id", matchingUserIds);
  }

  if (search) {
    const ilike = buildIlikePattern(search);
    query = query.or(`email.ilike.${ilike},full_name.ilike.${ilike},display_name.ilike.${ilike}`);
  }

  const response = await query;
  if (response.error) {
    throw new Error(response.error.message);
  }

  const userRows = (response.data ?? []) as AdminUserRow[];
  const userIds = userRows.map((row) => row.id);
  const userOrgMap = await resolveUserOrgMap(client, userIds);
  const orgIds = Array.from(new Set(Array.from(userOrgMap.values()).map((org) => org.id)));
  const lastActiveByOrgId = await loadLastActiveByOrgId(client, orgIds);

  return {
    limit: input.limit,
    page: input.page,
    total: response.count ?? 0,
    users: userRows.map((row) => {
      const org = userOrgMap.get(row.id);
      return {
        created_at: row.created_at,
        credits: Number(org?.credits ?? 0),
        email: row.email,
        id: row.id,
        last_active: org ? (lastActiveByOrgId.get(org.id) ?? null) : null,
        name: pickUserName(row),
        org_id: org?.id ?? null,
        plan: org?.plan ?? "free",
      };
    }),
  };
}

async function getUserCreditHistoryFromDb(userId: string) {
  const client = createStudioAdminClient();
  const org = await resolveUserOrg(client, userId);
  if (!org) {
    return null;
  }

  const response = await client
    .from("credit_transactions")
    .select("id,amount,type,description,created_at")
    .eq("org_id", org.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (response.error) {
    throw new Error(response.error.message);
  }

  return ((response.data ?? []) as CreditTransactionHistoryRow[]).map((row) => ({
    created_at: row.created_at,
    delta: Number(row.amount ?? 0),
    id: row.id,
    reason: row.description,
    source: row.type,
  }));
}

async function adjustUserCreditsInDb(input: { delta: number; reason: string; userId: string }) {
  const client = createStudioAdminClient();
  const org = await resolveUserOrg(client, input.userId);
  if (!org) {
    return null;
  }

  const currentCredits = Number(org.credits ?? 0);
  const updatedCredits = Math.max(0, currentCredits + input.delta);
  const appliedDelta = updatedCredits - currentCredits;

  const updateResponse = await client
    .from("orgs")
    .update({ credits: updatedCredits })
    .eq("id", org.id)
    .select("credits")
    .maybeSingle<{ credits: number }>();

  if (updateResponse.error) {
    throw new Error(updateResponse.error.message);
  }

  const insertResponse = await client
    .from("credit_transactions")
    .insert({
      amount: appliedDelta,
      description: input.reason,
      org_id: org.id,
      type: "manual_admin",
    });

  if (insertResponse.error) {
    const rollbackResponse = await client
      .from("orgs")
      .update({ credits: currentCredits })
      .eq("id", org.id);

    if (rollbackResponse.error) {
      console.error("[admin/users] failed to rollback credits after ledger insert failure:", rollbackResponse.error.message);
    }

    throw new Error(insertResponse.error.message);
  }

  return {
    credits: Number(updateResponse.data?.credits ?? updatedCredits),
  };
}

export function createAdminUsersRoute(deps: AdminUsersRouteDeps = {}) {
  const adminUsersRoute = new Hono();
  const authMiddleware = deps.authMiddleware ?? verifyPlatformJwt;
  const loadOrgContextMiddleware = deps.loadOrgContextMiddleware ?? loadOrgContext;
  const requireAdminMiddleware = deps.requireAdminMiddleware ?? requireAdmin;
  const listUsers = deps.listUsers ?? listUsersFromDb;
  const getUserCreditHistory = deps.getUserCreditHistory ?? getUserCreditHistoryFromDb;
  const adjustUserCredits = deps.adjustUserCredits ?? adjustUserCreditsInDb;

  adminUsersRoute.get("/", authMiddleware, loadOrgContextMiddleware, requireAdminMiddleware, async (c) => {
    try {
      const parsed = listUsersQuerySchema.safeParse({
        limit: c.req.query("limit"),
        page: c.req.query("page"),
        plan: c.req.query("plan"),
        search: c.req.query("search"),
      });

      if (!parsed.success) {
        return c.json({ details: parsed.error.flatten(), error: "Invalid users query." }, 400);
      }

      const result = await listUsers(parsed.data);
      return c.json(result);
    } catch (error) {
      console.error("[GET /admin/users] error:", error);
      return c.json({ error: "Failed to load users." }, 500);
    }
  });

  adminUsersRoute.get("/:id/credits", authMiddleware, loadOrgContextMiddleware, requireAdminMiddleware, async (c) => {
    try {
      const history = await getUserCreditHistory(c.req.param("id"));
      if (!history) {
        return c.json({ error: "User or org not found." }, 404);
      }

      return c.json({ transactions: history });
    } catch (error) {
      console.error("[GET /admin/users/:id/credits] error:", error);
      return c.json({ error: "Failed to load user credit history." }, 500);
    }
  });

  adminUsersRoute.post("/:id/credits", authMiddleware, loadOrgContextMiddleware, requireAdminMiddleware, async (c) => {
    try {
      const body = await c.req.json().catch(() => null);
      const parsed = creditAdjustmentSchema.safeParse(body);
      if (!parsed.success) {
        return c.json({ details: parsed.error.flatten(), error: "Invalid credit adjustment body." }, 400);
      }

      const result = await adjustUserCredits({
        delta: parsed.data.delta,
        reason: parsed.data.reason,
        userId: c.req.param("id"),
      });

      if (!result) {
        return c.json({ error: "User or org not found." }, 404);
      }

      return c.json(result);
    } catch (error) {
      console.error("[POST /admin/users/:id/credits] error:", error);
      return c.json({ error: "Failed to adjust user credits." }, 500);
    }
  });

  return adminUsersRoute;
}

const adminUsersRoute = createAdminUsersRoute();

export default adminUsersRoute;
