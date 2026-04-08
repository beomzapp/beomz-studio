"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTemporalRuntimeConfig = getTemporalRuntimeConfig;
exports.getAnthropicRuntimeConfig = getAnthropicRuntimeConfig;
exports.getTemporalConnectionOptions = getTemporalConnectionOptions;
exports.getTemporalNativeConnectionOptions = getTemporalNativeConnectionOptions;
const node_fs_1 = __importDefault(require("node:fs"));
const zod_1 = require("zod");
const temporalEnvSchema = zod_1.z
    .object({
    TEMPORAL_ADDRESS: zod_1.z.string().min(1),
    TEMPORAL_NAMESPACE: zod_1.z.string().min(1).default("quickstart-beomz-studio"),
    TEMPORAL_TASK_QUEUE: zod_1.z.string().min(1).default("initial-builds"),
    TEMPORAL_API_KEY: zod_1.z.string().min(1).optional(),
    TEMPORAL_TLS_ENABLED: zod_1.z.coerce.boolean().default(true),
    TEMPORAL_TLS_CERT_PATH: zod_1.z.string().min(1).optional(),
    TEMPORAL_TLS_KEY_PATH: zod_1.z.string().min(1).optional(),
    TEMPORAL_SERVER_NAME_OVERRIDE: zod_1.z.string().min(1).optional(),
})
    .superRefine((value, context) => {
    if ((value.TEMPORAL_TLS_CERT_PATH && !value.TEMPORAL_TLS_KEY_PATH)
        || (!value.TEMPORAL_TLS_CERT_PATH && value.TEMPORAL_TLS_KEY_PATH)) {
        context.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            message: "TEMPORAL_TLS_CERT_PATH and TEMPORAL_TLS_KEY_PATH must be provided together.",
        });
    }
});
const ANTHROPIC_DEFAULT_MODEL = "claude-sonnet-4-5-20250929";
const anthropicEnvSchema = zod_1.z.object({
    ANTHROPIC_API_KEY: zod_1.z.string().min(1).optional(),
    ANTHROPIC_BASE_URL: zod_1.z.string().url().default("https://api.anthropic.com"),
    ANTHROPIC_MODEL: zod_1.z.preprocess((value) => {
        if (typeof value !== "string" || value.trim().length === 0) {
            return ANTHROPIC_DEFAULT_MODEL;
        }
        return value.trim() === "claude-3-5-sonnet-latest"
            ? ANTHROPIC_DEFAULT_MODEL
            : value.trim();
    }, zod_1.z.string().min(1)).default(ANTHROPIC_DEFAULT_MODEL),
    ANTHROPIC_MAX_TOKENS: zod_1.z.coerce.number().int().positive().default(4096),
});
function buildTlsConfig(config) {
    if (!config.TEMPORAL_TLS_ENABLED) {
        return false;
    }
    if (!config.TEMPORAL_TLS_CERT_PATH || !config.TEMPORAL_TLS_KEY_PATH) {
        return true;
    }
    const crt = node_fs_1.default.readFileSync(config.TEMPORAL_TLS_CERT_PATH);
    const key = node_fs_1.default.readFileSync(config.TEMPORAL_TLS_KEY_PATH);
    return {
        clientCertPair: {
            crt,
            key,
        },
        serverNameOverride: config.TEMPORAL_SERVER_NAME_OVERRIDE,
    };
}
function getTemporalRuntimeConfig() {
    return temporalEnvSchema.parse(process.env);
}
function getAnthropicRuntimeConfig() {
    return anthropicEnvSchema.parse(process.env);
}
function getTemporalConnectionOptions() {
    const config = getTemporalRuntimeConfig();
    return {
        address: config.TEMPORAL_ADDRESS,
        apiKey: config.TEMPORAL_API_KEY,
        tls: buildTlsConfig(config),
    };
}
function getTemporalNativeConnectionOptions() {
    const config = getTemporalRuntimeConfig();
    return {
        address: config.TEMPORAL_ADDRESS,
        apiKey: config.TEMPORAL_API_KEY,
        tls: buildTlsConfig(config),
    };
}
