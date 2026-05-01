const DESIGN_DIRECTIVE_START_MARKER = "─── DESIGN DIRECTIVE";
const DESIGN_DIRECTIVE_END_MARKER = "─── END DESIGN DIRECTIVE — original user request follows below ───";

export interface ExtractedDesignDirective {
  cleanPrompt: string;
  designDirective: string | null;
  hadPrependedDirective: boolean;
}

function normaliseOptionalString(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function extractDesignDirectiveFromPrompt(
  prompt: string,
  explicitDesignDirective?: string | null,
): ExtractedDesignDirective {
  const cleanPrompt = prompt.trim();
  const explicit = normaliseOptionalString(explicitDesignDirective);

  if (!cleanPrompt.startsWith(DESIGN_DIRECTIVE_START_MARKER)) {
    return {
      cleanPrompt,
      designDirective: explicit,
      hadPrependedDirective: false,
    };
  }

  const endMarkerIndex = cleanPrompt.indexOf(DESIGN_DIRECTIVE_END_MARKER);
  if (endMarkerIndex < 0) {
    return {
      cleanPrompt,
      designDirective: explicit,
      hadPrependedDirective: false,
    };
  }

  const directiveEnd = endMarkerIndex + DESIGN_DIRECTIVE_END_MARKER.length;
  const extractedDirective = cleanPrompt.slice(0, directiveEnd).trim();
  const remainder = cleanPrompt.slice(directiveEnd).trim();

  return {
    cleanPrompt: remainder.length > 0 ? remainder : cleanPrompt,
    designDirective: explicit ?? extractedDirective,
    hadPrependedDirective: true,
  };
}

const BUILD_VERB_PATTERN = /\b(build|create|make|design|generate|launch|start)\b/i;
const CLEAR_DOMAIN_STOP_WORDS = new Set([
  "a",
  "an",
  "app",
  "application",
  "build",
  "create",
  "design",
  "for",
  "generate",
  "i",
  "launch",
  "make",
  "me",
  "my",
  "please",
  "site",
  "something",
  "start",
  "the",
  "this",
  "website",
]);

export function isClearDomainBuildPrompt(prompt: string): boolean {
  const normalized = prompt
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ");

  if (!normalized || normalized.endsWith("?")) {
    return false;
  }

  const words = normalized.split(" ").filter(Boolean);
  if (words.length === 0 || words.length > 10) {
    return false;
  }

  if (/\b(anything|something|whatever|some app|some website)\b/.test(normalized)) {
    return false;
  }

  if (/\b(build me an app|build me a website|make me an app|make me a website)\b/.test(normalized)) {
    return false;
  }

  const hasBuildFraming = BUILD_VERB_PATTERN.test(normalized)
    || /\b(app|application|website|site)\b/.test(normalized);

  if (!hasBuildFraming) {
    return false;
  }

  const domainTokens = words.filter((word) => !CLEAR_DOMAIN_STOP_WORDS.has(word));
  return domainTokens.length >= 1;
}
