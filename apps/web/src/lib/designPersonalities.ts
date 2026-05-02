/**
 * BEO-744 — Design Personality System (Track A · Frontend)
 *
 * Ten distinct visual personalities injected into the web app build prompt
 * so every build is reference-quality and visually distinct. Selection is
 * deterministic per user prompt (hashed) so the same idea consistently
 * lands on the same look — but different prompts hit different personalities.
 *
 * NOTE: This is the *visual* personality of generated apps, not the AI chat
 * persona (see ./personalities.ts for that — different concept).
 */

export type DesignPersonalityId =
  | "brutalist"
  | "swiss-grid"
  | "soft-editorial"
  | "bold-agency"
  | "tech-minimal"
  | "warm-artisan"
  | "luxury-dark"
  | "playful-saas"
  | "magazine"
  | "cinematic";

export type Radii = "none" | "sm" | "md" | "lg" | "pill";
export type Shadows = "none" | "subtle" | "medium" | "dramatic";
export type Spacing = "tight" | "default" | "generous";
export type ButtonStyle = "sharp" | "rounded" | "pill";
export type CardStyle = "elevated" | "flat" | "ghost" | "colored";
export type NavStyle = "topbar" | "sidebar" | "floating";

export interface DesignPersonality {
  id: DesignPersonalityId;
  name: string;
  fontPair: { display: string; body: string };
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    bg: string;
    surface: string;
    text: string;
    textMuted: string;
  };
  radii: Radii;
  shadows: Shadows;
  spacing: Spacing;
  componentStyle: {
    buttons: ButtonStyle;
    cards: CardStyle;
    nav: NavStyle;
  };
  /** Three publicly-known reference sites the model already understands well. */
  refs: string[];
}

export const DESIGN_PERSONALITIES: Record<DesignPersonalityId, DesignPersonality> = {
  brutalist: {
    id: "brutalist",
    name: "Brutalist",
    fontPair: { display: "Space Mono", body: "Space Mono" },
    colors: {
      primary: "#000000",
      secondary: "#FFEB00",
      accent: "#FF3D00",
      bg: "#FFFFFF",
      surface: "#FFEB00",
      text: "#000000",
      textMuted: "#3F3F3F",
    },
    radii: "none",
    shadows: "none",
    spacing: "tight",
    componentStyle: { buttons: "sharp", cards: "flat", nav: "topbar" },
    refs: ["turso.tech", "basement.studio", "read.cv"],
  },

  "swiss-grid": {
    id: "swiss-grid",
    name: "Swiss / Grid",
    fontPair: { display: "Space Grotesk", body: "IBM Plex Sans" },
    colors: {
      primary: "#0066FF",
      secondary: "#111111",
      accent: "#FF0033",
      bg: "#FFFFFF",
      surface: "#F5F5F5",
      text: "#0A0A0A",
      textMuted: "#6B6B6B",
    },
    radii: "sm",
    shadows: "subtle",
    spacing: "default",
    componentStyle: { buttons: "sharp", cards: "flat", nav: "topbar" },
    refs: ["linear.app", "vercel.com", "supabase.com"],
  },

  "soft-editorial": {
    id: "soft-editorial",
    name: "Soft Editorial",
    fontPair: { display: "Playfair Display", body: "Lato" },
    colors: {
      primary: "#2D4A3E",
      secondary: "#8B7355",
      accent: "#C97B4A",
      bg: "#FAF7F2",
      surface: "#FFFFFF",
      text: "#1F2421",
      textMuted: "#6B6B65",
    },
    radii: "md",
    shadows: "subtle",
    spacing: "generous",
    componentStyle: { buttons: "rounded", cards: "ghost", nav: "topbar" },
    refs: ["notion.so", "basecamp.com", "craft.do"],
  },

  "bold-agency": {
    id: "bold-agency",
    name: "Bold Agency",
    fontPair: { display: "Barlow Condensed", body: "Inter" },
    colors: {
      primary: "#FF4500",
      secondary: "#000000",
      accent: "#FFD400",
      bg: "#0A0A0A",
      surface: "#1A1A1A",
      text: "#FFFFFF",
      textMuted: "#A8A8A8",
    },
    radii: "sm",
    shadows: "dramatic",
    spacing: "default",
    componentStyle: { buttons: "sharp", cards: "elevated", nav: "floating" },
    refs: ["framer.com", "webflow.com", "basement.studio"],
  },

  "tech-minimal": {
    id: "tech-minimal",
    name: "Tech Minimal",
    fontPair: { display: "Geist", body: "Inter" },
    colors: {
      primary: "#0070F3",
      secondary: "#171717",
      accent: "#00DC82",
      bg: "#FAFAFA",
      surface: "#FFFFFF",
      text: "#0A0A0A",
      textMuted: "#737373",
    },
    radii: "md",
    shadows: "subtle",
    spacing: "default",
    componentStyle: { buttons: "rounded", cards: "elevated", nav: "topbar" },
    refs: ["resend.com", "linear.app", "raycast.com"],
  },

  "warm-artisan": {
    id: "warm-artisan",
    name: "Warm Artisan",
    fontPair: { display: "Lora", body: "Source Serif 4" },
    colors: {
      primary: "#A0522D",
      secondary: "#5C4033",
      accent: "#D4A373",
      bg: "#FBF7F0",
      surface: "#F5EBDD",
      text: "#2B1F17",
      textMuted: "#8B7B6B",
    },
    radii: "lg",
    shadows: "subtle",
    spacing: "generous",
    componentStyle: { buttons: "rounded", cards: "ghost", nav: "topbar" },
    refs: ["hey.com", "basecamp.com", "buttondown.email"],
  },

  "luxury-dark": {
    id: "luxury-dark",
    name: "Luxury Dark",
    fontPair: { display: "Cormorant Garamond", body: "DM Sans" },
    colors: {
      primary: "#C9A961",
      secondary: "#0F0F0F",
      accent: "#E8D4A2",
      bg: "#0A0A0A",
      surface: "#161616",
      text: "#F5F5F0",
      textMuted: "#999990",
    },
    radii: "sm",
    shadows: "dramatic",
    spacing: "generous",
    componentStyle: { buttons: "sharp", cards: "ghost", nav: "topbar" },
    refs: ["superhuman.com", "raycast.com", "obsidian.md"],
  },

  "playful-saas": {
    id: "playful-saas",
    name: "Playful SaaS",
    fontPair: { display: "Plus Jakarta Sans", body: "Plus Jakarta Sans" },
    colors: {
      primary: "#7C3AED",
      secondary: "#EC4899",
      accent: "#FBBF24",
      bg: "#FFFFFF",
      surface: "#F7F4FF",
      text: "#1A1033",
      textMuted: "#6B6B85",
    },
    radii: "lg",
    shadows: "medium",
    spacing: "default",
    componentStyle: { buttons: "pill", cards: "colored", nav: "floating" },
    refs: ["figma.com", "loom.com", "notion.so"],
  },

  magazine: {
    id: "magazine",
    name: "Magazine",
    fontPair: { display: "Libre Baskerville", body: "Libre Franklin" },
    colors: {
      primary: "#C8102E",
      secondary: "#1B1B1B",
      accent: "#E5C100",
      bg: "#FBF9F4",
      surface: "#FFFFFF",
      text: "#111111",
      textMuted: "#5B5B55",
    },
    radii: "none",
    shadows: "subtle",
    spacing: "generous",
    componentStyle: { buttons: "sharp", cards: "flat", nav: "topbar" },
    refs: ["arc.net", "read.cv", "craft.do"],
  },

  cinematic: {
    id: "cinematic",
    name: "Cinematic",
    fontPair: { display: "Cinzel", body: "Raleway" },
    colors: {
      primary: "#D4AF37",
      secondary: "#0B0F1A",
      accent: "#7C0A02",
      bg: "#0B0F1A",
      surface: "#141928",
      text: "#F2EDE0",
      textMuted: "#8E8B82",
    },
    radii: "sm",
    shadows: "dramatic",
    spacing: "generous",
    componentStyle: { buttons: "sharp", cards: "elevated", nav: "floating" },
    refs: ["superhuman.com", "framer.com", "arc.net"],
  },
};

export const DESIGN_PERSONALITY_IDS = Object.keys(
  DESIGN_PERSONALITIES,
) as DesignPersonalityId[];

/**
 * djb2-style string hash → deterministic personality pick.
 * Same prompt always lands on same personality; different prompts spread evenly.
 */
function hashString(input: string): number {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function pickDesignPersonality(promptText: string): DesignPersonality {
  const normalized = (promptText ?? "").trim().toLowerCase();
  if (normalized.length === 0) {
    return DESIGN_PERSONALITIES["tech-minimal"];
  }
  const idx = hashString(normalized) % DESIGN_PERSONALITY_IDS.length;
  const id = DESIGN_PERSONALITY_IDS[idx];
  return DESIGN_PERSONALITIES[id];
}

/**
 * Build a Google Fonts @import URL for the personality's font pair.
 * Loads display + body weights tuned for typographic hierarchy.
 */
export function googleFontImportUrl(p: DesignPersonality): string {
  const weights = "wght@400;500;600;700";
  const families = new Set<string>();
  families.add(`${p.fontPair.display.replace(/\s+/g, "+")}:${weights}`);
  families.add(`${p.fontPair.body.replace(/\s+/g, "+")}:${weights}`);
  const familyParam = Array.from(families)
    .map((f) => `family=${f}`)
    .join("&");
  return `https://fonts.googleapis.com/css2?${familyParam}&display=swap`;
}

/**
 * The full design directive block that gets injected into every web app
 * build prompt. The model is instructed to apply *every* value explicitly
 * rather than fall back to Tailwind defaults.
 */
export function buildDesignDirective(p: DesignPersonality): string {
  const fontImport = googleFontImportUrl(p);
  return [
    `─── DESIGN DIRECTIVE (apply every value explicitly — no Tailwind defaults) ───`,
    ``,
    `DESIGN PERSONALITY: ${p.name}`,
    `Visual references (study these, match their quality): ${p.refs[0]}, ${p.refs[1]}, ${p.refs[2]}`,
    ``,
    `FONTS: Load via @import in a <style> tag at the top of index.html or App.tsx:`,
    `  @import url('${fontImport}');`,
    `  Use "${p.fontPair.display}" for all headings (h1-h3, display).`,
    `  Use "${p.fontPair.body}" for all body, labels, buttons, captions.`,
    ``,
    `COLORS: primary=${p.colors.primary} | secondary=${p.colors.secondary} | accent=${p.colors.accent} | bg=${p.colors.bg} | surface=${p.colors.surface} | text=${p.colors.text} | textMuted=${p.colors.textMuted}`,
    `  Apply these exact hexes — set them as CSS variables on :root and use throughout. Do NOT use Tailwind's default gray/blue/red palette.`,
    ``,
    `RADIUS: ${p.radii} | SHADOWS: ${p.shadows} | SPACING: ${p.spacing} (8px base grid — use multiples of 8 for all padding/margin/gap)`,
    ``,
    `COMPONENTS: buttons=${p.componentStyle.buttons}, cards=${p.componentStyle.cards}, nav=${p.componentStyle.nav}`,
    ``,
    `TYPOGRAPHY SCALE (apply line-height + letter-spacing tuned to the chosen fonts):`,
    `  display  3.5rem+   line-height 1.05  letter-spacing -0.03em`,
    `  h1       2.5rem    line-height 1.1   letter-spacing -0.02em`,
    `  h2       1.75rem   line-height 1.2   letter-spacing -0.01em`,
    `  h3       1.25rem   line-height 1.3   letter-spacing  0`,
    `  body     1rem      line-height 1.6   letter-spacing  0`,
    `  small    0.875rem  line-height 1.5   letter-spacing  0`,
    `  label    0.75rem   line-height 1.4   letter-spacing  0.05em (uppercase ok)`,
    ``,
    `LAYOUT: max container 1200px, centered. 8px grid throughout. Generous section padding (80px+ vertical on desktop, 48px+ on mobile). Do NOT default to flex+gap-4 everywhere — use proper grid, asymmetric layouts, varied section rhythms.`,
    ``,
    `COMPONENT VARIETY — pick options that fit "${p.name}":`,
    `  Hero:    centered | split-left | split-right | asymmetric | minimal-text`,
    `  Nav:     topbar | sidebar | floating pill   (this build: ${p.componentStyle.nav})`,
    `  Cards:   elevated | flat+border | ghost | colored   (this build: ${p.componentStyle.cards})`,
    `  Buttons: sharp | rounded | pill   (this build: ${p.componentStyle.buttons})`,
    ``,
    `RULE: Apply ALL values above explicitly in the generated code. The output must visibly reflect the "${p.name}" personality — a developer reviewing the screenshots should immediately recognise it as ${p.refs[0]}-quality, not a generic Tailwind starter.`,
  ].join("\n");
}

/**
 * Two-tier image strategy injected into the prompt. Tier 1 = keyword photos
 * via loremflickr (picsum seed fallback), Tier 2 = absolute FLUX endpoint for
 * hero artwork
 * and brand visuals. No grey placeholder boxes anywhere.
 */
export function buildImageDirective(): string {
  return [
    `─── IMAGES — two-tier strategy (zero grey placeholder boxes) ───`,
    ``,
    `Tier 1 — Real photos (use for: avatars, feature photos, banners, backgrounds):`,
    `  Primary:  https://loremflickr.com/800/600/{relevant,keywords}`,
    `  Fallback: https://picsum.photos/seed/{keyword}/800/600`,
    `  Pick keywords from the app's domain. E.g. for a fitness dashboard:`,
    `    https://loremflickr.com/800/600/running,workout`,
    `    https://loremflickr.com/800/600/gym,athlete`,
    `  Always use 2-3 keywords joined with commas. Vary keywords across slots so images differ.`,
    ``,
    `Tier 2 — AI-generated artwork (use for: hero artwork, custom illustrations, brand visuals,`,
    `        anything compositionally unique that stock photos won't have):`,
    `  POST https://beomz.ai/api/images/generate { prompt: string, width: number, height: number } → { url: string }`,
    `  Call this endpoint from within the generated app code at runtime (e.g. in a useEffect`,
    `  or directly in JSX with a small fetch wrapper). Pass a descriptive prompt that matches`,
    `  the personality and domain — e.g. "minimalist editorial illustration of a calm morning`,
    `  routine, soft beige tones, hand-drawn style".`,
    ``,
    `RULE: Every image slot in the UI gets a real image — never a grey div, never a placeholder`,
    `box, never an empty <img/>. If you can't decide between tiers, default to Tier 1 (loremflickr).`,
  ].join("\n");
}

/**
 * Copy-quality directive — no Lorem ipsum, no "Feature title" placeholders.
 * Real, domain-specific copy for every text block.
 */
export function buildCopyDirective(): string {
  return [
    `─── COPY QUALITY (no placeholder text anywhere) ───`,
    ``,
    `NO Lorem ipsum. NO "Feature title". NO "Lorem ipsum dolor sit amet". NO "Coming soon".`,
    `Write real, domain-specific copy that fits this app's purpose.`,
    ``,
    `Headlines:  punchy, max 8 words. Lead with a benefit or specific outcome.`,
    `Body:       max 2 sentences per block. Concrete language, no buzzwords.`,
    `CTAs:       action-oriented and specific — "Start free trial", "Track today's workout",`,
    `            "Browse listings", "Generate report". Never just "Submit" or "Click here".`,
    `Nav:        real labels — "Workouts", "Properties", "Reports". Never "Page 1" or "Section A".`,
    `Empty states: helpful and human — "No workouts yet — log your first session" not "No data".`,
  ].join("\n");
}

/**
 * Full directive block: design + images + copy. Prepended to the user's
 * prompt before /builds/start so every web app build inherits the system.
 */
export function buildFullDesignBlock(promptText: string): {
  block: string;
  personality: DesignPersonality;
} {
  const personality = pickDesignPersonality(promptText);
  const block = [
    buildDesignDirective(personality),
    "",
    buildImageDirective(),
    "",
    buildCopyDirective(),
    "",
    `─── END DESIGN DIRECTIVE — original user request follows below ───`,
  ].join("\n");
  return { block, personality };
}
