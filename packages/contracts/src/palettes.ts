export type ColorPaletteId =
  | "warm-orange"
  | "professional-blue"
  | "finance-green"
  | "health-teal"
  | "creative-purple"
  | "energy-red"
  | "midnight-indigo"
  | "nature-emerald"
  | "warm-amber"
  | "rose-pink"
  | "ocean-cyan"
  | "slate-neutral"
  | "kids-yellow"
  | "law-navy"
  | "gaming-neon"
  | "startup-violet"
  | "retail-coral"
  | "news-charcoal"
  | "medical-blue"
  | "crypto-dark";

export interface ColorPalette {
  id: ColorPaletteId;
  label: string;
  primary: string;
  accent: string;
  background: string;
  bestFor: string;
}

export const COLOR_PALETTES = [
  {
    id: "warm-orange",
    label: "Warm Orange",
    primary: "#EA580C",
    accent: "#F97316",
    background: "#0F172A",
    bestFor: "Default tools, calculators",
  },
  {
    id: "professional-blue",
    label: "Professional Blue",
    primary: "#1D4ED8",
    accent: "#3B82F6",
    background: "#0F172A",
    bestFor: "Business, SaaS, corporate",
  },
  {
    id: "finance-green",
    label: "Finance Green",
    primary: "#15803D",
    accent: "#22C55E",
    background: "#0F172A",
    bestFor: "Money, budgets, finance",
  },
  {
    id: "health-teal",
    label: "Health Teal",
    primary: "#0F766E",
    accent: "#14B8A6",
    background: "#0F172A",
    bestFor: "Health, fitness, medical",
  },
  {
    id: "creative-purple",
    label: "Creative Purple",
    primary: "#7C3AED",
    accent: "#A855F7",
    background: "#0F172A",
    bestFor: "Creative, design, art",
  },
  {
    id: "energy-red",
    label: "Energy Red",
    primary: "#DC2626",
    accent: "#EF4444",
    background: "#0F172A",
    bestFor: "Sport, fitness, high-energy",
  },
  {
    id: "midnight-indigo",
    label: "Midnight Indigo",
    primary: "#4338CA",
    accent: "#6366F1",
    background: "#0F172A",
    bestFor: "Tech, productivity, focus",
  },
  {
    id: "nature-emerald",
    label: "Nature Emerald",
    primary: "#059669",
    accent: "#10B981",
    background: "#0F172A",
    bestFor: "Environment, wellness, plant",
  },
  {
    id: "warm-amber",
    label: "Warm Amber",
    primary: "#D97706",
    accent: "#F59E0B",
    background: "#0F172A",
    bestFor: "Food, restaurant, hospitality",
  },
  {
    id: "rose-pink",
    label: "Rose Pink",
    primary: "#BE185D",
    accent: "#EC4899",
    background: "#0F172A",
    bestFor: "Beauty, fashion, lifestyle",
  },
  {
    id: "ocean-cyan",
    label: "Ocean Cyan",
    primary: "#0E7490",
    accent: "#06B6D4",
    background: "#0F172A",
    bestFor: "Travel, water, clean",
  },
  {
    id: "slate-neutral",
    label: "Slate Neutral",
    primary: "#475569",
    accent: "#64748B",
    background: "#0F172A",
    bestFor: "Minimal, professional, notes",
  },
  {
    id: "kids-yellow",
    label: "Kids Yellow",
    primary: "#CA8A04",
    accent: "#EAB308",
    background: "#1C1917",
    bestFor: "Education, kids, fun",
  },
  {
    id: "law-navy",
    label: "Law Navy",
    primary: "#1E3A5F",
    accent: "#2563EB",
    background: "#0F172A",
    bestFor: "Legal, finance, formal",
  },
  {
    id: "gaming-neon",
    label: "Gaming Neon",
    primary: "#6D28D9",
    accent: "#8B5CF6",
    background: "#09090B",
    bestFor: "Games, entertainment, dark",
  },
  {
    id: "startup-violet",
    label: "Startup Violet",
    primary: "#5B21B6",
    accent: "#7C3AED",
    background: "#0F172A",
    bestFor: "SaaS, startup, modern",
  },
  {
    id: "retail-coral",
    label: "Retail Coral",
    primary: "#E11D48",
    accent: "#F43F5E",
    background: "#0F172A",
    bestFor: "Shopping, retail, deals",
  },
  {
    id: "news-charcoal",
    label: "News Charcoal",
    primary: "#1F2937",
    accent: "#374151",
    background: "#111827",
    bestFor: "News, blog, content",
  },
  {
    id: "medical-blue",
    label: "Medical Blue",
    primary: "#1D4ED8",
    accent: "#60A5FA",
    background: "#0F172A",
    bestFor: "Medical, clinical, clean",
  },
  {
    id: "crypto-dark",
    label: "Crypto Dark",
    primary: "#F97316",
    accent: "#FB923C",
    background: "#09090B",
    bestFor: "Crypto, web3, dark theme",
  },
] as const satisfies readonly ColorPalette[];

export const DEFAULT_COLOR_PALETTE_ID = "warm-orange" as const satisfies ColorPaletteId;

export const COLOR_PALETTES_BY_ID: Record<ColorPaletteId, ColorPalette> = Object.fromEntries(
  COLOR_PALETTES.map((palette) => [palette.id, palette]),
) as Record<ColorPaletteId, ColorPalette>;

export const DEFAULT_COLOR_PALETTE = COLOR_PALETTES_BY_ID[DEFAULT_COLOR_PALETTE_ID];

export function getColorPalette(id: ColorPaletteId): ColorPalette {
  return COLOR_PALETTES_BY_ID[id];
}
