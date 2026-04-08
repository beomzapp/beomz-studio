const promptStopWords = new Set([
    "a",
    "an",
    "and",
    "app",
    "build",
    "for",
    "from",
    "in",
    "of",
    "the",
    "to",
    "with",
]);
function toTitleCase(value) {
    return value
        .split(/\s+/)
        .filter(Boolean)
        .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())
        .join(" ");
}
export function buildProjectNameFromPrompt(prompt, fallbackName) {
    const tokens = prompt
        .trim()
        .replace(/\s+/g, " ")
        .split(" ")
        .map((token) => token.replace(/[^a-zA-Z0-9-]/g, ""))
        .filter((token) => token.length > 2)
        .slice(0, 4);
    if (tokens.length === 0) {
        return fallbackName;
    }
    return toTitleCase(tokens.join(" "));
}
export function createInitialBuildPlan(prompt, projectName) {
    const normalizedPrompt = prompt.trim().replace(/\s+/g, " ");
    const rawTokens = normalizedPrompt.toLowerCase().match(/[a-z0-9-]+/g) ?? [];
    const keywords = Array.from(new Set(rawTokens.filter((token) => token.length > 2 && !promptStopWords.has(token)))).slice(0, 8);
    return {
        normalizedPrompt,
        projectNameSuggestion: projectName.trim(),
        intentSummary: normalizedPrompt.length > 180
            ? `${normalizedPrompt.slice(0, 177).trimEnd()}...`
            : normalizedPrompt,
        keywords,
    };
}
