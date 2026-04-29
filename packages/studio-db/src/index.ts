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
  ProjectType,
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
  full_name?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
  building_for?: string | null;
  referral_source?: string | null;
  onboarding_completed?: boolean;
  workspace_knowledge?: string | null;
  referred_by?: string | null;
  email_verified?: boolean;
  last_credits_low_email?: string | null;
  created_at: string;
}

export interface EmailAuthUserRow extends UserRow {
  password_hash?: string | null;
  email_verify_token?: string | null;
  email_verify_expires?: string | null;
  password_reset_token?: string | null;
  password_reset_expires?: string | null;
}

export interface OrgRow extends Record<string, unknown> {
  id: string;
  owner_id: string;
  name: string;
  plan: string;
  credits: number;
  topup_credits: number;
  monthly_credits: number;
  rollover_credits: number;
  rollover_cap: number;
  credits_period_start: string | null;
  credits_period_end: string | null;
  downgrade_at_period_end: boolean;
  pending_plan: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  daily_reset_at: string | null;
  created_at: string;
  neon_project_id?: string | null;
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
  project_type?: ProjectType;
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
  byo_db_url?: string | null;
  byo_db_anon_key?: string | null;
  byo_db_service_key?: string | null;
  supabase_oauth_access_token?: string | null;
  supabase_oauth_refresh_token?: string | null;
  thumbnail_url: string | null;
  // BEO-262: Publish
  published: boolean;
  published_slug: string | null;
  published_at: string | null;
  // Vercel deploy — slug.beomz.app
  beomz_app_url: string | null;
  beomz_app_deployed_at: string | null;
  custom_domains?: string[] | null;
  // BEO-576: active custom domain persisted to DB so state survives page refresh
  custom_domain?: string | null;
  domain_status?: string | null;
  // BEO-197: Phased build system
  build_phases: unknown | null;
  current_phase: number;
  phases_total: number;
  phase_mode: boolean;
  // BEO-710: branch-per-app
  neon_project_id?: string | null;
  neon_branch_id?: string | null;
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
  // BEO-370: chat message history for session restore on hard refresh.
  session_events: readonly Record<string, unknown>[];
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
  input_tokens: number;
  output_tokens: number;
  cost_usd: number | null;
  user_iterated: boolean;
  iteration_count: number;
  model_used: string | null;
  phase_file_diff: Record<string, unknown> | null;
  created_at: string;
}

export interface UserInsert extends Record<string, unknown> {
  id?: string;
  email: string;
  platform_user_id: string;
  full_name?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
  building_for?: string | null;
  referral_source?: string | null;
  onboarding_completed?: boolean;
  workspace_knowledge?: string | null;
  password_hash?: string | null;
  email_verified?: boolean;
  email_verify_token?: string | null;
  email_verify_expires?: string | null;
  password_reset_token?: string | null;
  password_reset_expires?: string | null;
  last_credits_low_email?: string | null;
  created_at?: string;
}

export interface UserUpdate extends Record<string, unknown> {
  email?: string;
  platform_user_id?: string;
  full_name?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
  building_for?: string | null;
  referral_source?: string | null;
  onboarding_completed?: boolean;
  workspace_knowledge?: string | null;
  referred_by?: string | null;
  password_hash?: string | null;
  email_verified?: boolean;
  email_verify_token?: string | null;
  email_verify_expires?: string | null;
  password_reset_token?: string | null;
  password_reset_expires?: string | null;
  last_credits_low_email?: string | null;
}

export interface ReferralCodeRow extends Record<string, unknown> {
  id: string;
  user_id: string;
  code: string;
  created_at: string;
}

export interface ReferralCodeInsert extends Record<string, unknown> {
  id?: string;
  user_id: string;
  code: string;
  created_at?: string;
}

export type ReferralEventType = "signup" | "upgrade";

export interface ReferralEventRow extends Record<string, unknown> {
  id: string;
  referrer_id: string;
  referred_id: string;
  event: ReferralEventType;
  credits_awarded: number;
  signup_ip?: string | null;
  is_vpn?: boolean | null;
  created_at: string;
}

export interface ReferralEventInsert extends Record<string, unknown> {
  id?: string;
  referrer_id: string;
  referred_id: string;
  event: ReferralEventType;
  credits_awarded: number;
  signup_ip?: string | null;
  is_vpn?: boolean | null;
  created_at?: string;
}

export interface RecentActivityRow {
  id: string;
  project_id: string;
  project_name: string;
  created_at: string;
  event_type: string | null;
}

export interface OrgInsert extends Record<string, unknown> {
  id?: string;
  owner_id: string;
  name: string;
  plan?: string;
  credits?: number;
  topup_credits?: number;
  monthly_credits?: number;
  rollover_credits?: number;
  rollover_cap?: number;
  credits_period_start?: string | null;
  credits_period_end?: string | null;
  downgrade_at_period_end?: boolean;
  pending_plan?: string | null;
  created_at?: string;
}

export interface OrgUpdate extends Record<string, unknown> {
  owner_id?: string;
  name?: string;
  plan?: string;
  credits?: number;
  topup_credits?: number;
  monthly_credits?: number;
  rollover_credits?: number;
  rollover_cap?: number;
  credits_period_start?: string | null;
  credits_period_end?: string | null;
  downgrade_at_period_end?: boolean;
  pending_plan?: string | null;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  daily_reset_at?: string | null;
  neon_project_id?: string | null;
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
  project_type?: ProjectType;
  status: ProjectStatus;
  icon?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ProjectUpdate extends Record<string, unknown> {
  org_id?: string;
  name?: string;
  template?: TemplateId;
  project_type?: ProjectType;
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
  byo_db_url?: string | null;
  byo_db_anon_key?: string | null;
  byo_db_service_key?: string | null;
  supabase_oauth_access_token?: string | null;
  supabase_oauth_refresh_token?: string | null;
  thumbnail_url?: string | null;
  // BEO-262: Publish
  published?: boolean;
  published_slug?: string | null;
  published_at?: string | null;
  // Vercel deploy — slug.beomz.app
  beomz_app_url?: string | null;
  beomz_app_deployed_at?: string | null;
  custom_domains?: readonly string[] | null;
  // BEO-576: active custom domain status
  custom_domain?: string | null;
  domain_status?: string | null;
  // BEO-197: Phased build system
  build_phases?: unknown | null;
  current_phase?: number;
  phases_total?: number;
  phase_mode?: boolean;
  // BEO-710: branch-per-app
  neon_project_id?: string | null;
  neon_branch_id?: string | null;
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
  session_events?: readonly Record<string, unknown>[];
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
  session_events?: readonly Record<string, unknown>[];
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
  input_tokens?: number;
  output_tokens?: number;
  cost_usd?: number | null;
  user_iterated?: boolean;
  iteration_count?: number;
  model_used?: string | null;
  phase_file_diff?: Record<string, unknown> | null;
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
  input_tokens?: number;
  output_tokens?: number;
  cost_usd?: number | null;
  user_iterated?: boolean;
  iteration_count?: number;
  model_used?: string | null;
  phase_file_diff?: Record<string, unknown> | null;
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

// BEO-329: Per-project DB storage tiers
export interface ProjectDbLimitsRow extends Record<string, unknown> {
  id: string;
  project_id: string;
  plan_storage_mb: number;
  plan_rows: number;
  tables_limit: number;
  extra_storage_mb: number;
  extra_rows: number;
  neon_project_id: string | null;
  neon_branch_id: string | null;
  db_url: string | null;
  neon_auth_base_url: string | null;
  neon_auth_pub_key: string | null;
  neon_auth_secret_key: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectDbLimitsInsert extends Record<string, unknown> {
  id?: string;
  project_id: string;
  plan_storage_mb?: number;
  plan_rows?: number;
  tables_limit?: number;
  extra_storage_mb?: number;
  extra_rows?: number;
  neon_project_id?: string | null;
  neon_branch_id?: string | null;
  db_url?: string | null;
  neon_auth_base_url?: string | null;
  neon_auth_pub_key?: string | null;
  neon_auth_secret_key?: string | null;
}

export interface ProjectDbLimitsUpdate extends Record<string, unknown> {
  plan_storage_mb?: number;
  plan_rows?: number;
  tables_limit?: number;
  extra_storage_mb?: number;
  extra_rows?: number;
  neon_project_id?: string | null;
  neon_branch_id?: string | null;
  db_url?: string | null;
  neon_auth_base_url?: string | null;
  neon_auth_pub_key?: string | null;
  neon_auth_secret_key?: string | null;
  updated_at?: string;
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
      referral_codes: {
        Row: ReferralCodeRow;
        Insert: ReferralCodeInsert;
        Update: Partial<ReferralCodeInsert>;
        Relationships: [];
      };
      referral_events: {
        Row: ReferralEventRow;
        Insert: ReferralEventInsert;
        Update: Partial<ReferralEventInsert>;
        Relationships: [];
      };
      project_db_limits: {
        Row: ProjectDbLimitsRow;
        Insert: ProjectDbLimitsInsert;
        Update: ProjectDbLimitsUpdate;
        Relationships: [];
      };
    };
  };
}

export type StudioSupabaseClient = SupabaseClient<StudioDatabase>;

function toPublicUserRow(row: Record<string, unknown> | null | undefined): UserRow | null {
  if (!row) {
    return null;
  }

  const hasLastCreditsLowEmail = Object.prototype.hasOwnProperty.call(row, "last_credits_low_email");

  return {
    id: String(row.id),
    platform_user_id: String(row.platform_user_id),
    email: String(row.email),
    full_name: typeof row.full_name === "string" ? row.full_name : null,
    avatar_url: typeof row.avatar_url === "string" ? row.avatar_url : null,
    referred_by: typeof row.referred_by === "string" ? row.referred_by : null,
    email_verified: typeof row.email_verified === "boolean" ? row.email_verified : undefined,
    last_credits_low_email: hasLastCreditsLowEmail
      ? (typeof row.last_credits_low_email === "string" ? row.last_credits_low_email : null)
      : undefined,
    created_at: String(row.created_at),
  };
}

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

    return toPublicUserRow(response.data);
  }

  async createUser(
    input: UserInsert,
  ): Promise<UserRow> {
    const response = await this.client
      .from("users")
      .insert(input)
      .select("*")
      .single();

    return toPublicUserRow(await unwrapSingle(response))!;
  }

  async findUserById(id: string): Promise<UserRow | null> {
    const response = await this.client
      .from("users")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (response.error) {
      throw new Error(response.error.message);
    }

    return toPublicUserRow(response.data);
  }

  async updateUserEmail(id: string, email: string): Promise<UserRow> {
    return this.updateUser(id, { email });
  }

  async updateUser(id: string, patch: UserUpdate): Promise<UserRow> {
    const response = await this.client
      .from("users")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();

    return toPublicUserRow(await unwrapSingle(response))!;
  }

  async findUserByEmail(email: string): Promise<UserRow | null> {
    const response = await this.client
      .from("users")
      .select("*")
      .eq("email", email)
      .limit(1)
      .maybeSingle();

    if (response.error) {
      throw new Error(response.error.message);
    }

    return toPublicUserRow(response.data);
  }

  async findEmailAuthUserByEmail(email: string): Promise<EmailAuthUserRow | null> {
    const response = await this.client
      .from("users")
      .select("*")
      .eq("email", email)
      .limit(1)
      .maybeSingle<EmailAuthUserRow>();

    if (response.error) {
      throw new Error(response.error.message);
    }

    return response.data;
  }

  async findEmailAuthUserByVerifyToken(token: string): Promise<EmailAuthUserRow | null> {
    const response = await this.client
      .from("users")
      .select("*")
      .eq("email_verify_token", token)
      .limit(1)
      .maybeSingle<EmailAuthUserRow>();

    if (response.error) {
      throw new Error(response.error.message);
    }

    return response.data;
  }

  async findEmailAuthUserByResetToken(token: string): Promise<EmailAuthUserRow | null> {
    const response = await this.client
      .from("users")
      .select("*")
      .eq("password_reset_token", token)
      .limit(1)
      .maybeSingle<EmailAuthUserRow>();

    if (response.error) {
      throw new Error(response.error.message);
    }

    return response.data;
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

  async findPrimaryOrgByUserId(userId: string): Promise<OrgRow | null> {
    const membershipResponse = await this.client
      .from("org_members")
      .select("org_id, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle<{ org_id: string; created_at: string }>();

    if (membershipResponse.error) {
      throw new Error(membershipResponse.error.message);
    }

    const orgId = membershipResponse.data?.org_id;
    if (orgId) {
      return this.findOrgById(orgId);
    }

    const orgResponse = await this.client
      .from("orgs")
      .select("*")
      .eq("owner_id", userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (orgResponse.error) {
      throw new Error(orgResponse.error.message);
    }

    return orgResponse.data;
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

  async notifySchemaReload(): Promise<void> {
    await attemptPostgrestSchemaReload(this.client);
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

  async findLatestCompletedGenerationByProjectId(projectId: string): Promise<GenerationRow | null> {
    const response = await this.client
      .from("generations")
      .select("*")
      .eq("project_id", projectId)
      .eq("status", "completed")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (response.error) {
      throw new Error(response.error.message);
    }

    return response.data;
  }

  /**
   * Given a build ID that can no longer be resolved, tries to find the most
   * recent *completed* generation for the same project. Used by the SSE events
   * endpoint to return 410 Gone (build superseded) instead of a bare 404 when
   * the client reconnects with a stale build ID.
   *
   * Returns null if the build ID has no associated project or if no completed
   * sibling generation exists.
   */
  async findLatestCompletedGenerationForProject(buildId: string): Promise<GenerationRow | null> {
    const projectRes = await this.client
      .schema("public")
      .from("generations")
      .select("project_id")
      .eq("id", buildId)
      .maybeSingle();

    if (projectRes.error || !projectRes.data?.project_id) {
      return null;
    }

    const latestRes = await this.client
      .schema("public")
      .from("generations")
      .select("*")
      .eq("project_id", projectRes.data.project_id)
      .eq("status", "completed")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestRes.error) {
      return null;
    }

    return latestRes.data;
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
    const runUpsert = async (payload: BuildTelemetryInsert) => this.client
      .from("build_telemetry")
      .upsert(payload, {
        onConflict: "id",
      })
      .select("*")
      .single();

    let payload = input;
    let response = await runUpsert(payload);

    if (response.error && /input_tokens/i.test(response.error.message)) {
      await attemptPostgrestSchemaReload(this.client).catch(() => undefined);
      response = await runUpsert(payload);

      if (response.error && /input_tokens/i.test(response.error.message)) {
        const { input_tokens: _ignoredInputTokens, ...fallbackInput } = payload;
        payload = fallbackInput;
        response = await runUpsert(payload);
      }
    }

    if (response.error && /build_telemetry_user_id_fkey/i.test(response.error.message)) {
      payload = {
        ...payload,
        user_id: null,
      };
      response = await runUpsert({
        ...payload,
      });
    }

    return unwrapSingle(response);
  }

  async getOrgWithBalance(orgId: string): Promise<OrgRow | null> {
    const response = await this.client
      .from("orgs")
      .select("id,owner_id,name,plan,credits,topup_credits,monthly_credits,rollover_credits,rollover_cap,credits_period_start,credits_period_end,downgrade_at_period_end,pending_plan,stripe_customer_id,stripe_subscription_id,daily_reset_at,created_at")
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

  /**
   * Billing cycle reset with rollover calculation.
   * Called on invoice.payment_succeeded for subscription renewals.
   * Rollover = unused non-topup credits from previous period, capped by rollover_cap.
   */
  async resetOrgBillingCycle(
    orgId: string,
    monthlyAllocation: number,
    rolloverCap: number,
    periodStart: string,
    periodEnd: string,
  ): Promise<void> {
    const org = await this.getOrgWithBalance(orgId);
    const oldCredits = org?.credits ?? 0;

    const newRollover = Math.min(Math.max(0, oldCredits), rolloverCap);
    const newTotal = monthlyAllocation + newRollover;
    const now = new Date().toISOString();

    await this.updateOrg(orgId, {
      monthly_credits: monthlyAllocation,
      rollover_credits: newRollover,
      rollover_cap: rolloverCap,
      credits: newTotal,
      credits_period_start: periodStart,
      credits_period_end: periodEnd,
      downgrade_at_period_end: false,
      pending_plan: null,
    });

    await this.client
      .from("credit_transactions")
      .insert({
        org_id: orgId,
        amount: newTotal,
        type: "subscription_reset",
        description: `Monthly credit refresh (${monthlyAllocation} new + ${newRollover} rollover)`,
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

  async findReferralCodeByUserId(userId: string): Promise<ReferralCodeRow | null> {
    const response = await this.client
      .from("referral_codes")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (response.error) {
      throw new Error(response.error.message);
    }

    return response.data;
  }

  async findReferralCodeByCode(code: string): Promise<ReferralCodeRow | null> {
    const response = await this.client
      .from("referral_codes")
      .select("*")
      .eq("code", code)
      .limit(1)
      .maybeSingle();

    if (response.error) {
      throw new Error(response.error.message);
    }

    return response.data;
  }

  async createReferralCode(input: ReferralCodeInsert): Promise<ReferralCodeRow | null> {
    const response = await this.client
      .from("referral_codes")
      .insert(input)
      .select("*")
      .maybeSingle();

    if (response.error) {
      if (response.error.code === "23505") {
        return null;
      }
      throw new Error(response.error.message);
    }

    return response.data;
  }

  async listReferralEventsByReferrerId(referrerId: string): Promise<ReferralEventRow[]> {
    const response = await this.client
      .from("referral_events")
      .select("*")
      .eq("referrer_id", referrerId)
      .order("created_at", { ascending: false });

    if (response.error) {
      throw new Error(response.error.message);
    }

    return response.data ?? [];
  }

  async countReferralEventsByReferrerId(
    referrerId: string,
    event: ReferralEventType,
  ): Promise<number> {
    const response = await this.client
      .from("referral_events")
      .select("id", { count: "exact", head: true })
      .eq("referrer_id", referrerId)
      .eq("event", event)
      .gt("credits_awarded", 0);

    if (response.error) {
      throw new Error(response.error.message);
    }

    return response.count ?? 0;
  }

  async hasReferralEvent(
    referrerId: string,
    referredId: string,
    event: ReferralEventType,
  ): Promise<boolean> {
    const response = await this.client
      .from("referral_events")
      .select("id", { count: "exact", head: true })
      .eq("referrer_id", referrerId)
      .eq("referred_id", referredId)
      .eq("event", event);

    if (response.error) {
      throw new Error(response.error.message);
    }

    return (response.count ?? 0) > 0;
  }

  async createReferralEvent(input: ReferralEventInsert): Promise<ReferralEventRow> {
    const response = await this.client
      .from("referral_events")
      .insert(input)
      .select("*")
      .single();

    return unwrapSingle(response);
  }

  async listRecentActivityByOrgId(orgId: string, limit: number): Promise<RecentActivityRow[]> {
    const normalizedLimit = Math.max(1, limit);
    const projects = await this.findProjectsByOrgId(orgId);
    if (projects.length === 0) {
      return [];
    }

    const projectIds = projects.map((project) => project.id);
    const projectsById = new Map(projects.map((project) => [project.id, project]));
    const generationResponse = await this.client
      .from("generations")
      .select("id, project_id, operation_id, started_at, completed_at")
      .in("project_id", projectIds)
      .eq("status", "completed")
      .order("started_at", { ascending: false })
      .limit(Math.max(10, normalizedLimit * 5));

    if (generationResponse.error) {
      throw new Error(generationResponse.error.message);
    }

    const generationActivity = (generationResponse.data ?? []).flatMap((row) => {
      const projectId = String(row.project_id);
      const project = projectsById.get(projectId);
      if (!project) return [];

      return [{
        id: String(row.id),
        project_id: projectId,
        project_name: project.name,
        created_at: typeof row.completed_at === "string" ? row.completed_at : String(row.started_at),
        event_type: row.operation_id === "projectIteration" ? "iteration_complete" : "build_complete",
      } satisfies RecentActivityRow];
    });

    const publishedActivity = projects.flatMap((project) => {
      if (!project.published || !project.published_at) {
        return [];
      }

      return [{
        id: `${project.id}:published`,
        project_id: project.id,
        project_name: project.name,
        created_at: project.published_at,
        event_type: "published",
      } satisfies RecentActivityRow];
    });

    return [...generationActivity, ...publishedActivity]
      .sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at))
      .slice(0, normalizedLimit);
  }

  // ── BEO-329: Project DB limits ────────────────────────────────────────────

  async insertProjectDbLimits(
    projectId: string,
    storageMb: number,
    rows: number,
    tables: number,
    options?: { neonProjectId?: string | null; dbUrl?: string | null },
  ): Promise<ProjectDbLimitsRow> {
    const response = await this.client
      .from("project_db_limits")
      .insert({
        project_id: projectId,
        plan_storage_mb: storageMb,
        plan_rows: rows,
        tables_limit: tables,
        extra_storage_mb: 0,
        extra_rows: 0,
        neon_project_id: options?.neonProjectId ?? null,
        db_url: options?.dbUrl ?? null,
      })
      .select("*")
      .single();
    return unwrapSingle(response);
  }

  async getProjectDbLimits(projectId: string): Promise<ProjectDbLimitsRow | null> {
    const response = await this.client
      .from("project_db_limits")
      .select("*")
      .eq("project_id", projectId)
      .maybeSingle();
    if (response.error) throw new Error(response.error.message);
    return response.data;
  }

  async updateProjectDbPlanLimits(
    projectId: string,
    patch: { plan_storage_mb: number; plan_rows: number; tables_limit: number },
  ): Promise<void> {
    const response = await this.client
      .from("project_db_limits")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("project_id", projectId);
    if (response.error) throw new Error(response.error.message);
  }

  async incrementProjectDbExtraLimits(
    projectId: string,
    extraStorageMb: number,
    extraRows: number,
  ): Promise<void> {
    const existing = await this.getProjectDbLimits(projectId);
    if (!existing) {
      console.warn("[studio-db] incrementProjectDbExtraLimits: no limits row for project", projectId);
      return;
    }
    const response = await this.client
      .from("project_db_limits")
      .update({
        extra_storage_mb: existing.extra_storage_mb + extraStorageMb,
        extra_rows: existing.extra_rows + extraRows,
        updated_at: new Date().toISOString(),
      })
      .eq("project_id", projectId);
    if (response.error) throw new Error(response.error.message);
  }

  async updateProjectDbConnection(
    projectId: string,
    patch: {
      neon_project_id?: string | null;
      neon_branch_id?: string | null;
      db_url?: string | null;
      neon_auth_base_url?: string | null;
      neon_auth_pub_key?: string | null;
      neon_auth_secret_key?: string | null;
    },
  ): Promise<void> {
    const response = await this.client
      .from("project_db_limits")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("project_id", projectId);
    if (response.error) throw new Error(response.error.message);
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
