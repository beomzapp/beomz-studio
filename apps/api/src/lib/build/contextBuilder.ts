import { basename } from "node:path";

import Anthropic from "@anthropic-ai/sdk";
import type {
  BuildIntent,
  BuilderImageIntent,
  StudioFile,
} from "@beomz-studio/contracts";
import type { Phase } from "../planPhases.js";
import { buildAnthropicImageBlock } from "../anthropicImages.js";
import { classifyIntent, type Intent } from "../intentClassifier.js";

type ProjectDbType = "none" | "neon" | "supabase";

type IterationImageBlock =
  | ReturnType<typeof buildAnthropicImageBlock>
  | Awaited<ReturnType<typeof import("../anthropicImages.js").resolveAnthropicImageBlock>>;

interface IterationFileContext {
  path: string;
  basename: string;
  kind: StudioFile["kind"];
  language: string;
  content: string;
  lines: number;
  imports: string[];
  exports: string[];
  keywords: string[];
  score: number;
}

export interface IterationSelectionResult {
  manifest: string;
  seedFiles: IterationFileContext[];
  legacyUserMessage: string;
  optimizedText: string;
  optimizedUserContent: Anthropic.MessageParam["content"];
}

const BYO_SUPABASE_SYSTEM_PROMPT_BLOCK = [
  "This project uses the user's own Supabase database.",
  "VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are injected automatically.",
  "Always use @supabase/supabase-js for ALL data operations.",
  "Never use hardcoded sample data — always query from Supabase.",
  "const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY)",
].join("\n");

const ITERATION_STRICT_REBUILD_RULE = "CRITICAL: NEVER regenerate or redesign the entire site. You are making surgical changes only. Only rebuild from scratch if the user explicitly says 'rebuild', 'redesign', 'start over', 'make it completely different', or 'try a new design'. ALL other requests — even vague ones — are precise iterations on the existing design.";

const BYO_SUPABASE_MIGRATIONS_CRITICAL_BLOCK = [
  "CRITICAL — Supabase schema migrations:",
  "You MUST include ALL database schema changes in the migrations array.",
  "This includes EVERY change needed for your code to work:",
  "",
  "New tables:",
  '  "CREATE TABLE IF NOT EXISTS table_name (...)"',
  "",
  "New columns on existing tables:",
  '  "ALTER TABLE todos ADD COLUMN IF NOT EXISTS due_at TIMESTAMPTZ"',
  '  "ALTER TABLE todos ADD COLUMN IF NOT EXISTS image_url TEXT"',
  "",
  "Auth + RLS (only when you implement login/signup/auth):",
  "- For every table that contains user-owned data (has user_id), include RLS migrations:",
  '  "ALTER TABLE public.<table> ENABLE ROW LEVEL SECURITY;"',
  '  "DROP POLICY IF EXISTS \\"users see own data\\" ON public.<table>;"',
  '  "CREATE POLICY \\"users see own data\\" ON public.<table> FOR ALL USING (auth.uid()::text = user_id);"',
  "- Also include a copyable SQL artifact file (e.g. rls.sql) containing the exact RLS statements.",
  "",
  "Multi-tenancy (ONLY when the user explicitly requests multi-tenant support):",
  "- Create tenants + tenant_members tables, add tenant_id to data tables, and add RLS policies that restrict rows by tenant membership.",
  "- Include both the schema + RLS policies in migrations, and include a copyable SQL artifact file (e.g. multi_tenant.sql).",
  "",
  "Storage buckets (REQUIRED whenever you use supabase.storage):",
  "  \"INSERT INTO storage.buckets (id, name, public) VALUES ('bucket-name', 'bucket-name', true) ON CONFLICT (id) DO NOTHING\"",
  "",
  "RULES:",
  "- Every SQL must be idempotent (IF NOT EXISTS, ON CONFLICT DO NOTHING)",
  "- If your code references a column → it MUST be in migrations",
  "- If your code uses supabase.storage → the bucket MUST be in migrations",
  "- Missing migrations = runtime errors for the user",
  "- Include ALL migrations even if you think they might already exist",
].join("\n");

const IMAGE_INTENT_PROMPT_CONTEXT: Record<BuilderImageIntent, string> = {
  logo: "The user has attached a logo image. Use it in the app header and favicon, and preserve its branding cues.",
  reference: "The user has attached a design reference image. Match the layout, visual hierarchy, and color direction where it fits the request.",
  error: "The user has attached an error screenshot. Diagnose the likely issue shown and prioritize fixing that problem in the code.",
  theme: "The user has attached a theme or brand guide image. Apply its colors, typography cues, and overall style consistently across the app.",
  general: "The user has attached an image as supporting context. Use it only where it clearly helps fulfill the request.",
};

const DESIGN_SYSTEM_PATTERNS: Array<{ id: string; patterns: RegExp }> = [
  {
    id: "material",
    patterns: /material\s*design|material\s*ui|\bmd3\b|material\s*you|\bgoogle\s*material\b/i,
  },
  {
    id: "apple-hig",
    patterns: /\bapple\s*hig\b|\bios\s*style\b|\bmacos\s*style\b|\bcupertino\b|\bapple\s*design\b/i,
  },
  {
    id: "linear",
    patterns: /\blinear\s*style\b|\blinear\s*design\b|\blinear\s*app\b|\blike\s*linear\b/i,
  },
  {
    id: "asana",
    patterns: /\basana\s*style\b|\basana\s*design\b|\blike\s*asana\b/i,
  },
  {
    id: "stripe",
    patterns: /\bstripe\s*style\b|\bstripe\s*design\b|\bstripe\s*dashboard\b|\blike\s*stripe\b/i,
  },
  {
    id: "notion",
    patterns: /\bnotion\s*style\b|\bnotion\s*design\b|\blike\s*notion\b/i,
  },
  {
    id: "vercel",
    patterns: /\bvercel\s*style\b|\bvercel\s*design\b|\blike\s*vercel\b/i,
  },
];

const DESIGN_SYSTEM_SPECS: Record<string, string> = {
  material: `
══ DESIGN SYSTEM: MATERIAL DESIGN 3 (Google) ══
Follow MD3 spec precisely. These override any other visual guidance.

TOKENS:
  Background:     #FFFBFE   Surface:        #FFFBFE   Surface variant: #E7E0EC
  On-background:  #1C1B1F   On-surface:     #1C1B1F   Outline:        #79747E
  Primary:        #6750A4   On-primary:     #FFFFFF   Primary container: #E8DEF8
  Secondary:      #625B71   Secondary ctr:  #E8DEF8   On-secondary-ctr: #1D192B
  Error:          #B3261E   Error container: #F9DEDC

TYPOGRAPHY (Roboto font stack: 'Roboto', system-ui, sans-serif):
  Display Large:   57px / 64px  weight 400
  Headline Large:  32px / 40px  weight 400
  Title Large:     22px / 28px  weight 400
  Title Medium:    16px / 24px  weight 500
  Body Large:      16px / 24px  weight 400
  Body Medium:     14px / 20px  weight 400
  Label Large:     14px / 20px  weight 500 (button text)

COMPONENTS:
  Navigation Drawer: 240–280px wide, full-height, bg #FFFBFE, border-r 1px #E7E0EC
    Nav items: pill shape (border-radius: 9999px), height 56px, padding 0 24px
    Active: bg #E8DEF8, text #21005D  Inactive: text #49454F
    Leading icon: 24×24, active color #6750A4

  Buttons:
    Filled: bg #6750A4, text #FFFFFF, radius 9999px, height 40px, px 24px — primary actions
    Outlined: border 1px #6750A4, text #6750A4, radius 9999px — secondary actions
    Text: text #6750A4, no border/bg — tertiary actions
    FAB: radius 16px, bg #6750A4, size 56px, shadow elevation 3

  Cards:
    Elevated: bg #FFFBFE, shadow 0 1px 2px rgba(0,0,0,0.08) 0 2px 8px rgba(0,0,0,0.05), radius 12px, padding 16px
    Filled: bg #E8DEF8, radius 12px, no shadow

  Top App Bar: height 64px, bg #FFFBFE, title 22px/weight 400
  Lists: 56px row height (48px compact), leading icon 24px, divider 1px #E7E0EC

SPACING: 4px grid. Use 4/8/12/16/24/32/48px increments.
`,
  "apple-hig": `
══ DESIGN SYSTEM: APPLE HUMAN INTERFACE GUIDELINES ══
Follow Apple HIG precisely. These override any other visual guidance.

TOKENS (Light mode):
  Background:       #F2F2F7   (system grouped background)
  Secondary bg:     #FFFFFF   (secondary system background)
  Tertiary bg:      #F2F2F7
  Label primary:    #000000   Label secondary: rgba(60,60,67,0.6)
  Label tertiary:   rgba(60,60,67,0.3)
  Separator:        rgba(60,60,67,0.29)  Fill:  rgba(120,120,128,0.2)
  System Blue:      #007AFF   System Green: #34C759  System Red:  #FF3B30
  System Orange:    #FF9500   System Purple: #AF52DE  System Teal: #5AC8FA

TYPOGRAPHY (-apple-system, 'SF Pro Display', 'SF Pro Text', system-ui, sans-serif):
  Large Title:   34px / 41px  weight 700
  Title 1:       28px / 34px  weight 700
  Title 2:       22px / 28px  weight 700
  Title 3:       20px / 25px  weight 600
  Headline:      17px / 22px  weight 600
  Body:          17px / 22px  weight 400
  Callout:       16px / 21px  weight 400
  Subhead:       15px / 20px  weight 400
  Footnote:      13px / 18px  weight 400
  Caption:       12px / 16px  weight 400

COMPONENTS:
  Sidebar (macOS/iPadOS):
    Width: 220–260px, bg #F2F2F7, border-r 1px rgba(60,60,67,0.29)
    Nav items: px 12px py 8px, rounded-lg (8px), height 32px
    Active: bg #007AFF text #FFFFFF  Hover: bg rgba(0,0,0,0.06)
    Section header: text 11px uppercase tracking-wide color rgba(60,60,67,0.6) px 12px mb 4px

  List rows (UIKit table-view style):
    Full width, height 44px (min), px 16px, bg #FFFFFF
    Divider: inset 16px, 1px solid #E5E5EA
    Trailing chevron: ChevronRight 14px color #C7C7CC (always on tappable rows)
    Leading avatar/icon: 32–40px rounded-full

  Toolbar: height 52px, bg rgba(242,242,247,0.8) blur(12px), border-b 1px rgba(60,60,67,0.29)

  Buttons:
    Primary: bg #007AFF text white, rounded-lg 10px, height 44px, px 16px, font-weight 600
    Secondary: border 1px #007AFF text #007AFF, rounded-lg
    Destructive: bg #FF3B30

  Cards: bg #FFFFFF, rounded-2xl (16px), no shadow (use bg contrast instead)
  Modal sheet: rounded-tl/tr 16px, bg #FFFFFF

SPACING: 4/8/12/16/20/24/32/44px. 44pt minimum tap target.
`,
  linear: `
══ DESIGN SYSTEM: LINEAR APP ══
Follow Linear's design language precisely. These override any other visual guidance.

TOKENS:
  Background:       #FFFFFF   Surface:    #FAFAFA   Sidebar bg: #F7F7F7
  Border:           #E5E5E5   Divider:    #F3F4F6
  Text primary:     #1A1A1A   Text secondary: #4B5563  Text tertiary: #9CA3AF
  Accent/primary:   #5E6AD2   (Linear indigo)
  Accent hover:     #4F5BBD
  Selection bg:     #EBEBEB   Selected text: #1A1A1A
  Priority urgent:  #E11D48   Priority high: #F97316
  Priority medium:  #EAB308   Priority low: #6B7280

TYPOGRAPHY (Inter, system-ui, sans-serif — base 13px):
  Base:    13px / 20px  weight 400  (this is the default for all body text)
  Medium:  13px / 20px  weight 500
  Label:   11px / 16px  weight 500 uppercase tracking-wide
  Large:   15px / 22px  weight 500 (headings only)
  Mono:    font-family: 'JetBrains Mono', 'Fira Code', monospace  12px (IDs, timestamps)

COMPONENTS:
  Sidebar:
    Width: 220px exactly, bg #F7F7F7, border-r 1px #E5E5E5
    Workspace header: px 12px py 8px, 5px rounded icon 20×20
    Section header: 11px uppercase tracking-wide color #9CA3AF, px 12px py 4px
    Nav item: px 12px py 6px rounded-lg, height ~28px, gap-2, icon 14px
    Active: bg #EBEBEB text #1A1A1A  Hover: bg #F0F0F0 text #1A1A1A
    Unread count: 11px text-right color #9CA3AF

  Issue list (the core component):
    Toolbar: height 40px, border-b 1px #E5E5E5, px 16px
    Column header row: height 32px, bg #FAFAFA, border-b #E5E5E5, 11px uppercase #9CA3AF, sticky
    Issue row: height 36px, border-b 1px #F3F4F6, px 16px, hover bg #F9F9F9
      Priority dot: 8px circle, color = priority color
      ID: font-mono 12px text-tertiary, w-16
      Title: 13px text-primary, flex-1
      Status badge: 12px text-secondary
      Assignee avatar: 24×24 rounded-full, bg #E5E7EB text 10px

  Buttons:
    Primary: bg #5E6AD2 text white, rounded-lg 6px, text 12px font-medium, px 10px py 6px
    Secondary: border 1px #E5E5E5 text #4B5563, rounded-lg 6px, text 12px
    Icon: 28×28, rounded-md, hover bg #EBEBEB, icon 14px

  Status pills: rounded-full px 8px py 2px, text 11px font-medium — inline status labels

SPACING: 4/8/12/16/24px. Tight density: most vertical rhythms are 28–36px.
DENSITY: Everything is compact. Reduce padding everywhere vs typical UI.
`,
  asana: `
══ DESIGN SYSTEM: ASANA ══
Follow Asana's visual language precisely. These override any other visual guidance.

TOKENS:
  Background:       #FFFFFF   Sidebar bg: #F6F8F9    Surface border: #E2E8F0
  Text primary:     #1A202C   Text secondary: #4A5568  Text tertiary: #718096
  Divider:          #EDF2F7   Fill light: #F6F8F9
  Coral/primary:    #F06A6A   Coral dark: #D95B5B     Coral bg: #FFF0F0
  Blue secondary:   #4573D2   Green success: #1DA462   Yellow warn: #F2C94C
  Gray action:      #6B7280

TYPOGRAPHY (Inter, system-ui, sans-serif — base 14px):
  H1:      24px / 32px  weight 700
  H2:      20px / 28px  weight 600
  H3:      16px / 24px  weight 600
  Body:    14px / 20px  weight 400
  Small:   12px / 16px  weight 400
  Label:   12px / 16px  weight 500

COMPONENTS:
  Sidebar:
    Width: 240px, bg #F6F8F9, border-r 1px #E2E8F0, py 12px
    Brand header: 28px avatar rounded-full bg coral, font-semibold 14px, px 16px pb 8px
    Nav item: px 16px py 8px, rounded-lg 8px, gap-2, icon 16px, text 14px font-medium
    Active: bg #EAEEF5 text #1A202C  Hover: bg #EDF2F7
    Section label: 11px uppercase tracking-wide color #718096, px 16px py 8px
    Project dot: 10×10 rounded-full, each project has a distinct color

  Task list (core component):
    Column headers: text 11px font-semibold uppercase tracking-wide #718096, border-b 1px #EDF2F7
    Task row: min-height 40px, border-b 1px #EDF2F7, grid layout 12 cols, hover bg #FAFAFA
    Checkbox: 16px circle (Circle icon when undone, CheckCircle2 when done)
    Done task: text-decoration line-through, color #A0AEC0
    Assignee avatar: 24×24 rounded-full bg #E2E8F0, initials 10px font-medium
    Priority badge: rounded-full px 8px py 2px, text 11px font-medium, bg = color+'18' (10% opacity)
    Due date: 14px text-secondary

  Buttons:
    Primary: bg #F06A6A text white, rounded-lg 8px, height 36px, px 16px, font-medium 14px
    Secondary: border 1px #E2E8F0 text #4A5568, rounded-lg 8px
    Ghost: text-only #718096, hover text #1A202C

  Summary cards: bg #FFFFFF rounded-2xl, no heavy shadow (use border), p 16px
  Modals/panels: rounded-2xl, shadow-lg, border border-#E2E8F0

SPACING: 4/8/12/16/20/24/32/40px. Standard density — not too tight, not spacious.
INTERACTIONS: Checkbox toggles are the primary interaction. Clicking a row should open a detail view.
`,
  stripe: `
══ DESIGN SYSTEM: STRIPE DASHBOARD ══
Follow Stripe's dashboard design language precisely. These override any other visual guidance.

TOKENS:
  Sidebar bg:       #1A1F36   (dark navy)
  Sidebar text:     #C1C9D2   Sidebar active text: #FFFFFF
  Sidebar hover:    rgba(255,255,255,0.08)  Sidebar active: rgba(255,255,255,0.1)
  Sidebar border:   rgba(255,255,255,0.08)
  Content bg:       #F6F9FC
  Card bg:          #FFFFFF   Card border: #E3E8EF   Card shadow: 0 1px 3px rgba(18,18,29,0.08)
  Text primary:     #1A1F36   Text secondary: #697386  Text tertiary: #9EA3AE
  Accent/primary:   #635BFF   (Stripe purple)
  Accent hover:     #4F48E2
  Success:          #09825D   Success bg: #ECFDF5     Success text: #065F46
  Danger:           #C0392B   Danger bg:  #FEF2F2     Danger text: #991B1B
  Warning:          #B45309   Warning bg: #FFF7ED     Warning text: #9A3412
  Processing:       #B45309   Processing bg: #FFF7ED
  Table header:     #F9FAFC   Table divider: #E3E8EF

TYPOGRAPHY (Inter, system-ui, sans-serif):
  Page title:    20px / 28px  weight 600  color #1A1F36
  Section head:  14px / 20px  weight 600  color #1A1F36
  Body:          14px / 20px  weight 400  color #1A1F36
  Label/meta:    12px / 16px  weight 400  color #697386
  Table header:  11px / 16px  weight 500 uppercase tracking-wide color #697386
  Mono:          font-family: 'SF Mono', 'Fira Code', monospace  12px — for IDs, amounts

COMPONENTS:
  Sidebar (DARK NAVY):
    Width: 224px, bg #1A1F36, full height
    Logo area: px 16px py 16px, brand mark + workspace name
    Nav item: px 12px py 10px mx 8px rounded-lg, icon 15px, text 13px font-medium, gap-2
    Active: bg rgba(255,255,255,0.1) text #FFFFFF  Inactive: text #8792A2
    Bottom profile: border-t rgba(255,255,255,0.08), avatar 28px rounded-full bg #635BFF

  Top bar: height 56px, bg #FFFFFF, border-b 1px #E3E8EF, px 24px
    Search: rounded-lg border #E3E8EF bg #F6F9FC, show ⌘K shortcut

  Metric cards:
    bg #FFFFFF, border 1px #E3E8EF, rounded-lg 8px, p 16px
    Label: 14px text-secondary  Value: 20px font-semibold text-primary
    Delta: 12px with ArrowUpRight/ArrowDownRight icon, color = green (up) or red (down)

  Data table:
    Container: bg #FFFFFF border 1px #E3E8EF rounded-lg overflow-hidden
    Table header row: bg #F9FAFC border-b #E3E8EF, 11px uppercase tracking-wide #697386, px 20px py 12px
    Data row: px 20px py 14px border-b #F3F4F6, hover bg #F9FAFC
    ID column: font-mono 12px text-tertiary
    Amount: 14px font-medium text-primary
    Status badge: rounded-full px 8px py 4px text 12px font-medium capitalize

  Buttons:
    Primary: bg #635BFF text white, rounded-md 6px, px 14px h 36px, font-medium 14px
    Secondary: border 1px #E3E8EF text #1A1F36 bg white, rounded-md 6px
    Danger: bg #C0392B text white

SPACING: 4/8/12/16/20/24/32/48px. Content area uses 24px horizontal padding.
LAYOUT: Always dark sidebar (224px) + light content area. Data tables are the core component.
`,
  notion: `
══ DESIGN SYSTEM: NOTION ══
Follow Notion's clean, minimal design language. These override any other visual guidance.

TOKENS:
  Background:       #FFFFFF   Sidebar bg: #F7F6F3
  Hover bg:         #EFEFEF   Active bg:  #E9E9E7
  Border:           #E9E9E7
  Text primary:     #37352F   Text secondary: #787774  Text placeholder: rgba(55,53,47,0.5)
  Accent:           #2EAADC   (Notion blue)  Accent bg: #E8F5FA
  Red:              #E03E3E   Yellow: #DFAB01  Green: #0F7B6C

TYPOGRAPHY (Inter, -apple-system, system-ui, sans-serif):
  Title/H1:  40px / 50px  weight 700  color #37352F
  H2:        30px / 38px  weight 700
  H3:        24px / 30px  weight 600
  Body:      16px / 24px  weight 400  (Notion uses 16px as base)
  Small:     14px / 20px  weight 400
  Caption:   12px / 16px  weight 400

COMPONENTS:
  Sidebar: 240px, bg #F7F6F3, no hard border (subtle shadow or bg diff only)
    Page items: px 12px py 4px rounded-md, icon/emoji 16px, text 14px
    Hover: bg #EFEFEF  Active: bg #E9E9E7 text #37352F
    Section: 11px uppercase tracking-wide #787774, px 12px py 6px mb 2px

  Content area: max-width 900px centered, px 96px (wide page: 64px), pt 96px
    Block editor feel: each section is a "block" with top/bottom margin

  Tables/databases:
    Property header: 12px font-medium uppercase tracking-wide #787774
    Row: 44px min-height, border-b 1px #E9E9E7, px 8px
    Hover: bg #F7F6F3
    Cell: 14px text-primary
    Status pills: rounded-full px 8px py 2px, 12px font-medium

  Buttons:
    Primary: bg #37352F text white, rounded-md 4px, px 12px h 32px text 14px font-medium
    Secondary: bg #EFEFEF text #37352F, rounded-md 4px
    Ghost: text-only, hover bg #EFEFEF

  Callout/info blocks: bg #F1F1EF, rounded-md, p 16px, left border none

SPACING: 4/8/12/16/24/32/48/64/96px. Generous whitespace, editorial feel.
FEEL: Wikipedia/document + database. Blocks, properties, views. Calm and minimal.
`,
  vercel: `
══ DESIGN SYSTEM: VERCEL DASHBOARD ══
Follow Vercel's sleek, developer-focused dark design language. These override any other visual guidance.

TOKENS (dark mode — Vercel defaults to dark):
  Background:       #000000   Surface:    #111111   Elevated: #1A1A1A
  Border:           #333333   Subtle:     #222222
  Text primary:     #EDEDED   Text secondary: #888888  Text tertiary: #666666
  Accent/primary:   #FFFFFF   (white primary actions on dark)
  Blue:             #0070F3   Blue light: #3291FF     Blue dark: #0761D1
  Success:          #50E3C2   Error:      #FF0080     Warning: #F5A623
  Code bg:          #0D1117   Code text:  #79C0FF

TYPOGRAPHY ('Geist', Inter, system-ui, sans-serif):
  H1:      32px / 40px  weight 700  color #EDEDED
  H2:      24px / 32px  weight 600  color #EDEDED
  H3:      18px / 26px  weight 600  color #EDEDED
  Body:    14px / 22px  weight 400  color #EDEDED
  Small:   12px / 18px  weight 400  color #888888
  Mono:    'Geist Mono', 'JetBrains Mono', monospace  13px — for paths, IDs, code

COMPONENTS:
  Main nav (top bar):
    bg #000000, border-b 1px #333333, height 56px, px 24px
    Logo: left-aligned, white Vercel triangle/wordmark
    Nav links: 14px #888888, hover #EDEDED, px 12px
    Right: avatar, CTA button

  Sidebar (project nav):
    Width: 240px, bg #000000, border-r 1px #333333, py 8px
    Nav item: px 12px py 8px rounded-lg, text 14px, gap-2, icon 16px
    Active: bg #1A1A1A text #EDEDED  Inactive: text #888888 hover bg #111111

  Deployment cards:
    bg #111111, border 1px #333333, rounded-lg 8px, p 16px
    Domain name: 14px font-medium #EDEDED
    Status badge: rounded-full px 8px py 3px text 12px
      Success: bg #0D2818 text #50E3C2   Failed: bg #1F0A1A text #FF0080  Building: bg #1A1200 text #F5A623

  Data table (dark):
    Container: bg #111111 border 1px #333333 rounded-lg
    Header: bg #0A0A0A border-b #333333, 11px uppercase #666666 tracking-wide, px 20px py 12px
    Row: px 20px py 14px border-b #222222 hover bg #1A1A1A
    Cell: 14px #888888  Key cell: 14px #EDEDED font-medium

  Buttons:
    Primary: bg #FFFFFF text #000000, rounded-md 6px, px 14px h 36px font-medium — high contrast
    Secondary: bg transparent border 1px #333333 text #EDEDED, rounded-md 6px
    Destructive: bg #FF0080 text white

  Code blocks: bg #0D1117, border 1px #30363D, rounded-lg, p 16px, mono 13px

SPACING: 4/8/12/16/24/32/48px. Developer-first: data-dense, minimal decoration.
FEEL: Dark, sleek, professional. Commands attention. GitHub/VS Code aesthetic.
`,
};

interface ThemeTokens {
  primary: string;
  primaryHover: string;
  background: string;
  surface: string;
  sidebar: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  accentHover: string;
  success: string;
  warning: string;
  error: string;
  info: string;
  borderRadius: string;
  borderRadiusLg: string;
}

const DEFAULT_THEME: ThemeTokens = {
  primary: "#3b82f6",
  primaryHover: "#2563eb",
  background: "#f8fafc",
  surface: "#ffffff",
  sidebar: "#f1f5f9",
  border: "#e2e8f0",
  textPrimary: "#111827",
  textSecondary: "#6b7280",
  textMuted: "#9ca3af",
  accent: "#6366f1",
  accentHover: "#4f46e5",
  success: "#10b981",
  warning: "#f59e0b",
  error: "#ef4444",
  info: "#3b82f6",
  borderRadius: "8px",
  borderRadiusLg: "12px",
};

const PALETTE_THEME_TOKENS: Record<string, ThemeTokens> = {
  "professional-blue": DEFAULT_THEME,
  "crypto-dark": {
    primary: "#6366f1", primaryHover: "#4f46e5",
    background: "#0c0c1a", surface: "#13131f",
    sidebar: "#0f0f1a", border: "#1e1e3a",
    textPrimary: "#e2e8f0", textSecondary: "#94a3b8", textMuted: "#475569",
    accent: "#a855f7", accentHover: "#9333ea",
    success: "#22c55e", warning: "#f59e0b", error: "#ef4444", info: "#6366f1",
    borderRadius: "8px", borderRadiusLg: "12px",
  },
  "law-navy": {
    primary: "#1e3a5f", primaryHover: "#162c4a",
    background: "#f5f5f0", surface: "#ffffff",
    sidebar: "#1e3a5f", border: "#d1d5db",
    textPrimary: "#111827", textSecondary: "#4b5563", textMuted: "#9ca3af",
    accent: "#c9a84c", accentHover: "#b8952e",
    success: "#10b981", warning: "#f59e0b", error: "#ef4444", info: "#3b82f6",
    borderRadius: "4px", borderRadiusLg: "8px",
  },
  "finance-green": {
    primary: "#16a34a", primaryHover: "#15803d",
    background: "#f7faf8", surface: "#ffffff",
    sidebar: "#f0f7f1", border: "#d1fae5",
    textPrimary: "#111827", textSecondary: "#374151", textMuted: "#9ca3af",
    accent: "#059669", accentHover: "#047857",
    success: "#16a34a", warning: "#f59e0b", error: "#ef4444", info: "#3b82f6",
    borderRadius: "8px", borderRadiusLg: "12px",
  },
  "medical-blue": {
    primary: "#0284c7", primaryHover: "#0369a1",
    background: "#f0f9ff", surface: "#ffffff",
    sidebar: "#e0f2fe", border: "#bae6fd",
    textPrimary: "#0c4a6e", textSecondary: "#075985", textMuted: "#94a3b8",
    accent: "#06b6d4", accentHover: "#0891b2",
    success: "#10b981", warning: "#f59e0b", error: "#ef4444", info: "#0284c7",
    borderRadius: "8px", borderRadiusLg: "16px",
  },
  "energy-red": {
    primary: "#dc2626", primaryHover: "#b91c1c",
    background: "#fff5f5", surface: "#ffffff",
    sidebar: "#1a1a1a", border: "#e5e7eb",
    textPrimary: "#111827", textSecondary: "#6b7280", textMuted: "#9ca3af",
    accent: "#f97316", accentHover: "#ea580c",
    success: "#10b981", warning: "#f59e0b", error: "#dc2626", info: "#3b82f6",
    borderRadius: "8px", borderRadiusLg: "12px",
  },
  "health-teal": {
    primary: "#0d9488", primaryHover: "#0f766e",
    background: "#f0fdfa", surface: "#ffffff",
    sidebar: "#f0fdfa", border: "#ccfbf1",
    textPrimary: "#134e4a", textSecondary: "#374151", textMuted: "#9ca3af",
    accent: "#14b8a6", accentHover: "#0d9488",
    success: "#10b981", warning: "#f59e0b", error: "#ef4444", info: "#06b6d4",
    borderRadius: "12px", borderRadiusLg: "16px",
  },
  "warm-amber": {
    primary: "#d97706", primaryHover: "#b45309",
    background: "#fffbeb", surface: "#ffffff",
    sidebar: "#fef3c7", border: "#fde68a",
    textPrimary: "#111827", textSecondary: "#4b5563", textMuted: "#9ca3af",
    accent: "#f59e0b", accentHover: "#d97706",
    success: "#10b981", warning: "#d97706", error: "#ef4444", info: "#3b82f6",
    borderRadius: "8px", borderRadiusLg: "12px",
  },
  "kids-yellow": {
    primary: "#ca8a04", primaryHover: "#a16207",
    background: "#fefce8", surface: "#ffffff",
    sidebar: "#fef9c3", border: "#fde047",
    textPrimary: "#111827", textSecondary: "#4b5563", textMuted: "#9ca3af",
    accent: "#f97316", accentHover: "#ea580c",
    success: "#10b981", warning: "#ca8a04", error: "#ef4444", info: "#3b82f6",
    borderRadius: "12px", borderRadiusLg: "20px",
  },
  "midnight-indigo": {
    primary: "#4f46e5", primaryHover: "#4338ca",
    background: "#f5f3ff", surface: "#ffffff",
    sidebar: "#f5f3ff", border: "#e0e7ff",
    textPrimary: "#111827", textSecondary: "#4b5563", textMuted: "#9ca3af",
    accent: "#7c3aed", accentHover: "#6d28d9",
    success: "#10b981", warning: "#f59e0b", error: "#ef4444", info: "#4f46e5",
    borderRadius: "8px", borderRadiusLg: "12px",
  },
  "retail-coral": {
    primary: "#e11d48", primaryHover: "#be123c",
    background: "#fff1f2", surface: "#ffffff",
    sidebar: "#fff1f2", border: "#fce7f3",
    textPrimary: "#111827", textSecondary: "#4b5563", textMuted: "#9ca3af",
    accent: "#f97316", accentHover: "#ea580c",
    success: "#10b981", warning: "#f59e0b", error: "#e11d48", info: "#3b82f6",
    borderRadius: "8px", borderRadiusLg: "16px",
  },
  "rose-pink": {
    primary: "#db2777", primaryHover: "#be185d",
    background: "#fdf2f8", surface: "#ffffff",
    sidebar: "#fce7f3", border: "#fbcfe8",
    textPrimary: "#111827", textSecondary: "#4b5563", textMuted: "#9ca3af",
    accent: "#ec4899", accentHover: "#db2777",
    success: "#10b981", warning: "#f59e0b", error: "#ef4444", info: "#3b82f6",
    borderRadius: "12px", borderRadiusLg: "20px",
  },
  "ocean-cyan": {
    primary: "#0891b2", primaryHover: "#0e7490",
    background: "#ecfeff", surface: "#ffffff",
    sidebar: "#cffafe", border: "#a5f3fc",
    textPrimary: "#111827", textSecondary: "#164e63", textMuted: "#9ca3af",
    accent: "#06b6d4", accentHover: "#0891b2",
    success: "#10b981", warning: "#f59e0b", error: "#ef4444", info: "#0891b2",
    borderRadius: "8px", borderRadiusLg: "16px",
  },
  "nature-emerald": {
    primary: "#059669", primaryHover: "#047857",
    background: "#f0fdf4", surface: "#ffffff",
    sidebar: "#dcfce7", border: "#bbf7d0",
    textPrimary: "#111827", textSecondary: "#374151", textMuted: "#9ca3af",
    accent: "#16a34a", accentHover: "#15803d",
    success: "#059669", warning: "#f59e0b", error: "#ef4444", info: "#3b82f6",
    borderRadius: "8px", borderRadiusLg: "16px",
  },
  "gaming-neon": {
    primary: "#a855f7", primaryHover: "#9333ea",
    background: "#050505", surface: "#111111",
    sidebar: "#0a0a0a", border: "#1f1f1f",
    textPrimary: "#f1f5f9", textSecondary: "#94a3b8", textMuted: "#475569",
    accent: "#22d3ee", accentHover: "#06b6d4",
    success: "#22c55e", warning: "#f59e0b", error: "#f43f5e", info: "#a855f7",
    borderRadius: "4px", borderRadiusLg: "8px",
  },
  "creative-purple": {
    primary: "#7c3aed", primaryHover: "#6d28d9",
    background: "#faf5ff", surface: "#ffffff",
    sidebar: "#f5f3ff", border: "#ede9fe",
    textPrimary: "#111827", textSecondary: "#4b5563", textMuted: "#9ca3af",
    accent: "#a855f7", accentHover: "#9333ea",
    success: "#10b981", warning: "#f59e0b", error: "#ef4444", info: "#7c3aed",
    borderRadius: "12px", borderRadiusLg: "16px",
  },
  "startup-violet": {
    primary: "#6d28d9", primaryHover: "#5b21b6",
    background: "#f5f3ff", surface: "#ffffff",
    sidebar: "#ede9fe", border: "#ddd6fe",
    textPrimary: "#111827", textSecondary: "#4b5563", textMuted: "#9ca3af",
    accent: "#8b5cf6", accentHover: "#7c3aed",
    success: "#10b981", warning: "#f59e0b", error: "#ef4444", info: "#6d28d9",
    borderRadius: "8px", borderRadiusLg: "12px",
  },
  "news-charcoal": {
    primary: "#1f2937", primaryHover: "#111827",
    background: "#f9fafb", surface: "#ffffff",
    sidebar: "#1f2937", border: "#e5e7eb",
    textPrimary: "#111827", textSecondary: "#4b5563", textMuted: "#9ca3af",
    accent: "#ef4444", accentHover: "#dc2626",
    success: "#10b981", warning: "#f59e0b", error: "#ef4444", info: "#3b82f6",
    borderRadius: "4px", borderRadiusLg: "8px",
  },
  "slate-neutral": {
    primary: "#475569", primaryHover: "#334155",
    background: "#f8fafc", surface: "#ffffff",
    sidebar: "#f1f5f9", border: "#e2e8f0",
    textPrimary: "#0f172a", textSecondary: "#475569", textMuted: "#94a3b8",
    accent: "#0ea5e9", accentHover: "#0284c7",
    success: "#10b981", warning: "#f59e0b", error: "#ef4444", info: "#0ea5e9",
    borderRadius: "6px", borderRadiusLg: "10px",
  },
  "warm-orange": {
    primary: "#ea580c", primaryHover: "#c2410c",
    background: "#fff7ed", surface: "#ffffff",
    sidebar: "#fff7ed", border: "#fed7aa",
    textPrimary: "#111827", textSecondary: "#4b5563", textMuted: "#9ca3af",
    accent: "#f97316", accentHover: "#ea580c",
    success: "#10b981", warning: "#ea580c", error: "#ef4444", info: "#3b82f6",
    borderRadius: "8px", borderRadiusLg: "12px",
  },
  "coral-sunset": {
    primary: "#f77f50", primaryHover: "#e56b3a",
    background: "#fff8f5", surface: "#ffffff",
    sidebar: "#fff1ea", border: "#fddccc",
    textPrimary: "#1c1917", textSecondary: "#57534e", textMuted: "#a8a29e",
    accent: "#fb923c", accentHover: "#f97316",
    success: "#10b981", warning: "#f59e0b", error: "#ef4444", info: "#06b6d4",
    borderRadius: "12px", borderRadiusLg: "20px",
  },
  "ocean-teal": {
    primary: "#0891b2", primaryHover: "#0e7490",
    background: "#f0fdfa", surface: "#ffffff",
    sidebar: "#e0f7fa", border: "#b2ebf2",
    textPrimary: "#111827", textSecondary: "#374151", textMuted: "#9ca3af",
    accent: "#0d9488", accentHover: "#0f766e",
    success: "#10b981", warning: "#f59e0b", error: "#ef4444", info: "#0891b2",
    borderRadius: "8px", borderRadiusLg: "12px",
  },
  "forest-green": {
    primary: "#166534", primaryHover: "#14532d",
    background: "#f0fdf4", surface: "#ffffff",
    sidebar: "#dcfce7", border: "#bbf7d0",
    textPrimary: "#111827", textSecondary: "#374151", textMuted: "#9ca3af",
    accent: "#22c55e", accentHover: "#16a34a",
    success: "#15803d", warning: "#f59e0b", error: "#ef4444", info: "#0284c7",
    borderRadius: "8px", borderRadiusLg: "16px",
  },
};

const PREVIEW_SHELL_ICON_CONTEXT = [
  "PREVIEW SHELL CONTEXT:",
  "The generated app is rendered inside a Beomz preview shell.",
  "The shell header shows an app icon: a colored square with a lucide-react icon inside it, plus the app name as text next to it.",
  "When the user says 'logo', 'app icon', 'logo color', or 'icon color', they usually mean this preview-shell icon rather than a separate uploaded brand asset.",
  "In generated apps, the most reliable source of truth for that icon color is theme.ts.",
  "Use theme.accent as the primary icon/logo color token. For requests like 'make the logo orange', update theme.accent to '#F97316' and theme.accentHover to '#EA580C' when appropriate.",
  "Do not invent a new logo image unless the user explicitly asks for a custom graphic asset.",
].join("\n");

const ITERATION_MAX_SEED_FILES = 6;
const ITERATION_MAX_SEARCH_MATCHES = 5;
const ITERATION_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "app",
  "button",
  "change",
  "create",
  "for",
  "from",
  "in",
  "into",
  "it",
  "make",
  "new",
  "of",
  "on",
  "page",
  "screen",
  "section",
  "tab",
  "the",
  "this",
  "to",
  "update",
  "with",
]);

const ROLE_INDICATORS = [
  "owner", "admin", "manager", "officer", "user", "staff",
  "customer", "employee", "tenant", "operator",
];

const DOMAIN_COMPLEXITY_KEYWORDS = [
  "scheduling", "workflow", "portal", "dashboard", "management",
  "tracking", "reporting", "billing", "inventory", "compliance",
  "admissions", "dispensing", "laboratory", "clinical", "surgical",
];

const MULTI_ENTITY_INDICATORS = [
  "patients", "staff", "doctors", "nurses", "users", "clients",
  "customers", "employees", "vendors", "suppliers", "tenants",
];

function detectDesignSystem(prompt: string): string | null {
  for (const { id, patterns } of DESIGN_SYSTEM_PATTERNS) {
    if (patterns.test(prompt)) {
      console.log("[generate] design system detected:", id);
      return id;
    }
  }
  return null;
}

function getDesignSystemSpec(designSystemId: string): string {
  return DESIGN_SYSTEM_SPECS[designSystemId] ?? "";
}

function buildThemeTs(paletteId: string): string {
  const t = PALETTE_THEME_TOKENS[paletteId] ?? DEFAULT_THEME;
  return [
    "export const theme = {",
    `  primary:        '${t.primary}',`,
    `  primaryHover:   '${t.primaryHover}',`,
    `  background:     '${t.background}',`,
    `  surface:        '${t.surface}',`,
    `  sidebar:        '${t.sidebar}',`,
    `  border:         '${t.border}',`,
    `  textPrimary:    '${t.textPrimary}',`,
    `  textSecondary:  '${t.textSecondary}',`,
    `  textMuted:      '${t.textMuted}',`,
    `  accent:         '${t.accent}',`,
    `  accentHover:    '${t.accentHover}',`,
    `  success:        '${t.success}',`,
    `  warning:        '${t.warning}',`,
    `  error:          '${t.error}',`,
    `  info:           '${t.info}',`,
    `  borderRadius:   '${t.borderRadius}',`,
    `  borderRadiusLg: '${t.borderRadiusLg}',`,
    "} as const;",
    "",
    "export type Theme = typeof theme;",
  ].join("\n");
}

function splitIntoSearchTokens(value: string): string[] {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9#]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !ITERATION_STOP_WORDS.has(token));
}

function uniqueTokens(tokens: readonly string[]): string[] {
  return [...new Set(tokens)];
}

function extractImportsFromContent(content: string): string[] {
  return uniqueTokens(
    [...content.matchAll(/from\s+['"]([^'"]+)['"]/g)]
      .map((match) => basename(match[1]).replace(/\.(tsx?|jsx?)$/, ""))
      .filter(Boolean),
  );
}

function extractExportsFromContent(content: string): string[] {
  const exports = [
    ...content.matchAll(/export\s+default\s+function\s+([A-Za-z0-9_]+)/g),
    ...content.matchAll(/export\s+function\s+([A-Za-z0-9_]+)/g),
    ...content.matchAll(/export\s+const\s+([A-Za-z0-9_]+)/g),
  ].map((match) => match[1]);
  return uniqueTokens(exports);
}

function countTokenOverlap(tokens: readonly string[], queryTokens: readonly string[]): number {
  const querySet = new Set(queryTokens);
  let score = 0;
  for (const token of tokens) {
    if (querySet.has(token)) {
      score += 1;
    }
  }
  return score;
}

function isAppearanceEdit(prompt: string): boolean {
  return /\b(color|colour|theme|accent|logo|icon color|icon|background|font|typography|dark mode|light mode|redesign|brand)\b/i.test(prompt);
}

function isDependencyEdit(prompt: string): boolean {
  return /\b(package|dependency|npm|library|install|stripe|supabase|neon|sdk|auth)\b/i.test(prompt);
}

function isNavigationEdit(prompt: string): boolean {
  return /\b(page|route|screen|tab|sidebar|navigation|nav|menu|section)\b/i.test(prompt);
}

function isPriorityAppearanceBasename(base: string): boolean {
  return /^(theme\.(ts|js)|styles?\.css|tailwind\.config\.(ts|js|cjs|mjs))$/i.test(base);
}

function isAppearanceFilename(base: string): boolean {
  return /\b(theme|color|colour|style|styles)\b/i.test(base);
}

function hasAppearanceContent(content: string): boolean {
  return /\b(theme|colors?|palette)\b/i.test(content.slice(0, 5000));
}

function isAppearanceSeedCandidate(file: IterationFileContext): boolean {
  return (
    isPriorityAppearanceBasename(file.basename)
    || isAppearanceFilename(file.basename)
    || hasAppearanceContent(file.content)
    || file.kind === "style"
  );
}

function buildIterationFileContexts(existingFiles: readonly StudioFile[], prompt: string): IterationFileContext[] {
  const promptTokens = splitIntoSearchTokens(prompt);
  const appearanceEdit = isAppearanceEdit(prompt);

  return existingFiles.map((file) => {
    const base = basename(file.path);
    const fileNameTokens = splitIntoSearchTokens(basename(file.path));
    const exportTokens = extractExportsFromContent(file.content).flatMap((value) => splitIntoSearchTokens(value));
    const importTokens = extractImportsFromContent(file.content).flatMap((value) => splitIntoSearchTokens(value));
    const contentTokens = splitIntoSearchTokens(file.content.slice(0, 5000));
    let score = 0;

    score += countTokenOverlap(fileNameTokens, promptTokens) * 8;
    score += countTokenOverlap(exportTokens, promptTokens) * 5;
    score += countTokenOverlap(importTokens, promptTokens) * 3;
    score += Math.min(countTokenOverlap(contentTokens, promptTokens), 12);

    if (appearanceEdit) {
      if (isPriorityAppearanceBasename(base)) score += 90;
      if (isAppearanceFilename(base)) score += 35;
      if (hasAppearanceContent(file.content)) score += 24;
      if (file.kind === "style") score += 18;
    }

    if (base === "theme.ts" && appearanceEdit) score += 60;
    if (base === "package.json" && isDependencyEdit(prompt)) score += 50;
    if (base === "App.tsx" && isNavigationEdit(prompt)) score += 35;
    if (/Page\.(tsx|jsx)$/i.test(base) && isNavigationEdit(prompt)) score += 15;

    return {
      path: file.path,
      basename: base,
      kind: file.kind,
      language: file.language,
      content: file.content,
      lines: file.content.split(/\r?\n/).length,
      imports: extractImportsFromContent(file.content),
      exports: extractExportsFromContent(file.content),
      keywords: uniqueTokens([...fileNameTokens, ...exportTokens, ...importTokens, ...contentTokens]).slice(0, 20),
      score,
    };
  });
}

function expandIterationSeedFiles(
  sortedFiles: readonly IterationFileContext[],
  allFiles: readonly IterationFileContext[],
  prompt: string,
): IterationFileContext[] {
  const byBasename = new Map(allFiles.map((file) => [file.basename, file]));
  const selected = new Map<string, IterationFileContext>();
  const appearanceOnly = isAppearanceEdit(prompt);

  const add = (file: IterationFileContext | undefined) => {
    if (!file) return;
    if (!selected.has(file.basename) && selected.size < ITERATION_MAX_SEED_FILES) {
      selected.set(file.basename, file);
    }
  };

  if (appearanceOnly) {
    for (const priorityName of [
      "theme.ts",
      "theme.js",
      "styles.css",
      "tailwind.config.ts",
      "tailwind.config.js",
      "tailwind.config.cjs",
      "tailwind.config.mjs",
    ]) {
      add(byBasename.get(priorityName));
    }

    for (const file of sortedFiles) {
      if (selected.size >= ITERATION_MAX_SEED_FILES) break;
      if (isAppearanceSeedCandidate(file)) add(file);
    }

    if (selected.size === 0) add(byBasename.get("theme.ts") ?? sortedFiles[0]);
    return [...selected.values()];
  }

  if (isDependencyEdit(prompt)) add(byBasename.get("package.json"));
  if (isNavigationEdit(prompt)) add(byBasename.get("App.tsx"));

  for (const file of sortedFiles) {
    if (selected.size >= ITERATION_MAX_SEED_FILES) break;
    add(file);
  }

  for (const file of [...selected.values()]) {
    for (const importName of file.imports) {
      if (selected.size >= ITERATION_MAX_SEED_FILES) break;
      add(byBasename.get(`${importName}.tsx`) ?? byBasename.get(`${importName}.ts`) ?? byBasename.get(importName));
    }
  }

  if (selected.size === 0) add(byBasename.get("App.tsx") ?? sortedFiles[0]);
  return [...selected.values()];
}

function buildIterationManifest(files: readonly IterationFileContext[]): string {
  return [
    "Project file manifest:",
    ...files.map((file) => {
      const exportsLabel = file.exports.length > 0 ? file.exports.join(", ") : "none";
      const importsLabel = file.imports.length > 0 ? file.imports.join(", ") : "none";
      return `- ${file.basename} | kind=${file.kind} | lang=${file.language} | lines=${file.lines} | exports=${exportsLabel} | imports=${importsLabel}`;
    }),
  ].join("\n");
}

function buildIterationSeedFilesContext(seedFiles: readonly IterationFileContext[]): string {
  return [
    "Seed file contents (already selected as the most likely files to inspect first):",
    "",
    ...seedFiles.map((file) => `### ${file.basename}\n\`\`\`\n${file.content}\n\`\`\``),
  ].join("\n");
}

function buildIterationLegacyFilesContext(existingFiles: readonly StudioFile[]): string {
  const codebase = existingFiles
    .map((file) => `### ${file.path}\n\`\`\`\n${file.content}\n\`\`\``)
    .join("\n\n");

  return [
    "Here is the current codebase:",
    "",
    codebase,
  ].join("\n");
}

function buildIterationEditRequest(prompt: string): string {
  return `Edit request: ${prompt}`;
}

function buildIterationSelection(
  prompt: string,
  existingFiles: readonly StudioFile[],
  imageBlock?: IterationImageBlock,
): IterationSelectionResult {
  const contexts = buildIterationFileContexts(existingFiles, prompt);
  const sorted = [...contexts].sort((a, b) => b.score - a.score || a.basename.localeCompare(b.basename));
  const seedFiles = expandIterationSeedFiles(sorted, contexts, prompt);
  const manifest = buildIterationManifest(sorted);
  const editRequest = buildIterationEditRequest(prompt);
  const legacyUserMessage = [
    buildIterationLegacyFilesContext(existingFiles),
    "",
    editRequest,
  ].join("\n");

  const optimizedText = [
    manifest,
    "",
    buildIterationSeedFilesContext(seedFiles),
    "",
    editRequest,
  ].join("\n");

  const optimizedUserContent = imageBlock
    ? [
        imageBlock,
        { type: "text", text: optimizedText, cache_control: { type: "ephemeral" } } as any,
      ]
    : [
        { type: "text", text: optimizedText, cache_control: { type: "ephemeral" } } as any,
      ];

  return {
    manifest,
    seedFiles,
    legacyUserMessage,
    optimizedText,
    optimizedUserContent,
  };
}

function buildIterationUserMessage(
  prompt: string,
  existingFiles: readonly StudioFile[],
): string {
  return buildIterationSelection(prompt, existingFiles).optimizedText;
}

function buildIterationSystemPrompt(
  schemaSummary?: string,
  imageContextBlock?: string,
  hasWiredSupabaseClient = false,
  dbProvider: string | null = null,
  neonAuthBaseUrl: string | null = null,
  hasByoSupabaseConfig = false,
  imageEmbeddingInstructionBlock?: string,
  dbContextBlock?: string,
): string {
  const isPostgresWired = hasWiredSupabaseClient && (dbProvider === "neon" || dbProvider === "postgres");
  const hasNeonAuth = dbProvider === "neon"
    && isPostgresWired
    && typeof neonAuthBaseUrl === "string"
    && neonAuthBaseUrl.length > 0;
  const dbBlock = schemaSummary
    ? [
        "",
        "DATABASE SCHEMA (current live schema for this project):",
        schemaSummary,
        "If the requested change needs new columns or tables, include the required SQL in the migrations array:",
        "  - ALTER TABLE \"schema\".\"table\" ADD COLUMN IF NOT EXISTS col_name col_type;",
        "  - CREATE TABLE IF NOT EXISTS \"schema\".\"table_name\" (id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY, ...);",
        "NEVER include DROP TABLE, DROP COLUMN, or ALTER COLUMN TYPE.",
        "If no schema changes are needed, return an empty migrations array.",
      ].join("\n")
    : "";
  const imageBlock = imageContextBlock
    ? ["", "IMAGE CONTEXT:", imageContextBlock].join("\n")
    : "";
  const imageEmbeddingBlock = imageEmbeddingInstructionBlock
    ? ["", imageEmbeddingInstructionBlock].join("\n")
    : "";
  const dbContextPromptBlock = dbContextBlock ? ["", dbContextBlock].join("\n") : "";
  const byoSupabaseBlock = hasByoSupabaseConfig
    ? [
        "",
        "BYO SUPABASE (highest priority rule):",
        BYO_SUPABASE_SYSTEM_PROMPT_BLOCK,
        "",
        BYO_SUPABASE_MIGRATIONS_CRITICAL_BLOCK,
      ].join("\n")
    : "";
  const existingSupabaseClientBlock = hasWiredSupabaseClient && !isPostgresWired
    ? [
        "",
        "This project already has Supabase wired. The existing code uses inline createClient() calls — do NOT create or import from a shared supabase.ts or supabase.tsx file.",
        "Do NOT generate any file named supabase.ts, supabase.tsx, supabase-js, or supabase-client.",
        "Continue the same inline createClient() pattern already present in the existing project files.",
        "Use the Supabase URL and anon key already present in the codebase.",
      ].join("\n")
    : "";
  const neonDbBlock = isPostgresWired
    ? [
        "",
        dbProvider === "postgres"
          ? "This project uses a BYO Postgres database. The connection string is available as import.meta.env.VITE_DATABASE_URL."
          : "This project uses a Neon Postgres database. The connection string is available as import.meta.env.VITE_DATABASE_URL.",
        "Use @neondatabase/serverless (browser-safe HTTP) to connect:",
        "  import { neon } from '@neondatabase/serverless';",
        "  const sql = neon(import.meta.env.VITE_DATABASE_URL);",
        "  // Query example:",
        "  const tasks = await sql`SELECT * FROM tasks`;",
        "  // Insert example:",
        "  await sql`INSERT INTO tasks (title, done) VALUES (${title}, false)`;",
        "  // CREATE TABLE example:",
        "  await sql`CREATE TABLE IF NOT EXISTS tasks (",
        "    id SERIAL PRIMARY KEY,",
        "    title TEXT NOT NULL,",
        "    done BOOLEAN DEFAULT false,",
        "    created_at TIMESTAMPTZ DEFAULT NOW()",
        "  )`;",
        "Use tagged template literals: sql`...` (NOT sql('...')).",
        "All DB calls are async — use await in useEffect or event handlers.",
        "Create tables with CREATE TABLE IF NOT EXISTS at app startup (in a useEffect or init function that runs once on mount).",
        "Do NOT use @supabase/supabase-js. Do NOT use createClient().",
        "Do NOT use pg.",
      ].join("\n")
    : "";
  const neonAuthBlock = hasNeonAuth
    ? [
        "",
        "Authentication (Neon Auth — already provisioned):",
        "- Use @neondatabase/neon-js for auth",
        "- import { createAuthClient } from '@neondatabase/neon-js/auth'",
        "- import { NeonAuthUIProvider, AuthView } from '@neondatabase/neon-js/auth/react/ui'",
        "- const authClient = createAuthClient(import.meta.env.VITE_NEON_AUTH_URL)",
        "- Wrap app in <NeonAuthUIProvider authClient={authClient}>",
        "- Add sign-in page: <AuthView pathname='sign-in' />",
        "- Auth includes Google, GitHub, and email/password by default",
      ].join("\n")
    : "";
  const dbImportRules = isPostgresWired
    ? [
        "NEON IMPORTS:",
        "Use: import { neon } from '@neondatabase/serverless' and import.meta.env.VITE_DATABASE_URL.",
        "Use sql tagged templates (sql`...`) and CREATE TABLE IF NOT EXISTS at startup.",
        "Do NOT use pg. Do NOT use @supabase/supabase-js. Do NOT use createClient().",
      ]
    : [
        "SUPABASE IMPORTS:",
        "Always use: import { createClient } from '@supabase/supabase-js'",
        "NEVER use './supabase-js', '../supabase-js', or 'supabase-js' — these will crash the app.",
      ];
  return [
    "You are making a surgical edit to an existing React app.",
    ITERATION_STRICT_REBUILD_RULE,
    imageBlock,
    imageEmbeddingBlock,
    byoSupabaseBlock,
    "",
    "RULES:",
    "1. Start from the project manifest and seed files already provided.",
    "2. If you need more context, use search_project_code and read_project_file before editing.",
    "3. Identify the MINIMUM set of files that need to change to fulfil this request.",
    "4. Make precise, targeted changes — do not rewrite files that don't need changing.",
    "5. Only return files you actually modified.",
    "6. If adding a new feature requires a new file, create it and update any imports.",
    "7. Preserve all existing functionality — do not break what already works.",
    "8. Match the existing code style, naming conventions, and patterns exactly.",
    "",
    "Think step by step:",
    "- What is the user asking for?",
    "- Which files need to change?",
    "- What is the minimal change to each file?",
    "",
    "TOKEN BUDGET: Your entire response must stay under 8,000 output tokens for feature additions, and under 3,000 tokens for minor changes (styling, text, small UI tweaks). This is a hard limit.",
    "Do NOT rewrite files that only need 1-2 line changes — return only the specific changed lines with minimal surrounding context (5 lines max above and below the change).",
    "Never return a file unchanged. Only include files that have actual modifications. If a file needs no changes, do not include it.",
    "",
    "Additional constraints:",
    "Keep all imports flat — e.g. import X from './X' (no subdirectory paths like './components/X').",
    "Never add external CDN links, Google Fonts, or remote URLs (WebContainer COEP policy).",
    "Do NOT include <script src=\"https://cdn.tailwindcss.com\"> or any cdn.tailwindcss.com link/script tag. Tailwind CSS v4 is already configured in the scaffold.",
    ...dbImportRules,
    "Never use hyphens in JavaScript/TypeScript function names, component names, or variable names. File names may use hyphens (e.g. supabase-client.ts) but the exported function or component inside must use camelCase or PascalCase (e.g. export default function SupabaseClient).",
    "When using lucide-react icons, prefer these commonly used icons which are guaranteed to exist: Home, Settings, User, Users, Search, Plus, Minus, X, Check, ChevronRight, ChevronLeft, ChevronDown, ChevronUp, ArrowRight, ArrowLeft, Edit, Edit2, Trash, Trash2, Eye, EyeOff, Lock, Unlock, Mail, Phone, Calendar, Clock, Star, Heart, Share2, Download, Upload, File, FileText, Folder, Bell, Menu, MoreVertical, Grid, List, Layout, Kanban, BarChart2, Activity, TrendingUp, AlertCircle, Info, CheckCircle2, XCircle, Circle, Square, Loader2, RefreshCw, Link, Link2, Copy, Save, Send, Tag, Filter, Globe, MapPin, Package, ShoppingCart, CreditCard, DollarSign, Code2, Terminal, Database, Server, Cloud, Monitor, Smartphone, Shield, Key, Zap, Layers, Sliders, Sun, Moon, LogIn, LogOut, Bookmark, Flag, Award, Sparkles, Rocket, Bug, Wrench, Briefcase, Building2, ExternalLink, Hash, AtSign, Percent, Play, Pause.",
    "Do NOT use: LayoutKanban, KanbanSquare, LayoutDashboard, CheckSquare, BadgeCheck, StickyNote, ClipboardList, ListChecks, PackageSearch, ReceiptText, FileClock.",
    "",
    PREVIEW_SHELL_ICON_CONTEXT,
    "",
    "COLOR CHANGES (highest priority rule):",
    "If the user asks to change colors, theme, accent, logo color, icon color, or visual style — ONLY return theme.ts.",
    "Treat short requests like 'change the logo color to orange' as a theme.ts change targeting theme.accent (and accentHover if needed).",
    "Update the relevant token values in the theme object (e.g. primary, accent, background, sidebar).",
    "Do NOT touch App.tsx or any page files — they all import from ./theme so HMR propagates automatically.",
    "Example: 'change to red' → set primary: '#dc2626', primaryHover: '#b91c1c', accent: '#ef4444'",
    "Example: 'change logo color to orange' → set accent: '#F97316', accentHover: '#EA580C'",
    "Example: 'dark mode' → set background: '#0f172a', surface: '#1e293b', sidebar: '#0f172a', textPrimary: '#f1f5f9'",
    "",
    "ADDING NEW PAGES OR COMPONENTS:",
    "When the user asks to add a new page or feature that requires a new file:",
    "  a. Create the new file (e.g. AssetDetailPage.tsx) with complete implementation.",
    "  b. ALWAYS also return an updated App.tsx that imports the new file and adds it to the navigation/routing.",
    "     App.tsx is a sidebar/tab app — add the new page to the sidebar nav items and the page-rendering switch.",
    "  c. Use flat import paths: import AssetDetailPage from './AssetDetailPage' (NOT './components/AssetDetailPage').",
    "  d. The new page file must have a default export.",
    "  e. Fill it with realistic sample data and working interactions — no placeholder content.",
    "  f. Import { theme } from './theme' in the new file and use theme tokens for all colors.",
    "",
    "FILE NAMING:",
    "Return files with filename only (e.g. App.tsx, AssetDetailPage.tsx) — no directory prefix.",
    "",
    "DELIVER: after you have enough context, call deliver_customised_files with the changed + new files and their complete updated content.",
    "The summary should briefly describe what changed, e.g. 'Updated theme.ts to red accent.' or 'Added AssetDetailPage with analytics.'" + dbBlock + existingSupabaseClientBlock + neonDbBlock + neonAuthBlock + dbContextPromptBlock,
  ].join("\n");
}

function buildSystemPrompt(
  paletteId: string,
  designSystemSpec?: string,
  phaseContextBlock?: string,
  imageContextBlock?: string,
  hasByoSupabaseConfig = false,
  dbContextBlock?: string,
): string {
  const designBlock = designSystemSpec
    ? `${designSystemSpec}\n\nThe design system spec above takes priority for all visual decisions. Apply all tokens, typography, spacing, and component patterns exactly as specified.\n\n`
    : "";
  const phaseBlock = phaseContextBlock ? `${phaseContextBlock}\n\n` : "";
  const imageBlock = imageContextBlock ? `${imageContextBlock}\n\n` : "";
  const byoSupabaseBlock = hasByoSupabaseConfig
    ? `BYO SUPABASE (highest priority rule):\n${BYO_SUPABASE_SYSTEM_PROMPT_BLOCK}\nThis overrides any generic instruction elsewhere in this prompt about hardcoded arrays, sample data, or seed records.\n\n`
    : "";
  const dbContextPromptBlock = dbContextBlock ? `${dbContextBlock}\n` : "";
  const themeTsContent = buildThemeTs(paletteId);
  const variationSeed = Math.floor(Math.random() * 9000) + 1000;
  return [
    designBlock + phaseBlock + imageBlock + byoSupabaseBlock + "You are an expert React developer. BUILD the app the user describes — do NOT merely restyle a template.",
    "Design the architecture from scratch based on what the app actually needs.",
    "",
    `VARIATION SEED: ${variationSeed}. Every build must be unique — use different layouts, data examples, copy text, component structures, and visual arrangements even when the prompt is identical to a previous build. Never produce a cookie-cutter result.`,
    "",
    "══ STEP 1: ANALYSE THE PROMPT ══",
    "Identify these four things before writing any code:",
    "",
    "1. NAVIGATION PATTERN — pick exactly one:",
    "   sidebar  → multi-section apps: dashboards, management tools, admin panels, CRMs, trackers with 3+ independent sections",
    "   top-nav  → marketing sites, landing pages, portfolios, simple single-topic SaaS",
    "   tabs     → 2-4 tightly related views, mobile-style apps, single-feature apps with sub-views",
    "   none     → single-page tools: calculators, timers, converters, games, quizzes, generators",
    "",
    "2. THEME:",
    "   light → productivity apps, data/admin tools, business software, management systems, dashboards",
    "   dark  → creative tools, entertainment, gaming, developer tools, crypto, music apps",
    `   Palette accent: ${paletteId} — this palette's exact color tokens are in theme.ts (see STEP 4)`,
    "",
    PREVIEW_SHELL_ICON_CONTEXT,
    "",
    "3. PAGES/SECTIONS — list every distinct section the app needs.",
    "   Asset management system → Assets, Work Orders, Team, Calendar",
    "   CRM → Contacts, Deals, Pipeline, Reports",
    "   Calculator → (no pages, single-page tool)",
    "",
    "4. DATA ENTITIES — for each page, what data does it show?",
    "   Assets → { id, name, category, status, location, assignedTo, lastService }",
    "   Each entity needs 4-5 realistic sample records.",
    "",
    "══ STEP 2: BUILD THE APP ══",
    "Write complete, working, production-presentable code.",
    "",
    "SIDEBAR APPS (sidebar navigation pattern):",
    "  App.tsx — root component containing:",
    "    • Sidebar with nav items (lucide-react icons + label), active state highlighting",
    "    • Main content area that renders the active page based on useState",
    "    • Use theme.sidebar for sidebar background, theme.border for the divider",
    "  PageName.tsx — one file per major section (e.g. AssetsPage.tsx, WorkOrdersPage.tsx)",
    "    • Full page content: heading, toolbar (search/filter/add button), data table or card grid",
    "    • Realistic sample data in the file as a typed const array",
    "    • Action buttons do something (useState toggles, modals, status changes)",
    "",
    "TOP-NAV APPS:",
    "  App.tsx — root with sticky topbar + page state + sections",
    "  PageName.tsx per major section if there are 3+, otherwise inline in App.tsx",
    "",
    "TABS APPS:",
    "  App.tsx — tab bar + tab panels, all inline or split by tab if complex",
    "",
    "SINGLE-PAGE TOOLS (no nav):",
    "  App.tsx only — focused, clean, full functionality",
    "",
    "Code quality rules:",
    "  • All imports at top: import { useState, useEffect, useCallback, useMemo } from 'react'",
    "  • Icons: import { Home, Settings, Users } from 'lucide-react'  (ONLY lucide-react — no other icon lib)",
    "  • When using lucide-react icons, prefer these commonly used icons which are guaranteed to exist: Home, Settings, User, Users, Search, Plus, Minus, X, Check, ChevronRight, ChevronLeft, ChevronDown, ChevronUp, ArrowRight, ArrowLeft, Edit, Edit2, Trash, Trash2, Eye, EyeOff, Lock, Unlock, Mail, Phone, Calendar, Clock, Star, Heart, Share2, Download, Upload, File, FileText, Folder, Bell, Menu, MoreVertical, Grid, List, Layout, Kanban, BarChart2, Activity, TrendingUp, AlertCircle, Info, CheckCircle2, XCircle, Circle, Square, Loader2, RefreshCw, Link, Link2, Copy, Save, Send, Tag, Filter, Globe, MapPin, Package, ShoppingCart, CreditCard, DollarSign, Code2, Terminal, Database, Server, Cloud, Monitor, Smartphone, Shield, Key, Zap, Layers, Sliders, Sun, Moon, LogIn, LogOut, Bookmark, Flag, Award, Sparkles, Rocket, Bug, Wrench, Briefcase, Building2, ExternalLink, Hash, AtSign, Percent, Play, Pause.",
    "  • Do NOT use: LayoutKanban, KanbanSquare, LayoutDashboard, CheckSquare, BadgeCheck, StickyNote, ClipboardList, ListChecks, PackageSearch, ReceiptText, FileClock.",
    "  • Tailwind CSS for spacing/layout/typography — use theme object for ALL color values",
    "  • import { theme } from './theme' at the top of every file that uses colors",
    "  • Use style={{ backgroundColor: theme.surface, color: theme.textPrimary }} for layout sections",
    "  • Use style={{ backgroundColor: theme.primary, color: '#fff' }} for primary buttons",
    "  • Use theme.sidebar / theme.border / theme.textSecondary / theme.accent throughout",
    "  • TypeScript interfaces for every data entity",
    "  • Each file has a default export",
    "  • Imports between files: import AssetsPage from './AssetsPage'  (flat directory, no subdirs)",
    "  • NO new npm dependencies — only React, Tailwind, lucide-react are available",
    "  • NO placeholder comments like '// TODO' or '// Add content here'",
    "  • Seed every list/table with 4-5 realistic sample records",
    "  • Buttons and interactions must do something (useState, not empty onClick)",
    "  • Use correct contrast: dark text on light backgrounds, white text on colored buttons",
    "  • Never use hyphens in JavaScript/TypeScript function names, component names, or variable names. File names may use hyphens (e.g. supabase-client.ts) but the exported function or component inside must use camelCase or PascalCase (e.g. export default function SupabaseClient).",
    "",
    "RESPONSIVE DESIGN (MANDATORY):",
    "  • Every layout must work at 375px (mobile), 768px (tablet), 1280px (desktop)",
    "  • Use Tailwind responsive prefixes on all layout elements: sm: md: lg:",
    "  • Mobile-first: base styles for mobile, scale up with prefixes",
    "  • Never use fixed pixel widths on containers — use w-full, max-w-*, or %",
    "  • Navigation: collapsible hamburger menu on mobile (hidden md:flex pattern)",
    "  • Tables: horizontally scrollable on mobile (overflow-x-auto wrapper)",
    "  • Touch targets: minimum 44px height on all interactive elements",
    "  • Sidebar layouts: hidden on mobile (hidden md:block), visible md: and above",
    "  • Grid layouts: 1 col mobile → 2 cols sm: → 3+ cols lg:",
    "  • Font sizes: never smaller than text-sm on mobile",
    "",
    "══ STEP 3: COEP RULES — violations break the preview, no exceptions ══",
    "  • NO Google Fonts — no @import url('https://fonts.googleapis.com/...')",
    "  • NO external CDN — no unpkg.com, jsdelivr, cdnjs, or any https:// URL in code",
    "  • Do NOT include <script src=\"https://cdn.tailwindcss.com\"> or any cdn.tailwindcss.com link/script tag — Tailwind CSS v4 is already configured in the scaffold",
    "  • Fonts: use className='font-sans' (Tailwind) — system fonts only",
    "  • Images/avatars: colored div with initials or lucide-react icon — no <img src='https://...'>",
    "  • NO <link>, <script>, or <style> tags referencing external URLs",
    "",
    "══ STEP 4: DELIVER ══",
    "Call deliver_customised_files with:",
    "  files[0]: theme.ts — ALWAYS include this exact file first (do not alter the structure, only tweak",
    "            colors if needed to better match the app's aesthetic):",
    "",
    themeTsContent,
    "",
    "  files[1]: App.tsx",
    "  files[2..]: one file per major page for multi-page apps",
    "  summary: one sentence — 'A light-theme asset management system with sidebar navigation covering Assets, Work Orders, Team, and Calendar.'",
    "",
    dbContextPromptBlock,
  ].join("\n");
}

function buildUserMessage(prompt: string, phaseScope?: PhaseScope): string {
  const instruction = phaseScope && phaseScope.index > 1
    ? [
        `Build Phase ${phaseScope.index} of ${phaseScope.total} for this app.`,
        `THIS PHASE ONLY: ${phaseScope.title}`,
        `Build ONLY these features: ${phaseScope.focus.join(", ")}`,
        "Do NOT build features from other phases.",
        "",
        "Full app context (domain reference only — do not expand scope beyond this phase):",
        prompt,
      ].join("\n")
    : `Build this app: ${prompt}`;

  return [
    instruction,
    "",
    "Stack available (already configured — no setup needed):",
    "  React 18 + TypeScript",
    "  Tailwind CSS v4",
    "  lucide-react icons",
    "  No router installed — use React useState to show different pages/views",
    "  Entry point is App.tsx with a default export",
  ].join("\n");
}

interface PhaseScope {
  index: number;
  total: number;
  title: string;
  focus: string[];
}

function mapIntentToBuildIntent(intent: Intent, hasExistingProject: boolean): BuildIntent {
  switch (intent) {
    case "greeting":
    case "question":
    case "research":
      return "question";
    case "ambiguous":
      return "ambiguous";
    case "iteration":
      return "edit";
    case "image_ref":
      return hasExistingProject ? "edit" : "build";
    case "build_new":
      return "build";
    default:
      return hasExistingProject ? "edit" : "build";
  }
}

export function buildDbContextBlock(projectId: string, dbType: ProjectDbType): string {
  return `
## Database & Auth Context
- db_type: ${dbType}
- auth_proxy_base: /api/projects/${projectId}/auth

## Rules based on db_type:

### If db_type === 'none':
- Use localStorage or in-memory state only — no DB calls
- For auth: generate mock auth with localStorage. Show a subtle
  "Demo mode — add a database for real auth" banner in the UI
- Never import or reference Supabase or any DB client
- If user asks for auth/login/database features, generate the mock
  version and add a comment: // Add a database to enable real auth

### If db_type === 'neon':
- Use VITE_DATABASE_URL with postgres/neon client for all data
- For auth: use the Beomz auth proxy at /api/projects/${projectId}/auth/*
  POST /auth/signup { email, password } → { user, token }
  POST /auth/login  { email, password } → { user, token }
  POST /auth/logout
  GET  /auth/me (with Authorization: Bearer {token})
- Store JWT in localStorage under 'beomz_auth_token'
- Never use bcrypt, jsonwebtoken, or Supabase in generated app code
- Multi-tenancy (ONLY if the user explicitly requests it):
  - Add tenant_id UUID and user_id UUID columns on every data table
  - Always filter all queries by the current tenant_id (application-layer enforcement)
  - Example: WHERE tenant_id = $current_tenant_id
- RLS: not available on Neon — enforce access in application logic only

### If db_type === 'supabase':
- Use VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY with @supabase/supabase-js
  for ALL data operations
- For auth: use the Beomz auth proxy at /api/projects/${projectId}/auth/*
  (same interface as Neon — never call supabase.auth directly in app code)
- Store auth token in localStorage under 'beomz_auth_token' (the proxy returns a Supabase access token)
- When querying Supabase with RLS enabled, include that token as an Authorization header on the Supabase client, e.g.
  createClient(url, anonKey, { global: { headers: { Authorization: \`Bearer ${"${token}"}\` } } })
- RLS (ONLY when you implement auth/login/signup):
  - For every table that has user-owned rows (has user_id), include RLS migrations:
    ALTER TABLE public.<table> ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "users see own data" ON public.<table>;
    CREATE POLICY "users see own data" ON public.<table> FOR ALL USING (auth.uid()::text = user_id);
  - Also output the same SQL as a copyable artifact file (e.g. rls.sql)
- Multi-tenancy (ONLY when the user explicitly requests multi-tenant support):
  - Create public.tenants and public.tenant_members
  - Add tenant_id to all data tables
  - Add RLS policies like:
    USING (
      tenant_id IN (
        SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()
      )
    )
`;
}

export function buildImageIntentContext(intent: BuilderImageIntent): string {
  return IMAGE_INTENT_PROMPT_CONTEXT[intent];
}

export function buildPromptWithImageIntent(
  prompt: string,
  confirmedIntent?: BuilderImageIntent,
): string {
  if (!confirmedIntent) return prompt;

  const imageContext = buildImageIntentContext(confirmedIntent);
  const basePrompt = prompt.trim();

  if (!basePrompt) return imageContext;
  return `${basePrompt}\n\nAttached image context: ${imageContext}`;
}

export function buildAnthropicUserContent(
  userMessage: string,
  imageUrl?: string,
): Anthropic.MessageParam["content"] {
  if (!imageUrl) return userMessage;

  return [
    buildAnthropicImageBlock(imageUrl),
    { type: "text", text: userMessage },
  ];
}

export function buildIterationImageEmbeddingInstruction(
  imageUrl?: string,
): string | undefined {
  if (!imageUrl) return undefined;

  return [
    `The user has attached an image. It is available at this Beomz-hosted image URL: ${imageUrl}`,
    "Use this URL directly as the src attribute in <img> tags or as CSS background-image url(). This URL is preview-safe and allowed even under COEP restrictions. Do NOT use a data URI. Do NOT redraw, recreate, or approximate the image.",
  ].join("\n");
}

export function isComplexPrompt(prompt: string): boolean {
  const lower = prompt.toLowerCase();

  const roleMatches = ROLE_INDICATORS.filter((r) => lower.includes(r)).length;
  if (roleMatches >= 2) return true;
  if (prompt.length > 300) return true;

  const featureTokens = lower.split(/,|\band\b|\n/).map((s) => s.trim()).filter(Boolean);
  if (featureTokens.length >= 4) return true;

  const domainMatches = DOMAIN_COMPLEXITY_KEYWORDS.filter((k) => lower.includes(k)).length;
  if (domainMatches >= 3) return true;

  const entityMatches = MULTI_ENTITY_INDICATORS.filter((k) => lower.includes(k)).length;
  if (entityMatches >= 2) return true;

  return false;
}

export function buildPhaseContextBlock(
  currentPhase: number,
  phasesTotal: number,
  phases: Phase[],
  existingFileNames: string[],
): string {
  const phase1 = phases[0];
  const currentPhaseData = phases.find((p) => p.index === currentPhase);

  if (!phase1 || !currentPhaseData) return "";

  if (currentPhase === 1) {
    return [
      `--- BUILD PHASE 1 of ${phasesTotal}: ${phase1.title} ---`,
      `This complex app will be built in ${phasesTotal} phases.`,
      `Build ONLY Phase 1 now: ${phase1.description}`,
      `Focus: ${phase1.focus.join(", ")}`,
      "Keep it clean — subsequent phases will add to this foundation.",
      "--- END PHASE CONTEXT ---",
    ].join("\n");
  }

  const completedPhases = phases.filter((p) => p.index < currentPhase);
  const completedBlock = completedPhases
    .map((p) => `Phase ${p.index}: ${p.title}\n  Built: ${p.focus.join(", ")}`)
    .join("\n");

  return [
    "--- BUILD PHASES ---",
    `This app is being built in ${phasesTotal} phases.`,
    "",
    "COMPLETED PHASES:",
    completedBlock,
    "",
    existingFileNames.length > 0
      ? `EXISTING FILES (do not recreate, only extend):\n${existingFileNames.join(", ")}`
      : "",
    "",
    `CURRENT PHASE ${currentPhase}: ${currentPhaseData.title}`,
    `Build: ${currentPhaseData.description}`,
    `Focus on: ${currentPhaseData.focus.join(", ")}`,
    "",
    "CRITICAL: Import from existing files. Add to App.tsx routing.",
    "Do not rewrite files from previous phases unless extending them.",
    "--- END BUILD PHASES ---",
  ].filter((line) => line !== undefined).join("\n");
}

export async function detectIntent(
  prompt: string,
  hasExistingProject: boolean,
  hasImage = false,
  projectName?: string,
  originalPrompt?: string,
): Promise<BuildIntent> {
  try {
    const classified = await classifyIntent(
      projectName && originalPrompt
        ? `${prompt}\n\nProject: ${projectName}\nOriginal prompt: ${originalPrompt}`
        : prompt,
      hasExistingProject,
      hasImage,
    );
    return mapIntentToBuildIntent(classified.intent, hasExistingProject);
  } catch (err) {
    console.warn("[detectIntent] failed, using fallback:", err instanceof Error ? err.message : String(err));
    return hasExistingProject ? "edit" : "build";
  }
}

export {
  buildIterationSelection,
  buildIterationSystemPrompt,
  buildIterationUserMessage,
  buildSystemPrompt,
  buildUserMessage,
  detectDesignSystem,
  getDesignSystemSpec,
};
