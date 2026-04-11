import { AnthropicStreamingModel, GenerationEngine, } from "@beomz-studio/engine";
import { projectIterationOperation } from "@beomz-studio/operations";
import { getInitialBuildPromptPolicy, getIterationPromptPolicy, } from "@beomz-studio/prompt-policies";
import { createEmptyBuilderV3TraceMetadata, getColorPalette, normalizeGeneratedPath, } from "@beomz-studio/contracts";
import { createStudioDbClient } from "@beomz-studio/studio-db";
import { APPROVED_GENERATED_IMPORTS, validateGeneratedFileGuardrails, } from "@beomz-studio/validators";
import { getAnthropicRuntimeConfig } from "../config.js";
import { buildGeneratedPageComponentName, buildGeneratedPageFilePath, } from "../shared/paths.js";
import { buildGeneratedScaffoldFiles, buildScaffoldPromptBlock, } from "../shared/generatedSurface.js";
import { buildIterationPromptBlock, buildLayoutFingerprint, classifyIterationIntent, } from "../shared/iterationContext.js";
// ─── Multi-file structured generation via tool_use ────────────────────────────
/**
 * Higher token ceiling for single-call multi-file generation.
 * claude-sonnet-4-5 supports 8 192 output tokens natively; we clamp
 * at 8 192 to stay within the model's hard limit without a beta header.
 */
const MULTI_FILE_MAX_TOKENS = 8192;
/**
 * Tool that forces Anthropic to return ALL page files in one structured call.
 * The `tool_choice: {type:"tool", name:"generate_app_files"}` in the request
 * guarantees the model calls this tool and we get clean JSON, not markdown.
 */
const GENERATE_APP_FILES_TOOL = {
    name: "generate_app_files",
    description: "Submit every generated page file for the app in a single structured call. You MUST call this tool exactly once and include ALL pages listed in the prompt. Do not emit any text outside this tool call.",
    input_schema: {
        type: "object",
        required: ["files"],
        properties: {
            files: {
                type: "array",
                description: "Every page file to generate. Must contain one entry per page ID listed in the prompt. Do not omit any page.",
                items: {
                    type: "object",
                    required: ["pageId", "content"],
                    properties: {
                        pageId: {
                            type: "string",
                            description: "The page ID exactly as given in the template (e.g. 'home', 'tasks', 'pricing').",
                        },
                        content: {
                            type: "string",
                            description: "Complete TSX file contents: all imports, the default-export React component, and nothing else. No markdown fences.",
                        },
                    },
                },
            },
        },
    },
};
// ─── Shared helpers ───────────────────────────────────────────────────────────
const APPROVED_SANDBOX_PACKAGE_RULE = `Approved sandbox packages for generated app code: ${APPROVED_GENERATED_IMPORTS.join(", ")}.`;
const BANNED_SANDBOX_IMPORT_RULE = "Never import from react-icons, @heroicons, or any other package that is not in the approved sandbox package list.";
function buildSystemPrompt(policy, mode) {
    return [
        mode === "iteration"
            ? "You are the Beomz Studio iteration generator."
            : "You are the Beomz Studio initial build generator.",
        policy.systemPrompt,
        "Non-negotiable constraints:",
        ...policy.constraints.map((constraint) => `- ${constraint}`),
        `- ${APPROVED_SANDBOX_PACKAGE_RULE}`,
        `- ${BANNED_SANDBOX_IMPORT_RULE}`,
    ].join("\n");
}
function buildTemplatePageContext(input) {
    return JSON.stringify(input.template.pages.map((page) => ({
        pageId: page.id,
        label: page.name,
        path: buildGeneratedPageFilePath(input.template.id, page.id),
        routePath: page.path,
        summary: page.summary,
    })), null, 2);
}
function buildPalettePromptContext(selection) {
    return JSON.stringify({
        accent: selection.colorPalette.accent,
        background: selection.colorPalette.background,
        bestFor: selection.colorPalette.bestFor,
        label: selection.colorPalette.label,
        palette: selection.colorPalette.id,
        primary: selection.colorPalette.primary,
        reason: selection.reason,
    }, null, 2);
}
function selectPalette(prompt, templateId) {
    const normalized = prompt.toLowerCase();
    const keywordRules = [
        {
            paletteId: "crypto-dark",
            reason: "crypto/web3 context",
            keywords: ["crypto", "web3", "blockchain", "token", "defi", "wallet", "nft"],
        },
        {
            paletteId: "law-navy",
            reason: "formal legal/finance context",
            keywords: ["law", "legal", "attorney", "lawyer", "compliance", "firm"],
        },
        {
            paletteId: "finance-green",
            reason: "finance or budgeting context",
            keywords: ["finance", "money", "budget", "expense", "bookkeeping", "invoice", "accounting", "tax"],
        },
        {
            paletteId: "medical-blue",
            reason: "clinical or medical context",
            keywords: ["medical", "clinic", "doctor", "hospital", "patient", "therapy", "dental", "clinical"],
        },
        {
            paletteId: "energy-red",
            reason: "sport or workout context",
            keywords: ["workout", "gym", "training", "sport", "sports", "athlete", "running", "performance"],
        },
        {
            paletteId: "health-teal",
            reason: "health and wellness context",
            keywords: ["health", "fitness", "wellness", "habit", "nutrition", "mindfulness", "yoga"],
        },
        {
            paletteId: "warm-amber",
            reason: "food and hospitality context",
            keywords: ["food", "restaurant", "recipe", "cook", "cafe", "coffee", "dining", "bakery", "menu"],
        },
        {
            paletteId: "kids-yellow",
            reason: "education or kids context",
            keywords: ["kids", "children", "school", "classroom", "teacher", "toddler", "preschool", "fun learning"],
        },
        {
            paletteId: "midnight-indigo",
            reason: "study, productivity, or focus context",
            keywords: ["study", "planner", "focus", "notes", "productivity", "todo", "task", "calendar"],
        },
        {
            paletteId: "retail-coral",
            reason: "shopping and retail context",
            keywords: ["retail", "shop", "store", "shopping", "deal", "sale", "checkout"],
        },
        {
            paletteId: "rose-pink",
            reason: "beauty, fashion, or lifestyle context",
            keywords: ["beauty", "fashion", "skincare", "cosmetic", "lifestyle", "makeup"],
        },
        {
            paletteId: "ocean-cyan",
            reason: "travel or water-themed context",
            keywords: ["travel", "water", "ocean", "beach", "hotel", "flight", "cruise"],
        },
        {
            paletteId: "nature-emerald",
            reason: "nature and wellness context",
            keywords: ["nature", "plant", "garden", "eco", "sustainability", "green", "meditation"],
        },
        {
            paletteId: "gaming-neon",
            reason: "gaming and entertainment context",
            keywords: ["game", "gaming", "esports", "streaming", "arcade", "entertainment"],
        },
        {
            paletteId: "creative-purple",
            reason: "creative or design context",
            keywords: ["creative", "design", "art", "artist", "agency", "portfolio", "brand studio"],
        },
        {
            paletteId: "startup-violet",
            reason: "startup and modern SaaS context",
            keywords: ["startup", "founder", "launch", "modern saas", "vc", "pitch"],
        },
        {
            paletteId: "professional-blue",
            reason: "business or corporate context",
            keywords: ["business", "saas", "corporate", "crm", "dashboard", "workspace", "b2b", "enterprise"],
        },
        {
            paletteId: "news-charcoal",
            reason: "content and publishing context",
            keywords: ["news", "blog", "article", "editorial", "publishing", "magazine", "media"],
        },
        {
            paletteId: "slate-neutral",
            reason: "minimal and note-taking context",
            keywords: ["minimal", "notes", "docs", "documentation", "knowledge base", "wiki"],
        },
    ];
    for (const rule of keywordRules) {
        if (rule.keywords.some((keyword) => normalized.includes(keyword))) {
            return {
                colorPalette: getColorPalette(rule.paletteId),
                reason: rule.reason,
            };
        }
    }
    const fallbackByTemplateId = {
        "blog-cms": {
            colorPalette: getColorPalette("news-charcoal"),
            reason: "blog templates default to a content-led editorial palette",
        },
        "data-table-app": {
            colorPalette: getColorPalette("professional-blue"),
            reason: "data-heavy apps default to a professional business palette",
        },
        ecommerce: {
            colorPalette: getColorPalette("retail-coral"),
            reason: "ecommerce templates default to a retail-friendly palette",
        },
        "interactive-tool": {
            colorPalette: getColorPalette("warm-orange"),
            reason: "tools default to the warm-orange utility palette",
        },
        "marketing-website": {
            colorPalette: getColorPalette("warm-orange"),
            reason: "marketing sites default to the warm-orange launch palette",
        },
        "mobile-app": {
            colorPalette: getColorPalette("midnight-indigo"),
            reason: "mobile products default to a focused app palette",
        },
        "onboarding-flow": {
            colorPalette: getColorPalette("startup-violet"),
            reason: "onboarding flows default to the startup-violet product palette",
        },
        portfolio: {
            colorPalette: getColorPalette("creative-purple"),
            reason: "portfolios default to a creative palette",
        },
        "saas-dashboard": {
            colorPalette: getColorPalette("professional-blue"),
            reason: "SaaS dashboards default to a professional business palette",
        },
        "social-app": {
            colorPalette: getColorPalette("startup-violet"),
            reason: "social apps default to a modern product palette",
        },
        "workspace-task": {
            colorPalette: getColorPalette("professional-blue"),
            reason: "workspace tools default to a professional operations palette",
        },
    };
    return fallbackByTemplateId[templateId] ?? {
        colorPalette: getColorPalette("warm-orange"),
        reason: "default palette for unmatched prompts",
    };
}
/**
 * Prompt for the SINGLE-CALL path: all pages described in one message,
 * asking the model to call `generate_app_files` with every file at once.
 */
function buildAllPagesUserPrompt(input, paletteSelection) {
    const pageDescriptions = input.template.pages.map((page) => {
        const filePath = buildGeneratedPageFilePath(input.template.id, page.id);
        const componentName = buildGeneratedPageComponentName(input.template.id, page.id);
        return JSON.stringify({
            pageId: page.id,
            name: page.name,
            filePath,
            componentName,
            routePath: page.path,
            kind: page.kind,
            summary: page.summary,
            requiresAuth: page.requiresAuth,
        }, null, 2);
    });
    return [
        `Project name: ${input.project.name}`,
        `Prompt: ${input.plan.normalizedPrompt}`,
        `Intent summary: ${input.plan.intentSummary}`,
        `Template: ${input.template.name}`,
        `Template description: ${input.template.description}`,
        `Template prompt hints: ${input.template.promptHints.join(" | ")}`,
        buildScaffoldPromptBlock(input.template, paletteSelection.colorPalette),
        "Selected color palette:",
        buildPalettePromptContext(paletteSelection),
        "Full template page set — generate ALL of these in a single generate_app_files call:",
        buildTemplatePageContext(input),
        "Rules that apply to EVERY generated page file:",
        "- Import AppShell from the generated scaffold with a default import and wrap the entire route body inside it.",
        "- Use shared generated theme, data, and UI modules. Do NOT recreate sidebar, topbar, footer, or navigation inside a route file.",
        "- Each file must default-export a React component named exactly as specified in the page descriptor above.",
        APPROVED_SANDBOX_PACKAGE_RULE,
        BANNED_SANDBOX_IMPORT_RULE,
        "Individual page descriptors:",
        ...pageDescriptions,
        `Call generate_app_files ONCE with all ${input.template.pages.length} files in the files array. Do not omit any page.`,
    ].join("\n\n");
}
/**
 * Prompt for the PER-PAGE path (parallel fallback): one message per page,
 * identical to the old sequential prompt.
 */
function buildUserPrompt(input, page, paletteSelection) {
    const filePath = buildGeneratedPageFilePath(input.template.id, page.id);
    const componentName = buildGeneratedPageComponentName(input.template.id, page.id);
    return [
        `Project name: ${input.project.name}`,
        `Prompt: ${input.plan.normalizedPrompt}`,
        `Intent summary: ${input.plan.intentSummary}`,
        `Template: ${input.template.name}`,
        `Template description: ${input.template.description}`,
        `Template prompt hints: ${input.template.promptHints.join(" | ")}`,
        buildScaffoldPromptBlock(input.template, paletteSelection.colorPalette),
        "Selected color palette:",
        buildPalettePromptContext(paletteSelection),
        "Full template page set for consistency across navigation and tone:",
        buildTemplatePageContext(input),
        "Generate exactly one standalone TSX page file for this page:",
        JSON.stringify({
            pageId: page.id,
            name: page.name,
            filePath,
            componentName,
            routePath: page.path,
            kind: page.kind,
            summary: page.summary,
            requiresAuth: page.requiresAuth,
        }, null, 2),
        "The page MUST import AppShell from the generated scaffold and wrap route-specific content inside it.",
        "Import AppShell with a default import, not a namespace import.",
        "Use shared generated theme/data/ui modules where helpful. Do not re-create shell navigation, footer, mobile drawer, or topbar inside the route file.",
        APPROVED_SANDBOX_PACKAGE_RULE,
        BANNED_SANDBOX_IMPORT_RULE,
        "Output ONLY the complete TSX file contents for that one page.",
        `The file must default export a React component named ${componentName}.`,
        "Do not return JSON, markdown fences, explanations, or any prose outside the TSX file.",
    ].join("\n\n");
}
function buildIterationUserPrompt(input) {
    const intent = classifyIterationIntent(input.plan.normalizedPrompt);
    const fingerprint = buildLayoutFingerprint(input.template, input.existingFiles);
    return [
        `Project name: ${input.project.name}`,
        `User request: ${input.plan.normalizedPrompt}`,
        `Intent summary: ${input.plan.intentSummary}`,
        `Template: ${input.template.name}`,
        `Template description: ${input.template.description}`,
        buildScaffoldPromptBlock(input.template),
        buildIterationPromptBlock({ fingerprint, intent }),
        "Current files are already mounted in the virtual filesystem and are the source of truth.",
        "Use tool actions to inspect the current app, make the minimum required edits, and finish with a concise summary.",
    ].join("\n\n");
}
// ─── TSX content extraction ───────────────────────────────────────────────────
function extractCodePayload(text) {
    const fencedMatch = text.match(/```(?:tsx|ts|jsx|js)?\s*([\s\S]*?)```/i);
    if (fencedMatch?.[1]) {
        return fencedMatch[1].trim();
    }
    return text.trim();
}
function isLikelyCodeStartLine(line) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
        return false;
    }
    return /^(?:import|export|const|let|var|function|async function|class|type|interface|enum)\b/.test(trimmed)
        || /^(?:["']use\s+\w+["'];?)$/.test(trimmed)
        || /^(?:\/\/|\/\*|\*\/|\*)/.test(trimmed)
        || /^(?:<[A-ZA-Za-z!/]|return\s*\(|return\s*<)/.test(trimmed);
}
function isLikelyCodeEndLine(line) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
        return false;
    }
    return /(?:[;{}])$/.test(trimmed)
        || /(?:\)|\])$/.test(trimmed)
        || /\/>$/.test(trimmed)
        || /^<\/?[A-ZA-z]/.test(trimmed)
        || /^export default\b/.test(trimmed);
}
function stripNonTsxEnvelope(text) {
    const lines = text
        .split(/\r?\n/)
        .map((line) => line.replace(/\s+$/, ""));
    let startIndex = 0;
    while (startIndex < lines.length && lines[startIndex]?.trim().length === 0) {
        startIndex += 1;
    }
    const firstCodeLineIndex = lines.findIndex(isLikelyCodeStartLine);
    if (firstCodeLineIndex !== -1) {
        startIndex = Math.max(startIndex, firstCodeLineIndex);
    }
    let endIndex = lines.length - 1;
    while (endIndex >= startIndex && lines[endIndex]?.trim().length === 0) {
        endIndex -= 1;
    }
    for (let index = endIndex; index >= startIndex; index -= 1) {
        if (isLikelyCodeEndLine(lines[index] ?? "")) {
            endIndex = index;
            break;
        }
    }
    return lines.slice(startIndex, endIndex + 1).join("\n").trim();
}
// ─── Error classification ─────────────────────────────────────────────────────
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function toErrorMessage(error) {
    if (error instanceof Error) {
        return error.message;
    }
    if (typeof error === "string") {
        return error;
    }
    return "Generation failed";
}
function isTransientGenerationError(error) {
    const message = toErrorMessage(error).toLowerCase();
    if (message.length === 0) {
        return false;
    }
    return [
        "connection error.",
        "network error",
        "socket hang up",
        "econnreset",
        "etimedout",
        "fetch failed",
        "upstream connect error",
        "overloaded",
        "temporarily unavailable",
        "stream disconnected",
        "terminated",
        "aborted",
    ].some((needle) => message.includes(needle));
}
function hasBuildValidationSignal(normalizedMessage) {
    return (normalizedMessage.includes("validation failed")
        || normalizedMessage.includes("guardrails failed")
        || normalizedMessage.includes("missing default export")
        || normalizedMessage.includes("missing ")
        || normalizedMessage.includes("empty code content")
        || normalizedMessage.includes("no text content")
        || normalizedMessage.includes("unavailable sandbox package")
        || normalizedMessage.includes("imports a banned package"));
}
function classifyGenerationError(error) {
    const rawMessage = toErrorMessage(error);
    const normalized = rawMessage.toLowerCase();
    if (normalized.includes("unauthorized")
        || normalized.includes("authentication")
        || normalized.includes("invalid x-api-key")
        || normalized.includes("api key")) {
        return {
            code: "auth_required",
            message: rawMessage,
            rawMessage,
        };
    }
    if (hasBuildValidationSignal(normalized)) {
        return {
            code: "build_validation",
            message: rawMessage,
            rawMessage,
        };
    }
    if (normalized.includes("timeout")
        || normalized.includes("timed out")
        || normalized.includes("stalled")
        || normalized.includes("hard timeout")) {
        return {
            code: "upstream_timeout",
            message: "The AI model took too long to respond, so generation could not finish in time.",
            rawMessage,
        };
    }
    if (isTransientGenerationError(error)
        || normalized.includes("connection error")
        || normalized.includes("stream disconnected")) {
        return {
            code: "upstream_connection",
            message: "The AI model connection dropped while generating files.",
            rawMessage,
        };
    }
    return {
        code: "unknown",
        message: rawMessage,
        rawMessage,
    };
}
function combineGenerationErrors(...errors) {
    const messages = errors
        .map((error) => toErrorMessage(error).trim())
        .filter((message, index, all) => message.length > 0 && all.indexOf(message) === index);
    return new Error(messages.join(" | ") || "Generation failed");
}
// ─── Supabase trace helpers ───────────────────────────────────────────────────
function readBuilderTraceMetadata(metadata) {
    const candidate = metadata.builderTrace;
    if (!isRecord(candidate)) {
        return createEmptyBuilderV3TraceMetadata();
    }
    const events = Array.isArray(candidate.events) ? candidate.events : [];
    return {
        events,
        lastEventId: typeof candidate.lastEventId === "string" && candidate.lastEventId.length > 0
            ? candidate.lastEventId
            : null,
        previewReady: candidate.previewReady === true,
        fallbackReason: typeof candidate.fallbackReason === "string" ? candidate.fallbackReason : null,
        fallbackUsed: candidate.fallbackUsed === true,
    };
}
async function appendAssistantDeltaEvent(input) {
    const db = createStudioDbClient();
    const currentGeneration = await db.findGenerationById(input.buildId);
    if (!currentGeneration) {
        throw new Error(`Build ${input.buildId} does not exist in the studio database.`);
    }
    const currentMetadata = isRecord(currentGeneration.metadata) ? currentGeneration.metadata : {};
    const currentTrace = readBuilderTraceMetadata(currentMetadata);
    const event = {
        delta: input.delta,
        id: input.eventId,
        operation: "initial_build",
        timestamp: new Date().toISOString(),
        type: "assistant_delta",
    };
    await db.updateGeneration(input.buildId, {
        metadata: {
            ...currentMetadata,
            builderTrace: {
                events: [...currentTrace.events, event],
                lastEventId: event.id,
                previewReady: currentTrace.previewReady,
                fallbackReason: currentTrace.fallbackReason,
                fallbackUsed: currentTrace.fallbackUsed,
            },
        },
    });
}
async function persistAssistantResponseMetadata(input) {
    const db = createStudioDbClient();
    const currentGeneration = await db.findGenerationById(input.buildId);
    if (!currentGeneration) {
        throw new Error(`Build ${input.buildId} does not exist in the studio database.`);
    }
    const currentMetadata = isRecord(currentGeneration.metadata) ? currentGeneration.metadata : {};
    await db.updateGeneration(input.buildId, {
        metadata: {
            ...currentMetadata,
            assistantResponseText: input.assistantResponseText,
            assistantResponsesByPage: input.assistantResponsesByPage,
        },
    });
}
async function consumeSseBuffer(buffer, flushRemainder, onLine) {
    while (true) {
        const lineBreakIndex = buffer.value.indexOf("\n");
        if (lineBreakIndex === -1) {
            break;
        }
        const rawLine = buffer.value.slice(0, lineBreakIndex);
        buffer.value = buffer.value.slice(lineBreakIndex + 1);
        const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
        await onLine(line);
    }
    if (!flushRemainder || buffer.value.length === 0) {
        return;
    }
    const line = buffer.value.endsWith("\r") ? buffer.value.slice(0, -1) : buffer.value;
    buffer.value = "";
    await onLine(line);
}
// ─── Streaming: per-page text generation (used in parallel fallback) ─────────
async function streamAnthropicMessage(input) {
    const config = getAnthropicRuntimeConfig();
    if (!config.ANTHROPIC_API_KEY) {
        throw new Error("ANTHROPIC_API_KEY is not configured.");
    }
    const response = await fetch(`${config.ANTHROPIC_BASE_URL.replace(/\/$/, "")}/v1/messages`, {
        method: "POST",
        headers: {
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
            "x-api-key": config.ANTHROPIC_API_KEY,
        },
        body: JSON.stringify({
            max_tokens: config.ANTHROPIC_MAX_TOKENS,
            model: config.ANTHROPIC_MODEL,
            stream: true,
            system: input.system,
            messages: [
                {
                    role: "user",
                    content: input.userMessage,
                },
            ],
        }),
    });
    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Anthropic returned ${response.status}: ${errorBody}`);
    }
    const reader = response.body?.getReader();
    if (!reader) {
        throw new Error("Anthropic streaming response body was unavailable.");
    }
    const decoder = new TextDecoder();
    const textParts = [];
    const pendingDataLines = [];
    const buffer = { value: "" };
    const flushEvent = async () => {
        if (pendingDataLines.length === 0) {
            return;
        }
        const payload = pendingDataLines.join("\n");
        pendingDataLines.length = 0;
        if (payload === "[DONE]") {
            return;
        }
        const event = JSON.parse(payload);
        if (event.type === "error") {
            const errorMessage = isRecord(event.error) && typeof event.error.message === "string"
                ? event.error.message
                : "Anthropic streaming request failed.";
            throw new Error(errorMessage);
        }
        if (event.type === "content_block_delta") {
            const delta = isRecord(event.delta) ? event.delta : null;
            const deltaText = typeof delta?.text === "string" ? delta.text : null;
            const deltaType = typeof delta?.type === "string" ? delta.type : null;
            if (deltaType === "text_delta" && deltaText) {
                textParts.push(deltaText);
                await input.onTextDelta?.(deltaText);
            }
        }
    };
    const onLine = async (line) => {
        if (line.length === 0) {
            await flushEvent();
            return;
        }
        if (line.startsWith("data:")) {
            pendingDataLines.push(line.slice(5).trim());
        }
    };
    try {
        while (true) {
            const { done, value } = await reader.read();
            buffer.value += decoder.decode(value ?? new Uint8Array(), { stream: !done });
            await consumeSseBuffer(buffer, done, onLine);
            if (done) {
                await flushEvent();
                break;
            }
        }
    }
    catch (error) {
        try {
            await consumeSseBuffer(buffer, true, onLine);
            await flushEvent();
        }
        catch (flushError) {
            throw combineGenerationErrors(error, flushError);
        }
        return {
            text: textParts.join(""),
            streamError: classifyGenerationError(error),
        };
    }
    return {
        text: textParts.join(""),
    };
}
// ─── Streaming: single-call tool_use generation ───────────────────────────────
/**
 * Fires ONE Anthropic request that uses the `generate_app_files` tool to
 * return every page file in structured JSON. Streams the partial JSON deltas
 * so we get live progress events while still waiting for a single response.
 */
async function streamAnthropicAllFiles(input) {
    const config = getAnthropicRuntimeConfig();
    if (!config.ANTHROPIC_API_KEY) {
        throw new Error("ANTHROPIC_API_KEY is not configured.");
    }
    const maxTokens = Math.max(config.ANTHROPIC_MAX_TOKENS, MULTI_FILE_MAX_TOKENS);
    const response = await fetch(`${config.ANTHROPIC_BASE_URL.replace(/\/$/, "")}/v1/messages`, {
        method: "POST",
        headers: {
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
            "x-api-key": config.ANTHROPIC_API_KEY,
        },
        body: JSON.stringify({
            max_tokens: maxTokens,
            model: config.ANTHROPIC_MODEL,
            stream: true,
            system: input.system,
            tools: [GENERATE_APP_FILES_TOOL],
            tool_choice: { type: "tool", name: "generate_app_files" },
            messages: [{ role: "user", content: input.userMessage }],
        }),
    });
    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Anthropic returned ${response.status}: ${errorBody}`);
    }
    const reader = response.body?.getReader();
    if (!reader) {
        throw new Error("Anthropic streaming response body was unavailable.");
    }
    const decoder = new TextDecoder();
    const textParts = [];
    const pendingDataLines = [];
    const buffer = { value: "" };
    // Accumulate JSON deltas per content_block index
    const toolJsonPartsByIndex = new Map();
    const toolNameByIndex = new Map();
    const flushEvent = async () => {
        if (pendingDataLines.length === 0) {
            return;
        }
        const payload = pendingDataLines.join("\n");
        pendingDataLines.length = 0;
        if (payload === "[DONE]") {
            return;
        }
        const event = JSON.parse(payload);
        if (event.type === "error") {
            const errorMessage = isRecord(event.error) && typeof event.error.message === "string"
                ? event.error.message
                : "Anthropic streaming request failed.";
            throw new Error(errorMessage);
        }
        // Track which block index corresponds to which tool
        if (event.type === "content_block_start") {
            const cb = isRecord(event.content_block) ? event.content_block : null;
            if (cb?.type === "tool_use" && typeof cb.name === "string") {
                const idx = typeof event.index === "number" ? event.index : 0;
                toolJsonPartsByIndex.set(idx, []);
                toolNameByIndex.set(idx, cb.name);
            }
        }
        if (event.type === "content_block_delta") {
            const idx = typeof event.index === "number" ? event.index : 0;
            const delta = isRecord(event.delta) ? event.delta : null;
            const deltaType = typeof delta?.type === "string" ? delta.type : null;
            if (deltaType === "text_delta" && typeof delta?.text === "string") {
                textParts.push(delta.text);
                await input.onTextDelta?.(delta.text);
            }
            if (deltaType === "input_json_delta" && typeof delta?.partial_json === "string") {
                const parts = toolJsonPartsByIndex.get(idx);
                if (parts) {
                    parts.push(delta.partial_json);
                    // Emit a heartbeat delta so the UI stays live; the raw partial JSON
                    // scrolls in the assistant panel and signals progress.
                    await input.onTextDelta?.(delta.partial_json);
                }
            }
        }
    };
    const onLine = async (line) => {
        if (line.length === 0) {
            await flushEvent();
            return;
        }
        if (line.startsWith("data:")) {
            pendingDataLines.push(line.slice(5).trim());
        }
    };
    let streamError;
    try {
        while (true) {
            const { done, value } = await reader.read();
            buffer.value += decoder.decode(value ?? new Uint8Array(), { stream: !done });
            await consumeSseBuffer(buffer, done, onLine);
            if (done) {
                await flushEvent();
                break;
            }
        }
    }
    catch (error) {
        try {
            await consumeSseBuffer(buffer, true, onLine);
            await flushEvent();
        }
        catch (flushError) {
            throw combineGenerationErrors(error, flushError);
        }
        streamError = classifyGenerationError(error);
    }
    // Parse accumulated tool input JSON
    const filesByPageId = new Map();
    for (const [index, parts] of toolJsonPartsByIndex) {
        const toolName = toolNameByIndex.get(index);
        if (toolName !== "generate_app_files") {
            continue;
        }
        const rawJson = parts.join("");
        if (rawJson.length === 0) {
            continue;
        }
        try {
            const toolInput = JSON.parse(rawJson);
            for (const file of toolInput.files ?? []) {
                if (typeof file.pageId === "string" && typeof file.content === "string") {
                    filesByPageId.set(file.pageId, file.content);
                }
            }
        }
        catch (parseError) {
            console.error("Failed to parse generate_app_files tool input JSON.", {
                rawJsonLength: rawJson.length,
                parseError,
                templateId: "unknown",
            });
        }
    }
    return {
        filesByPageId,
        textResponse: textParts.join(""),
        streamError,
    };
}
// ─── Content parsing ──────────────────────────────────────────────────────────
function parseGeneratedFileContent(input) {
    const extractedContent = extractCodePayload(input.text);
    const content = stripNonTsxEnvelope(extractedContent);
    if (content.length > 0) {
        if (content !== extractedContent) {
            console.warn("Stripped non-TSX envelope from generated page content.", {
                pageId: input.page.id,
                templateId: input.templateId,
            });
        }
        return content;
    }
    console.error("Anthropic generation response was empty after code extraction.", {
        maxTokens: input.config.ANTHROPIC_MAX_TOKENS,
        model: input.config.ANTHROPIC_MODEL,
        pageId: input.page.id,
        rawResponseText: input.text,
        templateId: input.templateId,
    });
    throw new Error(`Anthropic returned empty code content for page ${input.page.id}.`);
}
// ─── File utilities ───────────────────────────────────────────────────────────
function normalizeComparableContent(content) {
    return content.replace(/\r\n/g, "\n").trim();
}
function getMaterialChangedPaths(existingFiles, nextFiles) {
    const existingByPath = new Map(existingFiles.map((file) => [normalizeGeneratedPath(file.path), normalizeComparableContent(file.content)]));
    return nextFiles
        .filter((file) => {
        const normalizedPath = normalizeGeneratedPath(file.path);
        const previous = existingByPath.get(normalizedPath);
        if (previous === undefined) {
            return true;
        }
        return previous !== normalizeComparableContent(file.content);
    })
        .map((file) => normalizeGeneratedPath(file.path));
}
function assertGeneratedFileGuardrails(files) {
    const result = validateGeneratedFileGuardrails(files);
    if (result.valid) {
        return;
    }
    console.error("Generated file guardrails failed.", {
        errorCount: result.errors.length,
        errors: result.errors,
        filePaths: files.map((file) => file.path),
    });
    throw new Error(`Generated file guardrails failed:\n${result.errors.join("\n")}`);
}
// ─── Initial-build generation strategies ─────────────────────────────────────
/**
 * Strategy 1 — SINGLE CALL (primary):
 * One Anthropic request with `tool_use` structured output.
 * Returns all pages at once; no sequential failure cascade possible.
 * Fires a stream delta for each partial JSON chunk so the UI stays live.
 */
async function generateInitialFilesSingleCall(input, config, policy, streamSequenceRef, paletteSelection) {
    const systemPrompt = buildSystemPrompt(policy, "initial");
    const userPrompt = buildAllPagesUserPrompt(input, paletteSelection);
    const warnings = [];
    const result = await streamAnthropicAllFiles({
        system: systemPrompt,
        userMessage: userPrompt,
        onTextDelta: async (delta) => {
            streamSequenceRef.value += 1;
            await appendAssistantDeltaEvent({
                buildId: input.buildId,
                delta,
                eventId: `assistant-all-pages-${streamSequenceRef.value}`,
            });
        },
    });
    if (result.streamError) {
        warnings.push(`Single-call stream error (${result.streamError.code}): ${result.streamError.rawMessage}`);
        // If it's a hard auth error, re-throw immediately
        if (result.streamError.code === "auth_required") {
            throw new Error(result.streamError.message);
        }
    }
    const expectedPageIds = new Set(input.template.pages.map((p) => p.id));
    const returnedPageIds = new Set(result.filesByPageId.keys());
    const missingPageIds = [...expectedPageIds].filter((id) => !returnedPageIds.has(id));
    if (missingPageIds.length > 0) {
        throw new Error(`Single-call generation returned ${returnedPageIds.size}/${expectedPageIds.size} pages. Missing: ${missingPageIds.join(", ")}`);
    }
    const assistantResponsesByPage = [];
    const files = [];
    for (const page of input.template.pages) {
        const rawContent = result.filesByPageId.get(page.id) ?? "";
        const content = stripNonTsxEnvelope(rawContent).trim();
        if (content.length === 0) {
            throw new Error(`Single-call generation returned empty content for page ${page.id}.`);
        }
        const nextFile = {
            path: buildGeneratedPageFilePath(input.template.id, page.id),
            kind: "route",
            language: "tsx",
            content,
            locked: false,
            source: "ai",
        };
        assertGeneratedFileGuardrails([nextFile]);
        assistantResponsesByPage.push({ pageId: page.id, text: rawContent });
        files.push(nextFile);
    }
    const assistantResponseText = result.textResponse
        || files.map((f) => f.content).join("\n\n---\n\n");
    console.log("Single-call generation succeeded.", {
        pageCount: files.length,
        templateId: input.template.id,
        warnings,
    });
    return { files, assistantResponseText, assistantResponsesByPage, warnings };
}
/**
 * Strategy 2 — PARALLEL CALLS (fallback):
 * Fire all pages concurrently with `Promise.allSettled`.
 * One page failure cannot block other pages; all run at the same time.
 * Falls back from the single-call strategy when that returns incomplete results.
 *
 * `onlyPageIds` restricts which pages are generated (used when the single-call
 * returned some pages successfully and we only need to fill in the gaps).
 */
async function generateInitialFilesInParallel(input, config, policy, streamSequenceRef, paletteSelection, onlyPageIds) {
    const systemPrompt = buildSystemPrompt(policy, "initial");
    const pagesToGenerate = onlyPageIds
        ? input.template.pages.filter((p) => onlyPageIds.has(p.id))
        : input.template.pages;
    const warnings = [];
    // Launch all pages at the same time — no sequential dependency
    const pageResults = await Promise.allSettled(pagesToGenerate.map(async (page) => {
        const streamResult = await streamAnthropicMessage({
            system: systemPrompt,
            userMessage: buildUserPrompt(input, page, paletteSelection),
            onTextDelta: async (delta) => {
                streamSequenceRef.value += 1;
                await appendAssistantDeltaEvent({
                    buildId: input.buildId,
                    delta,
                    eventId: `assistant-${page.id}-${streamSequenceRef.value}`,
                });
            },
        });
        const text = streamResult.text;
        if (text.trim().length === 0) {
            const err = streamResult.streamError
                ? new Error(streamResult.streamError.message)
                : new Error(`Anthropic returned no text content for page ${page.id}.`);
            throw err;
        }
        const content = parseGeneratedFileContent({
            config,
            page,
            templateId: input.template.id,
            text,
        });
        const nextFile = {
            path: buildGeneratedPageFilePath(input.template.id, page.id),
            kind: "route",
            language: "tsx",
            content: content.trim(),
            locked: false,
            source: "ai",
        };
        try {
            assertGeneratedFileGuardrails([nextFile]);
        }
        catch (validationError) {
            if (streamResult.streamError) {
                throw new Error(classifyGenerationError(combineGenerationErrors(streamResult.streamError.rawMessage, validationError)).message);
            }
            throw validationError;
        }
        if (streamResult.streamError) {
            warnings.push(`Recovered ${page.name} after a stream error and kept the validated output.`);
            console.warn("Recovered generated page after stream error.", {
                errorCode: streamResult.streamError.code,
                errorMessage: streamResult.streamError.rawMessage,
                pageId: page.id,
                templateId: input.template.id,
            });
        }
        return { page, file: nextFile, text };
    }));
    // Surface errors for pages that failed
    const pageErrors = [];
    const files = [];
    const assistantResponsesByPage = [];
    const assistantResponseParts = [];
    for (let i = 0; i < pageResults.length; i++) {
        const result = pageResults[i];
        const page = pagesToGenerate[i];
        if (result.status === "fulfilled") {
            files.push(result.value.file);
            assistantResponsesByPage.push({ pageId: page.id, text: result.value.text });
            assistantResponseParts.push(result.value.text);
        }
        else {
            pageErrors.push(`Page "${page.id}" (${page.name}): ${toErrorMessage(result.reason)}`);
            console.error("Parallel page generation failed.", {
                pageId: page.id,
                templateId: input.template.id,
                error: toErrorMessage(result.reason),
            });
        }
    }
    if (pageErrors.length > 0) {
        throw new Error(`Parallel generation failed for ${pageErrors.length}/${pagesToGenerate.length} page(s):\n${pageErrors.join("\n")}`);
    }
    console.log("Parallel generation succeeded.", {
        pageCount: files.length,
        templateId: input.template.id,
    });
    return {
        files,
        assistantResponseText: assistantResponseParts.join(""),
        assistantResponsesByPage,
        warnings,
    };
}
// ─── Main activity ────────────────────────────────────────────────────────────
export async function generateFiles(input) {
    const config = getAnthropicRuntimeConfig();
    const isIteration = input.existingFiles.length > 0;
    const policy = isIteration
        ? getIterationPromptPolicy(input.template.id)
        : getInitialBuildPromptPolicy(input.template.id);
    const assistantResponseParts = [];
    const assistantResponsesByPage = [];
    const warnings = [];
    const streamSequenceRef = { value: 0 };
    const paletteSelection = selectPalette(input.plan.normalizedPrompt, input.template.id);
    // ─── Iteration path (unchanged) ──────────────────────────────────────────
    if (isIteration) {
        if (!config.ANTHROPIC_API_KEY) {
            throw new Error("ANTHROPIC_API_KEY is not configured.");
        }
        const model = new AnthropicStreamingModel({
            apiKey: config.ANTHROPIC_API_KEY,
            baseUrl: config.ANTHROPIC_BASE_URL,
            maxTokens: config.ANTHROPIC_MAX_TOKENS,
            model: config.ANTHROPIC_MODEL,
            timeoutMs: 180_000,
        });
        const engine = new GenerationEngine({
            actor: input.actor,
            generationId: input.buildId,
            initialFiles: input.existingFiles.map((file) => ({
                content: file.content,
                path: normalizeGeneratedPath(file.path),
            })),
            maxTurns: 30,
            model,
            operation: projectIterationOperation,
            persistence: false,
            prompt: buildIterationUserPrompt(input),
            promptPolicy: getIterationPromptPolicy(input.template.id),
            project: input.project,
            template: input.template,
        });
        const turnTexts = [];
        let resultSummary = "";
        let finalFiles = input.existingFiles;
        for await (const event of engine.run()) {
            if (event.type === "text_delta" && event.text.length > 0) {
                assistantResponseParts.push(event.text);
                turnTexts.push(event.text);
                streamSequenceRef.value += 1;
                await appendAssistantDeltaEvent({
                    buildId: input.buildId,
                    delta: event.text,
                    eventId: `assistant-iteration-${streamSequenceRef.value}`,
                });
            }
            if (event.type === "llm_turn_completed") {
                assistantResponsesByPage.push({
                    pageId: `iteration-turn-${event.turn}`,
                    text: turnTexts.join(""),
                });
                turnTexts.length = 0;
            }
            if (event.type === "generation_completed") {
                finalFiles = event.result.files;
                resultSummary = event.result.summary;
            }
        }
        await persistAssistantResponseMetadata({
            buildId: input.buildId,
            assistantResponseText: assistantResponseParts.join(""),
            assistantResponsesByPage,
        });
        const changedPaths = getMaterialChangedPaths(input.existingFiles, finalFiles);
        const changedFiles = finalFiles.filter((file) => changedPaths.includes(normalizeGeneratedPath(file.path)));
        assertGeneratedFileGuardrails(changedFiles);
        return {
            assistantResponseText: assistantResponseParts.join(""),
            assistantResponsesByPage,
            changedPaths,
            files: finalFiles,
            previewEntryPath: input.template.previewEntryPath,
            source: "ai",
            summary: resultSummary.trim()
                || (changedPaths.length > 0
                    ? `Updated ${changedPaths.length} file${changedPaths.length === 1 ? "" : "s"} in ${input.project.name}.`
                    : `No file changes were needed for ${input.project.name}.`),
            warnings,
        };
    }
    // ─── Initial build path ───────────────────────────────────────────────────
    const scaffoldFiles = buildGeneratedScaffoldFiles({
        colorPalette: paletteSelection.colorPalette,
        project: input.project,
        template: input.template,
    });
    let generatedRouteFiles = [];
    // Strategy 1: single structured call via tool_use.
    // If it succeeds, we get all pages in one coherent response.
    let singleCallError = null;
    try {
        const singleCallResult = await generateInitialFilesSingleCall(input, config, policy, streamSequenceRef, paletteSelection);
        generatedRouteFiles = singleCallResult.files;
        assistantResponseParts.push(singleCallResult.assistantResponseText);
        assistantResponsesByPage.push(...singleCallResult.assistantResponsesByPage);
        warnings.push(...singleCallResult.warnings);
    }
    catch (error) {
        singleCallError = error;
        console.warn("Single-call generation failed; falling back to parallel per-page calls.", {
            error: toErrorMessage(error),
            templateId: input.template.id,
            pageCount: input.template.pages.length,
        });
    }
    // Strategy 2: parallel per-page calls (fallback when single call fails).
    // All pages run concurrently — a timeout on page A cannot block page B.
    if (singleCallError !== null) {
        warnings.push(`Single-call generation failed (${toErrorMessage(singleCallError)}); used parallel generation.`);
        const parallelResult = await generateInitialFilesInParallel(input, config, policy, streamSequenceRef, paletteSelection);
        generatedRouteFiles = parallelResult.files;
        assistantResponseParts.push(parallelResult.assistantResponseText);
        assistantResponsesByPage.push(...parallelResult.assistantResponsesByPage);
        warnings.push(...parallelResult.warnings);
    }
    const allFiles = [...scaffoldFiles, ...generatedRouteFiles];
    assertGeneratedFileGuardrails(allFiles);
    await persistAssistantResponseMetadata({
        buildId: input.buildId,
        assistantResponseText: assistantResponseParts.join(""),
        assistantResponsesByPage,
    });
    return {
        assistantResponseText: assistantResponseParts.join(""),
        assistantResponsesByPage,
        files: allFiles,
        previewEntryPath: input.template.previewEntryPath,
        source: "ai",
        summary: `Generated ${allFiles.length} scaffold and route files for ${input.template.name}.`,
        warnings,
    };
}
