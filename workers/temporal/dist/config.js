import fs from "node:fs";
import { z } from "zod";
const temporalEnvSchema = z
    .object({
    TEMPORAL_ADDRESS: z.string().min(1),
    TEMPORAL_NAMESPACE: z.string().min(1).default("quickstart-beomz-studio"),
    TEMPORAL_TASK_QUEUE: z.string().min(1).default("initial-builds"),
    TEMPORAL_API_KEY: z.string().min(1).optional(),
    TEMPORAL_TLS_ENABLED: z.coerce.boolean().default(true),
    TEMPORAL_TLS_CERT_PATH: z.string().min(1).optional(),
    TEMPORAL_TLS_KEY_PATH: z.string().min(1).optional(),
    TEMPORAL_SERVER_NAME_OVERRIDE: z.string().min(1).optional(),
})
    .superRefine((value, context) => {
    if ((value.TEMPORAL_TLS_CERT_PATH && !value.TEMPORAL_TLS_KEY_PATH)
        || (!value.TEMPORAL_TLS_CERT_PATH && value.TEMPORAL_TLS_KEY_PATH)) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "TEMPORAL_TLS_CERT_PATH and TEMPORAL_TLS_KEY_PATH must be provided together.",
        });
    }
});
const ANTHROPIC_DEFAULT_MODEL = "claude-sonnet-4-5-20250929";
const anthropicEnvSchema = z.object({
    ANTHROPIC_API_KEY: z.string().min(1).optional(),
    ANTHROPIC_BASE_URL: z.string().url().default("https://api.anthropic.com"),
    ANTHROPIC_MODEL: z.preprocess((value) => {
        if (typeof value !== "string" || value.trim().length === 0) {
            return ANTHROPIC_DEFAULT_MODEL;
        }
        return value.trim() === "claude-3-5-sonnet-latest"
            ? ANTHROPIC_DEFAULT_MODEL
            : value.trim();
    }, z.string().min(1)).default(ANTHROPIC_DEFAULT_MODEL),
    ANTHROPIC_MAX_TOKENS: z.coerce.number().int().positive().default(4096),
});
function buildTlsConfig(config) {
    if (!config.TEMPORAL_TLS_ENABLED) {
        return false;
    }
    if (!config.TEMPORAL_TLS_CERT_PATH || !config.TEMPORAL_TLS_KEY_PATH) {
        return true;
    }
    const crt = fs.readFileSync(config.TEMPORAL_TLS_CERT_PATH);
    const key = fs.readFileSync(config.TEMPORAL_TLS_KEY_PATH);
    return {
        clientCertPair: {
            crt,
            key,
        },
        serverNameOverride: config.TEMPORAL_SERVER_NAME_OVERRIDE,
    };
}
export function getTemporalRuntimeConfig() {
    return temporalEnvSchema.parse(process.env);
}
export function getAnthropicRuntimeConfig() {
    return anthropicEnvSchema.parse(process.env);
}
export function getTemporalConnectionOptions() {
    const config = getTemporalRuntimeConfig();
    return {
        address: config.TEMPORAL_ADDRESS,
        apiKey: config.TEMPORAL_API_KEY,
        tls: buildTlsConfig(config),
    };
}
export function getTemporalNativeConnectionOptions() {
    const config = getTemporalRuntimeConfig();
    return {
        address: config.TEMPORAL_ADDRESS,
        apiKey: config.TEMPORAL_API_KEY,
        tls: buildTlsConfig(config),
    };
}
