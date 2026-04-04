import {
  createClient,
  type PostgrestSingleResponse,
  type SupabaseClient,
} from "@supabase/supabase-js";
import type {
  GenerationStatus,
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

type Json = null | boolean | number | string | { [key: string]: Json | undefined } | Json[];

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
  credits_balance: number;
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
  created_at: string;
  updated_at: string;
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
  session_events: readonly Record<string, unknown>[];
  credits_used: number;
  total_cost_usd: number;
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
  credits_balance?: number;
  created_at?: string;
}

export interface OrgUpdate extends Record<string, unknown> {
  owner_id?: string;
  name?: string;
  plan?: string;
  credits?: number;
  credits_balance?: number;
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
  created_at?: string;
  updated_at?: string;
}

export interface ProjectUpdate extends Record<string, unknown> {
  org_id?: string;
  name?: string;
  template?: TemplateId;
  status?: ProjectStatus;
  created_at?: string;
  updated_at?: string;
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
  session_events?: readonly Record<string, unknown>[];
  credits_used?: number;
  total_cost_usd?: number;
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
  session_events?: readonly Record<string, unknown>[];
  credits_used?: number;
  total_cost_usd?: number;
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

export interface StudioDatabase {
  public: {
    Views: Record<string, never>;
    Functions: {
      append_generation_session_event: {
        Args: {
          next_event: Json;
          target_generation_id: string;
        };
        Returns: void;
      };
      deduct_org_credits_balance: {
        Args: {
          requested_cost: number;
          target_org_id: string;
        };
        Returns: number;
      };
    };
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

async function unwrapSingle<T>(response: PostgrestSingleResponse<T>): Promise<T> {
  if (response.error) {
    throw new Error(response.error.message);
  }

  if (!response.data) {
    throw new Error("Expected a row but none was returned.");
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

  async updateProject(id: string, patch: ProjectUpdate): Promise<ProjectRow> {
    const response = await this.client
      .from("projects")
      .update({
        ...patch,
        updated_at: patch.updated_at ?? new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single();

    return unwrapSingle(response);
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

  async findGenerationById(id: string): Promise<GenerationRow | null> {
    const response = await this.client
      .from("generations")
      .select("*")
      .eq("id", id)
      .maybeSingle();

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

  async updateGeneration(id: string, patch: GenerationUpdate): Promise<GenerationRow> {
    const response = await this.client
      .from("generations")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();

    return unwrapSingle(response);
  }

  async appendGenerationSessionEvent(
    id: string,
    nextEvent: unknown,
  ): Promise<void> {
    const response = await this.client.rpc("append_generation_session_event", {
      next_event: nextEvent as Json,
      target_generation_id: id,
    });

    if (response.error) {
      throw new Error(response.error.message);
    }
  }

  async deductOrgCreditsBalance(id: string, requestedCost: number): Promise<number> {
    const response = await this.client.rpc("deduct_org_credits_balance", {
      requested_cost: requestedCost,
      target_org_id: id,
    });

    if (response.error) {
      throw new Error(response.error.message);
    }

    if (typeof response.data !== "number") {
      throw new Error("Expected deduct_org_credits_balance to return a numeric balance.");
    }

    return response.data;
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
    },
  );

  return new StudioDbClient(client);
}
