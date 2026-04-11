/**
 * Beomz Studio SLM client — worker side.
 *
 * Thin HTTP wrapper around the Python sidecar at localhost:8001.
 * Used by templateSelect activity and generateFiles palette selection.
 * Every call gracefully degrades to the existing keyword heuristics.
 */
import type { InitialBuildPlan, TemplateSelectionResult } from "@beomz-studio/contracts";
export declare function keywordPaletteFallback(prompt: string): string;
/**
 * Identify the best matching template for a prompt via the SLM sidecar.
 *
 * Sends the full template catalogue (AI templates + prebuilt manifests) and
 * filters the result to valid TemplateId values so the existing workflow is
 * unaffected.  Falls back to keyword heuristics when the sidecar is down.
 *
 * TODO: remove the TemplateId filter once the workflow supports prebuilt routing.
 */
export declare function matchTemplateWithSlm(input: {
    prompt: string;
    plan?: InitialBuildPlan;
}): Promise<TemplateSelectionResult>;
/**
 * Return the best-matching palette for a prompt.
 * Falls back to keyword heuristics when the sidecar is unavailable.
 */
export declare function classifyPaletteWithSlm(prompt: string, templateId?: string): Promise<{
    palette: string;
    confidence: number;
}>;
