import type { ConnectionOptions } from "@temporalio/client";
import type { NativeConnectionOptions } from "@temporalio/worker";
import { z } from "zod";
declare const temporalEnvSchema: z.ZodEffects<z.ZodObject<{
    TEMPORAL_ADDRESS: z.ZodString;
    TEMPORAL_NAMESPACE: z.ZodDefault<z.ZodString>;
    TEMPORAL_TASK_QUEUE: z.ZodDefault<z.ZodString>;
    TEMPORAL_API_KEY: z.ZodOptional<z.ZodString>;
    TEMPORAL_TLS_ENABLED: z.ZodDefault<z.ZodBoolean>;
    TEMPORAL_TLS_CERT_PATH: z.ZodOptional<z.ZodString>;
    TEMPORAL_TLS_KEY_PATH: z.ZodOptional<z.ZodString>;
    TEMPORAL_SERVER_NAME_OVERRIDE: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    TEMPORAL_ADDRESS: string;
    TEMPORAL_NAMESPACE: string;
    TEMPORAL_TASK_QUEUE: string;
    TEMPORAL_TLS_ENABLED: boolean;
    TEMPORAL_API_KEY?: string | undefined;
    TEMPORAL_TLS_CERT_PATH?: string | undefined;
    TEMPORAL_TLS_KEY_PATH?: string | undefined;
    TEMPORAL_SERVER_NAME_OVERRIDE?: string | undefined;
}, {
    TEMPORAL_ADDRESS: string;
    TEMPORAL_NAMESPACE?: string | undefined;
    TEMPORAL_TASK_QUEUE?: string | undefined;
    TEMPORAL_API_KEY?: string | undefined;
    TEMPORAL_TLS_ENABLED?: boolean | undefined;
    TEMPORAL_TLS_CERT_PATH?: string | undefined;
    TEMPORAL_TLS_KEY_PATH?: string | undefined;
    TEMPORAL_SERVER_NAME_OVERRIDE?: string | undefined;
}>, {
    TEMPORAL_ADDRESS: string;
    TEMPORAL_NAMESPACE: string;
    TEMPORAL_TASK_QUEUE: string;
    TEMPORAL_TLS_ENABLED: boolean;
    TEMPORAL_API_KEY?: string | undefined;
    TEMPORAL_TLS_CERT_PATH?: string | undefined;
    TEMPORAL_TLS_KEY_PATH?: string | undefined;
    TEMPORAL_SERVER_NAME_OVERRIDE?: string | undefined;
}, {
    TEMPORAL_ADDRESS: string;
    TEMPORAL_NAMESPACE?: string | undefined;
    TEMPORAL_TASK_QUEUE?: string | undefined;
    TEMPORAL_API_KEY?: string | undefined;
    TEMPORAL_TLS_ENABLED?: boolean | undefined;
    TEMPORAL_TLS_CERT_PATH?: string | undefined;
    TEMPORAL_TLS_KEY_PATH?: string | undefined;
    TEMPORAL_SERVER_NAME_OVERRIDE?: string | undefined;
}>;
declare const anthropicEnvSchema: z.ZodObject<{
    ANTHROPIC_API_KEY: z.ZodOptional<z.ZodString>;
    ANTHROPIC_BASE_URL: z.ZodDefault<z.ZodString>;
    ANTHROPIC_MODEL: z.ZodDefault<z.ZodEffects<z.ZodString, string, unknown>>;
    ANTHROPIC_MAX_TOKENS: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    ANTHROPIC_BASE_URL: string;
    ANTHROPIC_MODEL: string;
    ANTHROPIC_MAX_TOKENS: number;
    ANTHROPIC_API_KEY?: string | undefined;
}, {
    ANTHROPIC_API_KEY?: string | undefined;
    ANTHROPIC_BASE_URL?: string | undefined;
    ANTHROPIC_MODEL?: unknown;
    ANTHROPIC_MAX_TOKENS?: number | undefined;
}>;
export type TemporalRuntimeConfig = z.infer<typeof temporalEnvSchema>;
export type AnthropicRuntimeConfig = z.infer<typeof anthropicEnvSchema>;
export declare function getTemporalRuntimeConfig(): TemporalRuntimeConfig;
export declare function getAnthropicRuntimeConfig(): AnthropicRuntimeConfig;
export declare function getTemporalConnectionOptions(): ConnectionOptions;
export declare function getTemporalNativeConnectionOptions(): NativeConnectionOptions;
export {};
