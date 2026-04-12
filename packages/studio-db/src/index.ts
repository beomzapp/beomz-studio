import { setTimeout as delay } from "node:timers/promises";

import {
  createClient,
  type PostgrestSingleResponse,
  type SupabaseClient,
} from "@supabase/supabase-js";
import type {
  ClarifyQuestion,
  GenerationStatus,
  PlanPhase,
  PlanStep,
  PreviewSessionStatus,
  ProjectStatus,
  StudioFile,
  TemplateId,
} from "@beomz-studio/contracts";
import { z } from "zod";

const envSchema = z.object({
  STUDIO_SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  STUDIO_SUPABASE_URL: z.string().url(),
});

const studioDbConfig = envSchema.parse(process.env);
const GENERATIONS_SCHEMA_CACHE_RETRY_DELAY_MS = 750;

export interface UserRow extends Record<string, unknown> {
  id: string;
  platform_user_id: string;
  email: string;
  created_at: string;
}

export interface OrgRow extends Record<string, unknown> {
  id: string;
  owner_id: string;
  name: string;
  plan: string;
  credits: number;
  topup_credits: number;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  daily_reset_at: string | null;
  created_at: string;
}

export interface OrgMembershipRow extends Record<string, unknown> {
  org_id: string;
  user_id: string;
  role: string;
  created_at: string;
}

export interface ProjectRow extends Record<string, unknown> {
  id: string;
  org_id: string;
  name: string;
  template: TemplateId;
  status: ProjectStatus;
  icon: string | null;
  created_at: string;
  updated_at: string;
  last_opened_at: string | null;
  // BEO-130: built-in DB + BYO Supabase
  database_enabled: boolean;
  db_schema: string | null;
  db_nonce: string | null;
  db_provider: string | null;
  db_config: Record<string, unknown> | null;
  db_wired: boolean;
  thumbnail_url: string | null;
  // BEO-262: Publish
  published: boolean;
  published_slug: string | null;
  published_at: string | null;
}

export interface GenerationRow extends Record<string, unknown> {
  id: string;
  project_id: string;
  template_id: TemplateId;
  operation_id: string;
  status: GenerationStatus;
  prompt: string;
  started_at: string;
  completed_at: string | null;
  output_paths: readonly string[];
  summary: string | null;
  error: string | null;
  preview_entry_path: string | null;
  warnings: readonly string[];
  files: readonly StudioFile[];
  metadata: Record<string, unknown>;
}

export interface PreviewRow extends Record<string, unknown> {
  id: string;
  generation_id: string;
  sandbox_id: string | null;
  status: PreviewSessionStatus;
  preview_url: string | null;
  started_at: string;
  expires_at: string | null;
  error: string | null;
}

export interface PlanSessionRow extends Record<string, unknown> {
  id: string;
  user_id: string;
  prompt: string;
  phase: PlanPhase;
  questions: readonly ClarifyQuestion[] | null;
  answers: Record<string, string>;
  summary: string | null;
  steps: readonly PlanStep[] | null;
  created_at: string;
  updated_at: string;
}

export interface BuildTelemetryRow extends Record<string, unknown> {
  id: string;
  project_id: string;
  user_id: string | null;
  prompt: string;
  template_used: string;
  palette_used: string | null;
  files_generated: number;
  succeeded: boolean;
  fallback_reason: string | null;
  error_log: Record<string, unknown> | null;
  generation_time_ms: number | null;
  credits_used: number;
  output_tokens: number;
  cost_usd: number | null;
  user_iterated: boolean;
  iteration_count: number;
  model_used: string | null;
  created_at: string;
}

export interface UserInsert extends Record<string, unknown> {
  id?: string;
  email: string;
  platform_user_id: string;
  created_at?: string;
}

export interface UserUpdate extends Record<string, unknown> {
  email?: string;
  platform_user_id?: string;
}

export interface OrgInsert extends Record<string, unknown> {
  id?: string;
  owner_id: string;
  name: string;
  plan?: string;
  credits?: number;
  topup_credits?: number;
  created_at?: string;
}

export interface OrgUpdate extends Record<string, unknown> {
  owner_id?: string;
  name?: string;
  plan?: string;
  credits?: number;
  topup_credits?: number;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  daily_reset_at?: string | null;
}

export interface OrgMembershipInsert extends Record<string, unknown> {
  org_id: string;
  user_id: string;
  role: string;
  created_at?: string;
}

export interface OrgMembershipUpdate extends Record<string, unknown> {
  org_id?: string;
  user_id?: string;
  role?: string;
}

export interface ProjectInsert extends Record<string, unknown> {
  id?: string;
  org_id: string;
  name: string;
  template: TemplateId;
  status: ProjectStatus;
  icon?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ProjectUpdate extends Record<string, unknown> {
  org_id?: string;
  name?: string;
  template?: TemplateId;
  status?: ProjectStatus;
  icon?: string | null;
  created_at?: string;
  updated_at?: string;
  last_opened_at?: string | null;
  // BEO-130: built-in DB + BYO Supabase
  database_enabled?: boolean;
  db_schema?: string | null;
  db_nonce?: string | null;
  db_provider?: string | null;
  db_config?: Record<string, unknown> | null;
  db_wired?: boolean;
  thumbnail_url?: string | null;
  // BEO-262: Publish
  published?: boolean;
  published_slug?: string | null;
  published_at?: string | null;
}

export interface GenerationInsert extends Record<string, unknown> {
  id?: string;
  project_id: string;
  template_id: TemplateId;
  operation_id: string;
  status: GenerationStatus;
  prompt: string;
  started_at?: string;
  completed_at?: string | null;
  output_paths?: readonly string[];
  summary?: string | null;
  error?: string | null;
  preview_entry_path?: string | null;
  warnings?: readonly string[];
  files?: readonly StudioFile[];
  metadata?: Record<string, unknown>;
}

export interface GenerationUpdate extends Record<string, unknown> {
  project_id?: string;
  template_id?: TemplateId;
  operation_id?: string;
  status?: GenerationStatus;
  prompt?: string;
  started_at?: string;
  completed_at?: string | null;
  output_paths?: readonly string[];
  summary?: string | null;
  error?: string | null;
  preview_entry_path?: string | null;
  warnings?: readonly string[];
  files?: readonly StudioFile[];
  metadata?: Record<string, unknown>;
}

export interface PreviewInsert extends Record<string, unknown> {
  id?: string;
  generation_id: string;
  sandbox_id?: string | null;
  status: PreviewSessionStatus;
  preview_url?: string | null;
  started_at?: string;
  expires_at?: string | null;
  error?: string | null;
}

export interface PreviewUpdate extends Record<string, unknown> {
  generation_id?: string;
  sandbox_id?: string | null;
  status?: PreviewSessionStatus;
  preview_url?: string | null;
  started_at?: string;
  expires_at?: string | null;
  error?: string | null;
}

export interface PlanSessionInsert extends Record<string, unknown> {
  id?: string;
  user_id: string;
  prompt: string;
  phase?: PlanPhase;
  questions?: readonly ClarifyQuestion[] | null;
  answers?: Record<string, string>;
  summary?: string | null;
  steps?: readonly PlanStep[] | null;
  created_at?: string;
  updated_at?: string;
}

export interface PlanSessionUpdate extends Record<string, unknown> {
  prompt?: string;
  phase?: PlanPhase;
  questions?: readonly ClarifyQuestion[] | null;
  answers?: Record<string, string>;
  summary?: string | null;
  steps?: readonly PlanStep[] | null;
  updated_at?: string;
}

export interface BuildTelemetryInsert extends Record<string, unknown> {
  id: string;
  project_id: string;
  user_id: string | null;
  prompt: string;
  template_used: string;
  palette_used?: string | null;
  files_generated?: number;
  succeeded: boolean;
  fallback_reason?: string | null;
  error_log?: Record<string, unknown> | null;
  generation_time_ms?: number | null;
  credits_used?: number;
  output_tokens?: number;
  cost_usd?: number | null;
  user_iterated?: boolean;
  iteration_count?: number;
  model_used?: string | null;
  created_at?: string;
}

export interface BuildTelemetryUpdate extends Record<string, unknown> {
  project_id?: string;
  user_id?: string;
  prompt?: string;
  template_used?: string;
  palette_used?: string | null;
  files_generated?: number;
  succeeded?: boolean;
  fallback_reason?: string | null;
  error_log?: Record<string, unknown> | null;
  generation_time_ms?: number | null;
  credits_used?: number;
  output_tokens?: number;
  cost_usd?: number | null;
  user_iterated?: boolean;
  iteration_count?: number;
  model_used?: string | null;
  created_at?: string;
}

export interface CreditTransactionRow extends Record<string, unknown> {
  id: string;
  org_id: string;
  amount: number;
  type: string;
  build_id: string | null;
  description: string | null;
  stripe_payment_intent_id: string | null;
  created_at: string;
}

export interface CreditTransactionInsert extends Record<string, unknown> {
  id?: string;
  org_id: string;
  amount: number;
  type: string;
  build_id?: string | null;
  description?: string | null;
  stripe_payment_intent_id?: string | null;
  created_at?: string;
}

export interface StudioDatabase {
  public: {
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
    Tables: {
      org_members: {
        Row: OrgMembershipRow;
        Insert: OrgMembershipInsert;
        Update: OrgMembershipUpdate;
        Relationships: [];
      };
      orgs: {
        Row: OrgRow;
        Insert: OrgInsert;
        Update: OrgUpdate;
        Relationships: [];
      };
      projects: {
        Row: ProjectRow;
        Insert: ProjectInsert;
        Update: ProjectUpdate;
        Relationships: [];
      };
      generations: {
        Row: GenerationRow;
        Insert: GenerationInsert;
        Update: GenerationUpdate;
        Relationships: [];
      };
      previews: {
        Row: PreviewRow;
        Insert: PreviewInsert;
        Update: PreviewUpdate;
        Relationships: [];
      };
      build_telemetry: {
        Row: BuildTelemetryRow;
        Insert: BuildTelemetryInsert;
        Update: BuildTelemetryUpdate;
        Relationships: [];
      };
      plan_sessions: {
        Row: PlanSessionRow;
        Insert: PlanSessionInsert;
        Update: PlanSessionUpdate;
        Relationships: [];
      };
      credit_transactions: {
        Row: CreditTransactionRow;
        Insert: CreditTransactionInsert;
        Update: Record<string, unknown>;
        Relationships: [];
      };
      users: {
        Row: UserRow;
        Insert: UserInsert;
        Update: UserUpdate;
        Relationships: [];
      };
    };
  };
}

export type StudioSupabaseClient = SupabaseClient<StudioDatabase>;

function isGenerationsSchemaCacheError(message: string): boolean {
  const normalizedMessage = message.toLowerCase();
  return normalizedMessage.includes("schema cache")
    && normalizedMessage.includes("public.generations");
}

async function attemptPostgrestSchemaReload(
  client: StudioSupabaseClient,
): Promise<void> {
  const response = await (client as SupabaseClient<any>).rpc("notify_reload", {});
  if (response.error) {
    return;
  }
}

async function unwrapSingle<T>(response: PostgrestSingleResponse<T>): Promise<T> {
  if (response.error) {
    throw new Error(response.error.message);
  }

  if (!response.data) {
    throw new Error("Expected a row but none was returned.");
  }

  return response.data;
}

async function unwrapMaybeSingle<T>(response: PostgrestSingleResponse<T>): Promise<T | null> {
  if (response.error) {
    throw new Error(response.error.message);
  }

  return response.data;
}

export class StudioDbClient {
  constructor(private readonly client: StudioSupabaseClient) {}

  async findUserByPlatformUserId(platformUserId: string): Promise<UserRow | null> {
    const response = await this.client
      .from("users")
      .select("*")
      .eq("platform_user_id", platformUserId)
      .maybeSingle();

    if (response.error) {
      throw new Error(response.error.message);
    }

    return response.data;
  }

  async createUser(
    input: UserInsert,
  ): Promise<UserRow> {
    const response = await this.client
      .from("users")
      .insert(input)
      .select("*")
      .single();

    return unwrapSingle(response);
  }

  async updateUserEmail(id: string, email: string): Promise<UserRow> {
    const response = await this.client
      .from("users")
      .update({ email })
      .eq("id", id)
      .select("*")
      .single();

    return unwrapSingle(response);
  }

  async createOrg(
    input: OrgInsert,
  ): Promise<OrgRow> {
    const response = await this.client
      .from("orgs")
      .insert(input)
      .select("*")
      .single();

    return unwrapSingle(response);
  }

  async findOrgById(id: string): Promise<OrgRow | null> {
    const response = await this.client
      .from("orgs")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (response.error) {
      throw new Error(response.error.message);
    }

    return response.data;
  }

  async createOrgMembership(
    input: OrgMembershipInsert,
  ): Promise<OrgMembershipRow> {
    const response = await this.client
      .from("org_members")
      .insert(input)
      .select("*")
      .single();

    return unwrapSingle(response);
  }

  async findMembershipByUserId(userId: string): Promise<OrgMembershipRow | null> {
    const response = await this.client
      .from("org_members")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (response.error) {
      throw new Error(response.error.message);
    }

    return response.data;
  }

  async createProject(
    input: ProjectInsert,
  ): Promise<ProjectRow> {
    const response = await this.client
      .from("projects")
      .insert(input)
      .select("*")
      .single();

    return unwrapSingle(response);
  }

  async findProjectById(id: string): Promise<ProjectRow | null> {
    const response = await this.client
      .from("projects")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (response.error) {
      throw new Error(response.error.message);
    }

    return response.data;
  }

  async findProjectsByOrgId(orgId: string): Promise<ProjectRow[]> {
    const response = await this.client
      .from("projects")
      .select("*")
      .eq("org_id", orgId)
      .order("last_opened_at", { ascending: false, nullsFirst: false })
      .order("updated_at", { ascending: false });

    if (response.error) {
      throw new Error(response.error.message);
    }

    return response.data ?? [];
  }

  async touchProjectLastOpened(id: string): Promise<void> {
    const now = new Date().toISOString();
    // Intentionally ignore errors — non-critical, column may not exist yet
    // if migration 007 hasn't been applied.
    try {
      await this.client
        .from("projects")
        .update({ last_opened_at: now })
        .eq("id", id);
    } catch {
      // no-op
    }
  }

  async countDbEnabledProjectsByOrgId(orgId: string): Promise<number> {
    const response = await this.client
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("database_enabled", true);

    if (response.error) {
      throw new Error(response.error.message);
    }

    return response.count ?? 0;
  }

  async countGenerationsByProjectIds(
    projectIds: string[],
  ): Promise<Record<string, number>> {
    if (projectIds.length === 0) return {};

    const response = await this.client
      .from("generations")
      .select("project_id")
      .in("project_id", projectIds);

    if (response.error) {
      // Non-fatal — return empty counts
      return {};
    }

    const counts: Record<string, number> = {};
    for (const row of response.data ?? []) {
      counts[row.project_id] = (counts[row.project_id] ?? 0) + 1;
    }
    return counts;
  }

  async updateProject(id: string, patch: ProjectUpdate): Promise<ProjectRow | null> {
    const response = await this.client
      .from("projects")
      .update({
        ...patch,
        updated_at: patch.updated_at ?? new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .maybeSingle();

    return unwrapMaybeSingle(response);
  }

  async deleteProject(id: string): Promise<void> {
    const response = await this.client
      .from("projects")
      .delete()
      .eq("id", id);

    if (response.error) {
      throw new Error(response.error.message);
    }
  }

  async createGeneration(
    input: GenerationInsert,
  ): Promise<GenerationRow> {
    const response = await this.client
      .from("generations")
      .insert(input)
      .select("*")
      .single();

    return unwrapSingle(response);
  }

  async findProjectByPublishedSlug(slug: string): Promise<ProjectRow | null> {
    const response = await this.client
      .from("projects")
      .select("*")
      .eq("published_slug", slug)
      .eq("published", true)
      .maybeSingle();

    if (response.error) {
      throw new Error(response.error.message);
    }

    return response.data;
  }

  async findGenerationById(id: string): Promise<GenerationRow | null> {
    const findGeneration = async () => this.client
      .schema("public")
      .from("generations")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    let response = await findGeneration();

    if (response.error && isGenerationsSchemaCacheError(response.error.message)) {
      await attemptPostgrestSchemaReload(this.client).catch(() => undefined);
      await delay(GENERATIONS_SCHEMA_CACHE_RETRY_DELAY_MS);
      response = await findGeneration();
    }

    if (response.error) {
      throw new Error(response.error.message);
    }

    return response.data;
  }

  async findLatestGenerationByProjectId(projectId: string): Promise<GenerationRow | null> {
    const response = await this.client
      .from("generations")
      .select("*")
      .eq("project_id", projectId)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (response.error) {
      throw new Error(response.error.message);
    }

    return response.data;
  }

  async listGenerationsByProjectId(projectId: string): Promise<GenerationRow[]> {
    const response = await this.client
      .from("generations")
      .select("*")
      .eq("project_id", projectId)
      .order("started_at", { ascending: true });

    if (response.error) {
      throw new Error(response.error.message);
    }

    return response.data ?? [];
  }

  async updateGeneration(id: string, patch: GenerationUpdate): Promise<GenerationRow> {
    const response = await this.client
      .from("generations")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();

    return unwrapSingle(response);
  }

  async createPreview(
    input: PreviewInsert,
  ): Promise<PreviewRow> {
    const response = await this.client
      .from("previews")
      .insert(input)
      .select("*")
      .single();

    return unwrapSingle(response);
  }

  async findPreviewById(id: string): Promise<PreviewRow | null> {
    const response = await this.client
      .from("previews")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (response.error) {
      throw new Error(response.error.message);
    }

    return response.data;
  }

  async findPreviewByGenerationId(generationId: string): Promise<PreviewRow | null> {
    const response = await this.client
      .from("previews")
      .select("*")
      .eq("generation_id", generationId)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (response.error) {
      throw new Error(response.error.message);
    }

    return response.data;
  }

  async updatePreview(id: string, patch: PreviewUpdate): Promise<PreviewRow> {
    const response = await this.client
      .from("previews")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();

    return unwrapSingle(response);
  }

  async createPlanSession(
    input: PlanSessionInsert,
  ): Promise<PlanSessionRow> {
    const response = await this.client
      .from("plan_sessions")
      .insert(input)
      .select("*")
      .single();

    return unwrapSingle(response);
  }

  async findPlanSessionById(id: string): Promise<PlanSessionRow | null> {
    const response = await this.client
      .from("plan_sessions")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (response.error) {
      throw new Error(response.error.message);
    }

    return response.data;
  }

  async findLatestActivePlanSessionByUserId(
    userId: string,
    maxAgeMinutes = 30,
  ): Promise<PlanSessionRow | null> {
    const cutoff = new Date(Date.now() - maxAgeMinutes * 60_000).toISOString();
    const response = await this.client
      .from("plan_sessions")
      .select("*")
      .eq("user_id", userId)
      .not("phase", "in", '("approved","idle")')
      .gt("updated_at", cutoff)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (response.error) {
      throw new Error(response.error.message);
    }

    return response.data;
  }

  async updatePlanSession(
    id: string,
    patch: PlanSessionUpdate,
  ): Promise<PlanSessionRow> {
    const response = await this.client
      .from("plan_sessions")
      .update({
        ...patch,
        updated_at: patch.updated_at ?? new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single();

    return unwrapSingle(response);
  }

  async findBuildTelemetryById(id: string): Promise<BuildTelemetryRow | null> {
    const response = await this.client
      .from("build_telemetry")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (response.error) {
      throw new Error(response.error.message);
    }

    return response.data;
  }

  async listBuildTelemetryByProjectId(projectId: string): Promise<BuildTelemetryRow[]> {
    const response = await this.client
      .from("build_telemetry")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true });

    if (response.error) {
      throw new Error(response.error.message);
    }

    return response.data ?? [];
  }

  async upsertBuildTelemetry(
    input: BuildTelemetryInsert,
  ): Promise<BuildTelemetryRow> {
    const response = await this.client
      .from("build_telemetry")
      .upsert(input, {
        onConflict: "id",
      })
      .select("*")
      .single();

    return unwrapSingle(response);
  }

  async getOrgWithBalance(orgId: string): Promise<OrgRow | null> {
    const response = await this.client
      .from("orgs")
      .select("id,owner_id,name,plan,credits,topup_credits,stripe_customer_id,stripe_subscription_id,daily_reset_at,created_at")
      .eq("id", orgId)
      .maybeSingle();

    if (response.error) {
      throw new Error(response.error.message);
    }

    return response.data;
  }

  async updateOrg(orgId: string, patch: OrgUpdate): Promise<OrgRow | null> {
    const response = await this.client
      .from("orgs")
      .update(patch)
      .eq("id", orgId)
      .select("*")
      .maybeSingle();

    return unwrapMaybeSingle(response);
  }

  async findOrgByStripeCustomerId(customerId: string): Promise<OrgRow | null> {
    const response = await this.client
      .from("orgs")
      .select("*")
      .eq("stripe_customer_id", customerId)
      .maybeSingle();

    if (response.error) {
      throw new Error(response.error.message);
    }

    return response.data;
  }

  async applyOrgUsageDeduction(
    orgId: string,
    amount: number,
    buildId?: string,
    description?: string,
  ): Promise<{ deducted: number; credits: number; topup_credits: number }> {
    const response = await (this.client as SupabaseClient<any>).rpc(
      "apply_org_usage_deduction",
      {
        p_org_id: orgId,
        p_amount: amount,
        p_build_id: buildId ?? null,
        p_description: description ?? "App generation",
      },
    );

    if (response.error) {
      throw new Error(response.error.message);
    }

    const row = Array.isArray(response.data) ? response.data[0] : response.data;
    return {
      deducted: Number(row.deducted ?? 0),
      credits: Number(row.credits ?? 0),
      topup_credits: Number(row.topup_credits ?? 0),
    };
  }

  async applyOrgTopupPurchase(
    orgId: string,
    amount: number,
    paymentIntentId: string,
    description?: string,
  ): Promise<boolean> {
    const response = await (this.client as SupabaseClient<any>).rpc(
      "apply_org_topup_purchase",
      {
        p_org_id: orgId,
        p_amount: amount,
        p_payment_intent_id: paymentIntentId,
        p_description: description ?? "Purchased credits",
      },
    );

    if (response.error) {
      throw new Error(response.error.message);
    }

    return Boolean(response.data);
  }

  async resetOrgMonthlyCredits(orgId: string, creditAmount: number): Promise<void> {
    const now = new Date().toISOString();
    await this.updateOrg(orgId, { credits: creditAmount });
    await this.client
      .from("credit_transactions")
      .insert({
        org_id: orgId,
        amount: creditAmount,
        type: "subscription_reset",
        description: "Monthly credit refresh",
        created_at: now,
      });
  }

  async listCreditTransactions(
    orgId: string,
    limit = 50,
  ): Promise<CreditTransactionRow[]> {
    const response = await this.client
      .from("credit_transactions")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (response.error) {
      throw new Error(response.error.message);
    }

    return response.data ?? [];
  }
}

export function createStudioDbClient(): StudioDbClient {
  const client = createClient<StudioDatabase>(
    studioDbConfig.STUDIO_SUPABASE_URL,
    studioDbConfig.STUDIO_SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      db: {
        schema: "public",
      },
    },
  );

  return new StudioDbClient(client);
}
