/**
 * BEO-387 — Build stage copy register.
 *
 * Pure data module: no logic, no randomness. All variant-selection logic
 * lives in useBuildChat.ts. This file is the single place to tweak copy.
 *
 * Voice guidelines:
 *   - Peer-level, not servile ("Got it" not "Right away!")
 *   - Confident ("this is the big step" not "I'll try to…")
 *   - Short — 3-8 words, fits one line on mobile
 *   - No emoji — the orange ◌ handles that
 *   - No jargon — "Writing the code" not "Invoking Sonnet"
 *
 * The {app_type} token is resolved in useBuildChat before display.
 */

export type BuildStage =
  | "acknowledged"   // pre_build_ack
  | "classifying"    // stage_classifying
  | "enriching"      // stage_enriching
  | "generating"     // stage_generating — the long one
  | "sanitising"     // stage_sanitising
  | "persisting"     // stage_persisting
  | "deploying";     // stage_deploying

export const STAGE_COPY: Record<BuildStage, string[]> = {
  acknowledged: [
    "Reading your prompt…",
    "Got it — let me take a look…",
    "On it…",
  ],
  classifying: [
    "Figuring out what you need…",
    "Deciding how to approach this…",
    "One sec…",
  ],
  enriching: [
    "Sketching the shape of your {app_type}…",
    "Planning the architecture…",
    "Mapping out the pieces…",
  ],
  generating: [
    "Writing the code — this is the big step…",
    "Building your {app_type}…",
    "Writing components and wiring things up…",
  ],
  sanitising: [
    "Polishing the code…",
    "Double-checking my work…",
    "Tidying up…",
  ],
  persisting: [
    "Saving your work…",
    "Filing it away…",
    "Almost done…",
  ],
  deploying: [
    "Warming up the preview…",
    "Starting your app…",
    "Almost there…",
  ],
};
