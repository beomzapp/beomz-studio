import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

import { apiConfig } from "../config.js";

type FeatureFlagValue =
  | null
  | boolean
  | number
  | string
  | FeatureFlagValue[]
  | { [key: string]: FeatureFlagValue };

interface FeatureFlagRow {
  key: string;
  updated_at: string | null;
  value: unknown;
}

export const MODULE_FLAG_STATUSES = ["live", "coming_soon", "disabled"] as const;

const moduleFlagStatusSchema = z.enum(MODULE_FLAG_STATUSES);

export const moduleFeatureFlagsSchema = z.object({
  agents: moduleFlagStatusSchema,
  images: moduleFlagStatusSchema,
  mobile_apps: moduleFlagStatusSchema,
  videos: moduleFlagStatusSchema,
  web_apps: moduleFlagStatusSchema,
  websites: moduleFlagStatusSchema,
}).strict();

export type ModuleFeatureFlags = z.infer<typeof moduleFeatureFlagsSchema>;
export type FeatureFlagsMap = Record<string, unknown>;

interface FeatureFlagsValidationDetails {
  fieldErrors: Record<string, string[] | undefined>;
  formErrors: string[];
}

export const DEFAULT_MODULE_FEATURE_FLAGS: ModuleFeatureFlags = {
  agents: "live",
  images: "coming_soon",
  mobile_apps: "coming_soon",
  videos: "coming_soon",
  web_apps: "live",
  websites: "live",
};

const featureFlagValueSchema: z.ZodType<FeatureFlagValue> = z.lazy(() => z.union([
  z.null(),
  z.boolean(),
  z.number(),
  z.string(),
  z.array(featureFlagValueSchema),
  z.record(featureFlagValueSchema),
]));

const featureFlagsPatchSchema = z.record(featureFlagValueSchema);

function createStudioFeatureFlagsClient() {
  return createClient(apiConfig.STUDIO_SUPABASE_URL, apiConfig.STUDIO_SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function normalizeModulesFeatureFlags(value: unknown): ModuleFeatureFlags {
  const parsed = moduleFeatureFlagsSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_MODULE_FEATURE_FLAGS;
}

function normalizeFeatureFlags(rows: FeatureFlagRow[]): FeatureFlagsMap {
  const flags: FeatureFlagsMap = {};

  for (const row of rows) {
    flags[row.key] = row.value;
  }

  flags.modules = normalizeModulesFeatureFlags(flags.modules);
  return flags;
}

export function parseFeatureFlagsPatch(input: unknown):
  | { success: true; data: FeatureFlagsMap }
  | { success: false; error: { details: FeatureFlagsValidationDetails; error: string } } {
  const parsed = featureFlagsPatchSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: {
        details: parsed.error.flatten(),
        error: "Invalid feature flags payload.",
      },
    };
  }

  if (Object.keys(parsed.data).length === 0) {
    return {
      success: false,
      error: {
        details: {
          fieldErrors: {},
          formErrors: ["At least one feature flag update is required."],
        },
        error: "Invalid feature flags payload.",
      },
    };
  }

  if (Object.prototype.hasOwnProperty.call(parsed.data, "modules")) {
    const modulesParsed = moduleFeatureFlagsSchema.safeParse(parsed.data.modules);
    if (!modulesParsed.success) {
      return {
        success: false,
        error: {
          details: modulesParsed.error.flatten(),
          error: "Invalid feature flags payload.",
        },
      };
    }

    parsed.data.modules = modulesParsed.data;
  }

  return {
    success: true,
    data: parsed.data,
  };
}

export async function listFeatureFlagsFromDb(): Promise<FeatureFlagsMap> {
  const client = createStudioFeatureFlagsClient();
  const response = await client
    .from("feature_flags")
    .select("key,value,updated_at")
    .order("key", { ascending: true });

  if (response.error) {
    throw new Error(response.error.message);
  }

  return normalizeFeatureFlags((response.data ?? []) as FeatureFlagRow[]);
}

export async function getModulesFeatureFlagsFromDb(): Promise<ModuleFeatureFlags> {
  const client = createStudioFeatureFlagsClient();
  const response = await client
    .from("feature_flags")
    .select("value")
    .eq("key", "modules")
    .maybeSingle<{ value: FeatureFlagValue }>();

  if (response.error) {
    throw new Error(response.error.message);
  }

  return normalizeModulesFeatureFlags(response.data?.value);
}

export async function updateFeatureFlagsInDb(input: FeatureFlagsMap): Promise<FeatureFlagsMap> {
  const client = createStudioFeatureFlagsClient();
  const updatedAt = new Date().toISOString();

  const response = await client
    .from("feature_flags")
    .upsert(
      Object.entries(input).map(([key, value]) => ({
        key,
        updated_at: updatedAt,
        value,
      })),
      { onConflict: "key" },
    );

  if (response.error) {
    throw new Error(response.error.message);
  }

  return listFeatureFlagsFromDb();
}
