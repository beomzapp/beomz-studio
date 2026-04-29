import { randomUUID } from "node:crypto";

import Anthropic from "@anthropic-ai/sdk";
import type {
  BuilderV3DoneEvent,
  BuilderV3Event,
  BuilderV3InsufficientCreditsEvent,
  BuilderV3Operation,
  BuilderV3PreambleEvent,
  BuilderV3PreBuildAckEvent,
  BuilderV3TraceMetadata,
  StudioFile,
  TemplateId,
} from "@beomz-studio/contracts";
import { createEmptyBuilderV3TraceMetadata } from "@beomz-studio/contracts";
import type { StudioDbClient } from "@beomz-studio/studio-db";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";

import { apiConfig } from "../../config.js";
import {
  calcCreditCost,
  isAdminEmail,
} from "../../lib/credits.js";
import { getModelForBuilder } from "../../lib/modelConfig.js";
import { saveProjectVersion, studioFilesToVersionFiles } from "../../lib/projectVersions.js";
import { loadOrgContext } from "../../middleware/loadOrgContext.js";
import { verifyPlatformJwt } from "../../middleware/verifyPlatformJwt.js";
import type { OrgContext } from "../../types.js";

const websitesGenerateRoute = new Hono();

const WEBSITE_MODEL_FALLBACK = "claude-haiku-4-5-20251001";
const WEBSITE_MAX_TOKENS = 64000;
const WEBSITE_OPERATION: BuilderV3Operation = "initial_build";
const WEBSITE_PREVIEW_ENTRY_PATH = "/";
const WEBSITE_PING_INTERVAL_MS = 20_000;
const WEBSITE_HERO_FILE_PATH = "src/components/Hero.tsx";
const FAL_FLUX_ENDPOINT = "https://fal.run/fal-ai/flux/dev";
const FAL_HERO_IMAGE_WIDTH = 1600;
const FAL_HERO_IMAGE_HEIGHT = 900;
const WEBSITE_IMAGE_PROXY_BASE_URL = "https://beomz.ai/api/proxy/image?url=";

export const WEBSITE_SCAFFOLD_PACKAGE_JSON = JSON.stringify(
  {
    name: "beomz-website",
    private: true,
    type: "module",
    scripts: { build: "vite build" },
    dependencies: {
      clsx: "^2.0.0",
      "lucide-react": "^0.400.0",
      react: "^19.2.0",
      "react-dom": "^19.2.0",
      "tailwind-merge": "^2.0.0",
    },
    devDependencies: {
      "@tailwindcss/vite": "^4.2.2",
      "@types/react": "^19.2.2",
      "@types/react-dom": "^19.2.2",
      "@vitejs/plugin-react": "^6.0.1",
      tailwindcss: "^4.2.2",
      typescript: "^5.9.3",
      vite: "^8.0.1",
    },
  },
  null,
  2,
);

const siteTypeSchema = z.enum(["landing", "portfolio", "restaurant", "ecommerce", "agency", "blog"]);
const vibeSchema = z.enum(["minimal", "bold", "playful", "luxury", "corporate"]);

const requestSchema = z.object({
  prompt: z.string().trim().min(1).max(8000),
  projectId: z.string().uuid(),
  sessionId: z.string().trim().min(1).max(200),
  siteType: siteTypeSchema.optional(),
  vibe: vibeSchema.optional(),
  pages: z.array(z.string().trim().min(1).max(80)).max(8).optional(),
});

type SiteType = z.infer<typeof siteTypeSchema>;
type Vibe = z.infer<typeof vibeSchema>;

type WebsiteFileOutput = {
  path: string;
  content: string;
};

type WebsiteGenerationResult = {
  files: WebsiteFileOutput[];
  summary: string;
  siteName?: string;
  inputTokens: number;
  outputTokens: number;
};

type WebsiteSectionKey = "nav" | "hero" | "features" | "about" | "cta" | "footer";

const GENERIC_SITE_NAME_SEGMENTS = new Set([
  "agency",
  "blog",
  "contact",
  "ecommerce",
  "home",
  "landing page",
  "official site",
  "portfolio",
  "restaurant",
  "website",
]);

const PLACEHOLDER_SITE_NAMES = new Set([
  "my website",
  "new website",
  "untitled website",
  "website",
]);

const NAV_SITE_NAME_BLACKLIST = new Set([
  "about",
  "blog",
  "book a consultation",
  "book now",
  "contact",
  "explore the story",
  "features",
  "get started",
  "home",
  "join the newsletter",
  "menu",
  "reserve now",
  "reserve your table",
  "services",
  "shop",
  "shop the collection",
  "start a project",
]);

interface WebsiteFilesEvent extends Record<string, unknown> {
  type: "files";
  id: string;
  timestamp: string;
  operation: BuilderV3Operation;
  files: Array<{ path: string; content: string }>;
  totalFiles: number;
}

interface WebsiteImageUpdateEvent extends Record<string, unknown> {
  type: "image_update";
  id: string;
  timestamp: string;
  operation: BuilderV3Operation;
  file: string;
  content: string;
}

interface WebsiteBuildProfile {
  brandName: string;
  audienceLine: string;
  heroKicker: string;
  heroHeadline: string;
  heroCopy: string;
  featureIntro: string;
  featureCards: Array<{ title: string; description: string }>;
  aboutHeading: string;
  aboutCopy: string;
  ctaHeading: string;
  ctaCopy: string;
  ctaLabel: string;
  navItems: string[];
  imageAlt: string;
  metaTitle: string;
  metaDescription: string;
  footerTagline: string;
}

const REQUIRED_FILE_PATHS = [
  "index.html",
  "src/components/Nav.tsx",
  "src/components/Hero.tsx",
  "src/components/Features.tsx",
  "src/components/About.tsx",
  "src/components/CTA.tsx",
  "src/components/Footer.tsx",
  "src/pages/Home.tsx",
  "src/App.tsx",
  "src/main.tsx",
  "src/index.css",
] as const;

const REQUIRED_SECTION_ATTRIBUTES: Record<string, WebsiteSectionKey> = {
  "src/components/Nav.tsx": "nav",
  "src/components/Hero.tsx": "hero",
  "src/components/Features.tsx": "features",
  "src/components/About.tsx": "about",
  "src/components/CTA.tsx": "cta",
  "src/components/Footer.tsx": "footer",
};

const WEBSITE_FILES_TOOL: Anthropic.Messages.Tool = {
  name: "deliver_website_files",
  description:
    "Return the full website codebase as structured files. "
    + "Always include index.html and every required scaffold file. "
    + "This is for marketing or informational websites, not functional apps.",
  input_schema: {
    type: "object",
    properties: {
      files: {
        type: "array",
        description:
          "Complete website files. Required files: index.html, src/components/Nav.tsx, "
          + "Hero.tsx, Features.tsx, About.tsx, CTA.tsx, Footer.tsx, src/pages/Home.tsx, "
          + "src/App.tsx, src/main.tsx, src/index.css. "
          + "You may include extra src/pages/*.tsx files only when the brief explicitly asks for them.",
        items: {
          type: "object",
          properties: {
            path: { type: "string", description: "A project-relative file path." },
            content: { type: "string", description: "Complete file content with no placeholders except approved image URLs." },
          },
          required: ["path", "content"],
          additionalProperties: false,
        },
      },
      summary: {
        type: "string",
        description: "One sentence describing the finished website.",
      },
      siteName: {
        type: "string",
        description: "Short website or brand name when the brief makes one obvious.",
      },
    },
    required: ["files", "summary"],
    additionalProperties: false,
  },
};

function ts(): string {
  return new Date().toISOString();
}

function inferFileKind(path: string): StudioFile["kind"] {
  if (/\/(routes|pages|screens|views)\//.test(path) || /App\.(tsx|jsx)$/.test(path)) return "route";
  if (/\/components\//.test(path)) return "component";
  if (/\/(styles?|css)\//.test(path) || /\.css$/.test(path)) return "style";
  if (/\/(config|settings)\//.test(path) || /\.(config|rc)\.(ts|js|json)$/.test(path)) return "config";
  if (/\/(data|fixtures)\//.test(path)) return "data";
  if (/\.(json|md|html)$/.test(path)) return "content";
  return "component";
}

function inferLanguage(path: string): string {
  const extension = path.split(".").pop()?.toLowerCase() ?? "";
  const languageByExtension: Record<string, string> = {
    css: "css",
    html: "html",
    js: "javascript",
    json: "json",
    jsx: "jsx",
    md: "markdown",
    ts: "typescript",
    tsx: "tsx",
  };

  return languageByExtension[extension] ?? "typescript";
}

function readTrace(metadata: Record<string, unknown>): BuilderV3TraceMetadata {
  const trace = metadata.builderTrace;
  if (typeof trace === "object" && trace !== null && !Array.isArray(trace)) {
    const raw = trace as Record<string, unknown>;
    return {
      events: Array.isArray(raw.events) ? (raw.events as BuilderV3TraceMetadata["events"]) : [],
      lastEventId: typeof raw.lastEventId === "string" ? raw.lastEventId : null,
      previewReady: raw.previewReady === true,
      fallbackUsed: raw.fallbackUsed === true,
      fallbackReason: typeof raw.fallbackReason === "string" ? raw.fallbackReason : null,
    };
  }

  return createEmptyBuilderV3TraceMetadata();
}

async function appendEventToDb(
  db: StudioDbClient,
  buildId: string,
  event: BuilderV3Event | WebsiteFilesEvent | WebsiteImageUpdateEvent,
  extraPatch?: Partial<Parameters<StudioDbClient["updateGeneration"]>[1]>,
): Promise<void> {
  const row = await db.findGenerationById(buildId);
  if (!row) {
    return;
  }

  const metadata = typeof row.metadata === "object" && row.metadata !== null
    ? (row.metadata as Record<string, unknown>)
    : {};
  const currentTrace = readTrace(metadata);
  const traceEvent = event as unknown as BuilderV3Event;
  const nextTrace: BuilderV3TraceMetadata = {
    ...currentTrace,
    events: [...currentTrace.events, traceEvent],
    lastEventId: event.id,
  };

  await db.updateGeneration(buildId, {
    metadata: { ...metadata, builderTrace: nextTrace },
    ...extraPatch,
  });
}

async function appendSessionEventToDb(
  db: StudioDbClient,
  buildId: string,
  event: Record<string, unknown>,
): Promise<void> {
  try {
    const row = await db.findGenerationById(buildId);
    if (!row) {
      return;
    }

    const currentEvents = Array.isArray(row.session_events)
      ? (row.session_events as Record<string, unknown>[])
      : [];

    await db.updateGeneration(buildId, {
      session_events: [...currentEvents, { ...event, timestamp: ts() }],
    });
  } catch (error) {
    console.warn(
      "[websites/generate] appendSessionEventToDb failed (non-fatal):",
      error instanceof Error ? error.message : String(error),
    );
  }
}

function mapSiteTypeToTemplateId(siteType: SiteType): TemplateId {
  switch (siteType) {
    case "portfolio":
      return "portfolio";
    case "ecommerce":
      return "ecommerce";
    case "blog":
      return "blog-cms";
    case "landing":
    case "restaurant":
    case "agency":
    default:
      return "marketing-website";
  }
}

function toTitleCase(value: string): string {
  return value
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())
    .join(" ");
}

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normaliseExtractedSiteName(value: string): string | null {
  const decoded = compactWhitespace(
    value
      .replace(/&amp;/gi, "&")
      .replace(/&nbsp;/gi, " "),
  );
  if (!decoded) {
    return null;
  }

  const separators = [" | ", " — ", " – ", " - ", " · ", " / "];
  const separator = separators.find((candidate) => decoded.includes(candidate));
  const segments = separator
    ? decoded.split(separator).map((segment) => compactWhitespace(segment)).filter(Boolean)
    : [decoded];

  const preferred = segments.find((segment) => !GENERIC_SITE_NAME_SEGMENTS.has(segment.toLowerCase()))
    ?? segments[0]
    ?? decoded;
  const cleaned = compactWhitespace(preferred.replace(/^['"`]+|['"`]+$/g, ""));

  if (!cleaned || cleaned.length > 80) {
    return null;
  }

  const normalised = cleaned.toLowerCase();
  if (GENERIC_SITE_NAME_SEGMENTS.has(normalised) || PLACEHOLDER_SITE_NAMES.has(normalised)) {
    return null;
  }

  return cleaned;
}

function escapeText(value: string): string {
  return value
    .replaceAll("\"", "'")
    .replaceAll("\\", "\\\\")
    .replaceAll("`", "\\`")
    .replaceAll("${", "\\${");
}

function buildRestatement(siteType: SiteType, vibe: Vibe, prompt: string): string {
  const brief = compactWhitespace(prompt).slice(0, 180);
  return `Creating a ${vibe} ${siteType} website around: ${brief}${brief.length >= 180 ? "..." : ""}`;
}

function buildPreambleBullets(siteType: SiteType, vibe: Vibe, pages: string[]): string[] {
  const bullets = [
    "Scaffolding a multi-section marketing site with separate section components.",
    "Keeping the layout mobile-first with Tailwind classes and production-ready structure.",
    `Shaping the visual direction around a ${vibe} aesthetic for a ${siteType} website.`,
  ];

  if (pages.length > 0) {
    bullets.push(`Reflecting requested pages or navigation themes: ${pages.join(", ")}.`);
  }

  return bullets;
}

function normalisePromptSnippet(prompt: string): string {
  return compactWhitespace(prompt).replace(/^["']|["']$/g, "").slice(0, 220);
}

function buildWebsiteProfile(input: {
  projectName: string;
  prompt: string;
  siteType: SiteType;
  vibe: Vibe;
  pages: string[];
}): WebsiteBuildProfile {
  const brandName = input.projectName.trim() || "Beacon";
  const promptSnippet = normalisePromptSnippet(input.prompt);
  const pageLabels = input.pages.length > 0
    ? input.pages.map((page) => toTitleCase(page))
    : ["Features", "About", "Contact"];
  const audienceLine = promptSnippet.length > 0
    ? promptSnippet
    : `A ${input.siteType} website presented with a ${input.vibe} visual direction.`;

  const shared = {
    brandName,
    navItems: [...new Set(["Features", "About", ...pageLabels.slice(0, 2), "Contact"])].slice(0, 4),
  };

  switch (input.siteType) {
    case "portfolio":
      return {
        ...shared,
        audienceLine,
        heroKicker: "Selected Work",
        heroHeadline: `${brandName} presents thoughtful work with a ${input.vibe} visual voice.`,
        heroCopy: `A focused portfolio built to introduce the studio, highlight standout projects, and turn interest into conversations. ${audienceLine}`,
        featureIntro: "Everything visitors need to understand the craft, process, and results at a glance.",
        featureCards: [
          { title: "Signature projects", description: "Spotlight the strongest case studies with concise outcomes and visual depth." },
          { title: "Process clarity", description: "Explain how ideas move from concept to polished launch-ready work." },
          { title: "Credibility cues", description: "Use proof points, select testimonials, and confident positioning without clutter." },
        ],
        aboutHeading: "Built to make the work memorable",
        aboutCopy: `${brandName} uses this site to frame experience, taste, and delivery in a way that feels human and premium instead of generic.`,
        ctaHeading: "Start the next project with confidence",
        ctaCopy: "Invite visitors to book a discovery call, request a portfolio PDF, or ask for tailored creative direction.",
        ctaLabel: "Book a consultation",
        imageAlt: `${brandName} portfolio showcase`,
        metaTitle: `${brandName} | Portfolio`,
        metaDescription: `Explore ${brandName}'s portfolio, process, and selected work with a polished ${input.vibe} presentation.`,
        footerTagline: "Portfolio website designed to turn attention into qualified enquiries.",
      };
    case "restaurant":
      return {
        ...shared,
        audienceLine,
        heroKicker: "Dining Experience",
        heroHeadline: `${brandName} brings atmosphere, flavour, and story into one memorable digital front door.`,
        heroCopy: `An inviting restaurant website designed to highlight the menu, set the mood, and move guests toward reservations. ${audienceLine}`,
        featureIntro: "Show diners what makes the venue worth visiting before they even arrive.",
        featureCards: [
          { title: "Signature dishes", description: "Present standout plates, seasonal highlights, and house favourites with appetite appeal." },
          { title: "Experience first", description: "Translate the venue's ambience, service style, and story into warm, visual copy." },
          { title: "Reservation CTA", description: "Guide guests toward booking with clear next steps and confident timing cues." },
        ],
        aboutHeading: "A site that feels like a preview of the room",
        aboutCopy: `${brandName} needs a website that balances appetite, trust, and atmosphere so first-time visitors know exactly why they should come in.`,
        ctaHeading: "Reserve your table",
        ctaCopy: "Pair the menu story with a simple, high-visibility invitation to book the next lunch, dinner, or tasting experience.",
        ctaLabel: "Reserve now",
        imageAlt: `${brandName} restaurant interior and dishes`,
        metaTitle: `${brandName} | Restaurant`,
        metaDescription: `Discover ${brandName}'s menu, story, and atmosphere with a mobile-first restaurant website built to drive reservations.`,
        footerTagline: "Restaurant storytelling that turns curiosity into bookings.",
      };
    case "ecommerce":
      return {
        ...shared,
        audienceLine,
        heroKicker: "Shop Online",
        heroHeadline: `${brandName} makes discovery feel effortless and premium from the first scroll.`,
        heroCopy: `A storefront-focused website that combines persuasive product storytelling with trust-building design and clear purchase intent. ${audienceLine}`,
        featureIntro: "Designed to make shoppers understand the offer quickly and feel ready to buy.",
        featureCards: [
          { title: "Collection focus", description: "Frame hero products and collections with crisp benefits instead of generic filler." },
          { title: "Trust signals", description: "Use shipping, quality, and social proof cues to reduce hesitation." },
          { title: "Conversion paths", description: "Build clear CTAs and product discovery moments that feel natural on mobile." },
        ],
        aboutHeading: "A storefront that explains why the products matter",
        aboutCopy: `${brandName} uses this website to combine brand story, product value, and a modern shopping feel that respects the visitor's time.`,
        ctaHeading: "Explore the collection",
        ctaCopy: "Give visitors a strong next action to browse the range, join the list, or jump into featured products.",
        ctaLabel: "Shop the collection",
        imageAlt: `${brandName} featured product collection`,
        metaTitle: `${brandName} | Ecommerce`,
        metaDescription: `Shop ${brandName} through a modern ecommerce website with clear storytelling, mobile-first layout, and persuasive product sections.`,
        footerTagline: "Ecommerce design tuned for clarity, confidence, and conversion.",
      };
    case "agency":
      return {
        ...shared,
        audienceLine,
        heroKicker: "Agency Site",
        heroHeadline: `${brandName} positions its services with clarity, confidence, and a strong point of view.`,
        heroCopy: `A service-led website built to help prospects understand the offer fast, trust the team, and reach out with intent. ${audienceLine}`,
        featureIntro: "Balance strategic messaging, proof, and polish so the site feels sharp instead of overbuilt.",
        featureCards: [
          { title: "Service clarity", description: "Break down the offer into memorable value points and outcome-driven language." },
          { title: "Proof of results", description: "Support the pitch with highlights, selective case studies, and confidence markers." },
          { title: "Lead capture", description: "Keep the primary CTA visible so warm leads know exactly how to start." },
        ],
        aboutHeading: "Positioned for trust from the first impression",
        aboutCopy: `${brandName} needs a website that feels credible, modern, and decisive so the right clients quickly understand the fit.`,
        ctaHeading: "Talk to the team",
        ctaCopy: "Close with a direct invitation to book a discovery call, request a proposal, or start a project conversation.",
        ctaLabel: "Start a project",
        imageAlt: `${brandName} agency team and work preview`,
        metaTitle: `${brandName} | Agency`,
        metaDescription: `Learn how ${brandName} delivers results through a modern agency website built for positioning and lead generation.`,
        footerTagline: "Agency positioning built for faster trust and stronger enquiries.",
      };
    case "blog":
      return {
        ...shared,
        audienceLine,
        heroKicker: "Editorial Platform",
        heroHeadline: `${brandName} turns expertise into a clean, readable publishing experience.`,
        heroCopy: `A content-led website designed to make ideas easy to browse, understand, and subscribe to across any device. ${audienceLine}`,
        featureIntro: "Built around readability, hierarchy, and topic discovery rather than app-like complexity.",
        featureCards: [
          { title: "Editorial hierarchy", description: "Lead with a strong headline area and clear pathways into core topics." },
          { title: "Reader retention", description: "Use structured sections and newsletter cues to keep readers coming back." },
          { title: "Topic credibility", description: "Support the content with thoughtful positioning and a clean information architecture." },
        ],
        aboutHeading: "Readable by default, memorable by design",
        aboutCopy: `${brandName} uses this site to publish insight-rich content without sacrificing personality, hierarchy, or performance.`,
        ctaHeading: "Stay in the loop",
        ctaCopy: "Invite readers to subscribe, explore the latest articles, or follow a core topic category from a clear CTA block.",
        ctaLabel: "Join the newsletter",
        imageAlt: `${brandName} editorial blog layout`,
        metaTitle: `${brandName} | Blog`,
        metaDescription: `Read stories, insights, and updates from ${brandName} in a modern blog designed for clarity and SEO-friendly structure.`,
        footerTagline: "A publishing experience designed for readability and return visits.",
      };
    case "landing":
    default:
      return {
        ...shared,
        audienceLine,
        heroKicker: "Launch Ready",
        heroHeadline: `${brandName} tells a focused story that moves visitors from curiosity to action.`,
        heroCopy: `A high-conviction landing page with strong hierarchy, contextual copy, and a modern ${input.vibe} visual direction. ${audienceLine}`,
        featureIntro: "Everything on the page is organised to help people understand the offer fast and act with confidence.",
        featureCards: [
          { title: "Clear value proposition", description: "Explain what the product or business offers in plain language with strong visual hierarchy." },
          { title: "Contextual credibility", description: "Support the pitch with proof points, positioning, and grounded details from the brief." },
          { title: "Focused conversion", description: "Keep every section moving toward one clear call-to-action without app-like complexity." },
        ],
        aboutHeading: "Designed to explain the offer without wasting attention",
        aboutCopy: `${brandName} needs a landing page that is fast to scan, persuasive on mobile, and specific enough to feel believable.`,
        ctaHeading: "Turn interest into action",
        ctaCopy: "Finish with a CTA section that reinforces trust, sharpens the offer, and gives visitors an obvious next step.",
        ctaLabel: "Get started",
        imageAlt: `${brandName} landing page hero visual`,
        metaTitle: `${brandName} | Landing Page`,
        metaDescription: `Discover ${brandName} through a modern landing page with real copy, strong SEO structure, and a ${input.vibe} visual direction.`,
        footerTagline: "A focused marketing website built for clarity and response.",
      };
  }
}

function renderNav(profile: WebsiteBuildProfile): string {
  const navLinks = profile.navItems
    .map((label) => {
      const href = label.toLowerCase() === "contact" ? "#cta" : `#${label.toLowerCase().replace(/\s+/g, "-")}`;
      return `            <a href="${href}" className="text-sm font-medium text-slate-800 transition hover:text-slate-950">${escapeText(label)}</a>`;
    })
    .join("\n");

  return `export default function Nav() {
  return (
    <header data-section="nav" className="sticky top-0 z-30 border-b border-white/60 bg-white/75 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <a href="#hero" className="text-lg font-semibold tracking-tight text-slate-950">
          ${escapeText(profile.brandName)}
        </a>
        <nav className="hidden items-center gap-6 md:flex">
${navLinks}
        </nav>
        <a
          href="#cta"
          className="inline-flex items-center justify-center rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          ${escapeText(profile.ctaLabel)}
        </a>
      </div>
    </header>
  );
}
`;
}

function renderHero(profile: WebsiteBuildProfile): string {
  return `export default function Hero() {
  return (
    <section data-section="hero" id="hero" className="relative overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_top,rgba(15,23,42,0.08),transparent_60%)]" />
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:py-24">
        <div className="relative">
          <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            ${escapeText(profile.heroKicker)}
          </span>
          <h1 className="mt-6 max-w-3xl text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl lg:text-6xl">
            ${escapeText(profile.heroHeadline)}
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
            ${escapeText(profile.heroCopy)}
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a
              href="#cta"
              className="inline-flex items-center justify-center rounded-full bg-slate-950 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              ${escapeText(profile.ctaLabel)}
            </a>
            <a
              href="#features"
              className="inline-flex items-center justify-center rounded-full border border-slate-300 px-6 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-950"
            >
              Explore the story
            </a>
          </div>
        </div>
        <div className="relative">
          <div className="absolute -inset-4 rounded-[2rem] bg-gradient-to-br from-slate-200/70 via-white to-slate-100 blur-2xl" />
          <img
            src="https://picsum.photos/1200/600"
            alt="${escapeText(profile.imageAlt)}"
            className="relative aspect-[6/5] w-full rounded-[2rem] border border-white/70 object-cover shadow-[0_30px_100px_rgba(15,23,42,0.18)]"
          />
        </div>
      </div>
    </section>
  );
}
`;
}

function renderFeatures(profile: WebsiteBuildProfile): string {
  const cards = profile.featureCards
    .map(
      (card) => `        <article className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold tracking-tight text-slate-950">${escapeText(card.title)}</h3>
          <p className="mt-3 text-sm leading-6 text-slate-600">${escapeText(card.description)}</p>
        </article>`,
    )
    .join("\n");

  return `export default function Features() {
  return (
    <section data-section="features" id="features" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
      <div className="max-w-2xl">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Highlights</p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
          Made for modern decision-making
        </h2>
        <p className="mt-4 text-base leading-7 text-slate-600">
          ${escapeText(profile.featureIntro)}
        </p>
      </div>
      <div className="mt-10 grid gap-5 md:grid-cols-3">
${cards}
      </div>
    </section>
  );
}
`;
}

function renderAbout(profile: WebsiteBuildProfile): string {
  return `export default function About() {
  return (
    <section data-section="about" id="about" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
      <div className="grid gap-8 rounded-[2rem] border border-slate-200 bg-slate-950 px-6 py-8 text-white sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:px-10">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-white/60">About</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            ${escapeText(profile.aboutHeading)}
          </h2>
        </div>
        <div>
          <p className="text-base leading-7 text-white/75">
            ${escapeText(profile.aboutCopy)}
          </p>
          <h3 className="mt-6 text-lg font-semibold text-white">Why this structure works</h3>
          <p className="mt-2 text-sm leading-6 text-white/70">
            It keeps the story simple: a clear value proposition, grounded proof, and a confident action path.
          </p>
        </div>
      </div>
    </section>
  );
}
`;
}

function renderCta(profile: WebsiteBuildProfile): string {
  return `export default function CTA() {
  return (
    <section data-section="cta" id="cta" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
      <div className="rounded-[2rem] border border-slate-200 bg-white px-6 py-10 shadow-sm sm:px-8 lg:px-10">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Next step</p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
          ${escapeText(profile.ctaHeading)}
        </h2>
        <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
          ${escapeText(profile.ctaCopy)}
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <a
            href="mailto:hello@example.com"
            className="inline-flex items-center justify-center rounded-full bg-slate-950 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            ${escapeText(profile.ctaLabel)}
          </a>
          <a
            href="#hero"
            className="inline-flex items-center justify-center rounded-full border border-slate-300 px-6 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-950"
          >
            Back to top
          </a>
        </div>
      </div>
    </section>
  );
}
`;
}

function renderFooter(profile: WebsiteBuildProfile): string {
  return `export default function Footer() {
  return (
    <footer data-section="footer" className="border-t border-slate-200">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-slate-500 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <p className="font-medium text-slate-700">${escapeText(profile.brandName)}</p>
        <p>${escapeText(profile.footerTagline)}</p>
      </div>
    </footer>
  );
}
`;
}

function renderHome(): string {
  return `import About from "../components/About";
import CTA from "../components/CTA";
import Features from "../components/Features";
import Footer from "../components/Footer";
import Hero from "../components/Hero";
import Nav from "../components/Nav";

export default function Home() {
  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#ffffff_45%,#f8fafc_100%)] text-slate-950">
      <Nav />
      <main>
        <Hero />
        <Features />
        <About />
        <CTA />
      </main>
      <Footer />
    </div>
  );
}
`;
}

function renderApp(): string {
  return `import Home from "./pages/Home";

export default function App() {
  return <Home />;
}
`;
}

function renderMain(): string {
  return `import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App";
import "./index.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element #root was not found.");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
`;
}

function renderIndexCss(vibe: Vibe): string {
  const vibeStyles: Record<Vibe, { accent: string; secondary: string; selection: string }> = {
    minimal: { accent: "#0f172a", secondary: "#475569", selection: "rgba(15,23,42,0.16)" },
    bold: { accent: "#be123c", secondary: "#0f172a", selection: "rgba(190,18,60,0.22)" },
    playful: { accent: "#ea580c", secondary: "#0f172a", selection: "rgba(234,88,12,0.2)" },
    luxury: { accent: "#7c3aed", secondary: "#111827", selection: "rgba(124,58,237,0.2)" },
    corporate: { accent: "#0369a1", secondary: "#0f172a", selection: "rgba(3,105,161,0.18)" },
  };
  const palette = vibeStyles[vibe];

  return `@import "tailwindcss";

:root {
  color-scheme: light;
  --accent: ${palette.accent};
  --secondary: ${palette.secondary};
  --selection: ${palette.selection};
}

*,
*::before,
*::after {
  box-sizing: border-box;
}

html {
  scroll-behavior: smooth;
}

body {
  margin: 0;
  min-width: 320px;
  font-family: "Inter", "Segoe UI", sans-serif;
  background:
    radial-gradient(circle at top, rgba(255, 255, 255, 0.96), rgba(248, 250, 252, 0.92) 35%, rgba(241, 245, 249, 0.9) 100%);
  color: #0f172a;
}

a {
  color: inherit;
  text-decoration: none;
}

img {
  display: block;
  max-width: 100%;
}

::selection {
  background: var(--selection);
}
`;
}

function renderIndexHtml(profile: WebsiteBuildProfile): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeText(profile.metaTitle)}</title>
    <meta name="description" content="${escapeText(profile.metaDescription)}" />
    <meta property="og:title" content="${escapeText(profile.metaTitle)}" />
    <meta property="og:description" content="${escapeText(profile.metaDescription)}" />
    <meta property="og:type" content="website" />
    <meta property="og:image" content="https://picsum.photos/1200/600" />
    <meta name="twitter:card" content="summary_large_image" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;
}

function buildFallbackWebsiteFiles(input: {
  projectName: string;
  prompt: string;
  siteType: SiteType;
  vibe: Vibe;
  pages: string[];
}): WebsiteFileOutput[] {
  const profile = buildWebsiteProfile(input);

  return [
    { path: "index.html", content: renderIndexHtml(profile) },
    { path: "src/components/Nav.tsx", content: renderNav(profile) },
    { path: "src/components/Hero.tsx", content: renderHero(profile) },
    { path: "src/components/Features.tsx", content: renderFeatures(profile) },
    { path: "src/components/About.tsx", content: renderAbout(profile) },
    { path: "src/components/CTA.tsx", content: renderCta(profile) },
    { path: "src/components/Footer.tsx", content: renderFooter(profile) },
    { path: "src/pages/Home.tsx", content: renderHome() },
    { path: "src/App.tsx", content: renderApp() },
    { path: "src/main.tsx", content: renderMain() },
    { path: "src/index.css", content: renderIndexCss(input.vibe) },
  ];
}

function parseToolResult(raw: {
  files?: unknown;
  summary?: unknown;
  siteName?: unknown;
}): Omit<WebsiteGenerationResult, "inputTokens" | "outputTokens"> {
  const files = Array.isArray(raw.files)
    ? raw.files.filter((file): file is WebsiteFileOutput => {
        if (!file || typeof file !== "object") {
          return false;
        }

        const candidate = file as Record<string, unknown>;
        return typeof candidate.path === "string" && typeof candidate.content === "string";
      }).map((file) => ({
        path: file.path.trim(),
        content: file.content,
      }))
    : [];

  const summary = typeof raw.summary === "string" && raw.summary.trim().length > 0
    ? raw.summary.trim()
    : "Marketing website generated.";
  const siteName = typeof raw.siteName === "string" && raw.siteName.trim().length > 0
    ? raw.siteName.trim()
    : undefined;

  return { files, summary, siteName };
}

function buildImageProxyUrl(imageUrl: string): string {
  return `${WEBSITE_IMAGE_PROXY_BASE_URL}${encodeURIComponent(imageUrl)}`;
}

function extractSiteNameFromIndexHtml(content: string): string | null {
  const titleMatch = content.match(/<title>\s*([^<]+?)\s*<\/title>/i);
  if (!titleMatch) {
    return null;
  }

  return normaliseExtractedSiteName(titleMatch[1] ?? "");
}

function extractSiteNameFromNavContent(content: string): string | null {
  for (const match of content.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)) {
    const innerContent = match[1] ?? "";
    const textContent = compactWhitespace(
      innerContent
        .replace(/<[^>]+>/g, " ")
        .replace(/[{}]/g, " ")
        .replace(/&amp;/gi, "&"),
    );
    const candidate = normaliseExtractedSiteName(textContent);
    if (!candidate || NAV_SITE_NAME_BLACKLIST.has(candidate.toLowerCase())) {
      continue;
    }

    return candidate;
  }

  return null;
}

function extractSiteNameFromGeneratedFiles(files: StudioFile[]): string | null {
  const indexHtml = files.find((file) => file.path === "index.html")?.content;
  const siteNameFromTitle = indexHtml ? extractSiteNameFromIndexHtml(indexHtml) : null;
  if (siteNameFromTitle) {
    return siteNameFromTitle;
  }

  const navContent = files.find((file) => file.path === "src/components/Nav.tsx")?.content;
  return navContent ? extractSiteNameFromNavContent(navContent) : null;
}

function buildProjectPatchUrl(requestUrl: string, projectId: string): URL {
  const patchUrl = new URL(requestUrl);
  const nextPathname = patchUrl.pathname.replace(/\/websites\/generate\/?$/, `/projects/${projectId}`);
  patchUrl.pathname = nextPathname === patchUrl.pathname ? `/projects/${projectId}` : nextPathname;
  patchUrl.search = "";
  patchUrl.hash = "";
  return patchUrl;
}

async function syncGeneratedProjectName(input: {
  db: StudioDbClient;
  projectId: string;
  currentProjectName: string;
  files: StudioFile[];
  requestUrl: string;
  authorizationHeader?: string;
  abortSignal?: AbortSignal;
}): Promise<string | null> {
  const extractedName = extractSiteNameFromGeneratedFiles(input.files);
  if (!extractedName || extractedName.toLowerCase() === input.currentProjectName.trim().toLowerCase()) {
    return null;
  }

  const patchUrl = buildProjectPatchUrl(input.requestUrl, input.projectId);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (input.authorizationHeader) {
    headers.Authorization = input.authorizationHeader;
  }

  try {
    const response = await fetch(patchUrl, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ name: extractedName }),
      signal: input.abortSignal,
    });

    if (!response.ok) {
      const details = await response.text().catch(() => "");
      throw new Error(
        `PATCH ${patchUrl.pathname} failed with ${response.status}${details ? `: ${details.slice(0, 200)}` : ""}`,
      );
    }

    return extractedName;
  } catch (error) {
    console.warn(
      "[websites/generate] project name PATCH failed; falling back to direct project update:",
      error instanceof Error ? error.message : String(error),
    );
  }

  try {
    await input.db.updateProject(input.projectId, { name: extractedName });
    return extractedName;
  } catch (error) {
    console.warn(
      "[websites/generate] direct project name update failed:",
      error instanceof Error ? error.message : String(error),
    );
    return null;
  }
}

function buildHeroImagePrompt(input: {
  projectName: string;
  prompt: string;
  siteType: SiteType;
  vibe: Vibe;
  pages: string[];
  summary: string;
}): string {
  const siteContext: Record<SiteType, string> = {
    landing: "Show a premium brand moment that instantly communicates the offer without looking like a SaaS dashboard.",
    portfolio: "Show an editorial, design-forward scene that feels like a premium portfolio hero with strong taste and atmosphere.",
    restaurant: "Show elevated hospitality, plated food, and a cinematic dining atmosphere that feels reservation-worthy.",
    ecommerce: "Show a polished product-led lifestyle scene with premium lighting, composition, and commercial photography quality.",
    agency: "Show a confident brand-forward scene that feels strategic, premium, and modern rather than corporate stock imagery.",
    blog: "Show an editorial lifestyle scene that feels thoughtful, warm, and credible for a content-led brand.",
  };
  const vibeContext: Record<Vibe, string> = {
    minimal: "Keep the composition clean, refined, airy, and understated.",
    bold: "Use dramatic contrast, dynamic framing, and high visual confidence.",
    playful: "Use expressive color, warmth, and an energetic but polished mood.",
    luxury: "Use rich materials, moody lighting, and high-end editorial styling.",
    corporate: "Keep it crisp, trustworthy, premium, and contemporary.",
  };

  const brief = compactWhitespace(input.prompt).slice(0, 1200);
  const pageContext = input.pages.length > 0 ? `Key navigation themes: ${input.pages.join(", ")}.` : "";

  return compactWhitespace([
    `Create a cinematic website hero image for ${input.projectName}.`,
    siteContext[input.siteType],
    vibeContext[input.vibe],
    `Website summary: ${input.summary}`,
    `User brief: ${brief}`,
    pageContext,
    "Use a 16:9 composition suitable for a landing-page hero.",
    "Photorealistic, premium, customer-ready, and visually cohesive.",
    "Do not include text, letters, logos, UI mockups, watermarks, split screens, or collage layouts.",
  ].filter(Boolean).join(" "));
}

async function generateFalHeroImageUrl(input: {
  heroPrompt: string;
  abortSignal?: AbortSignal;
}): Promise<string | null> {
  const falKey = process.env.FAL_KEY?.trim();
  if (!falKey) {
    console.warn("[websites/generate] FAL_KEY missing; skipping hero image generation.");
    return null;
  }

  const response = await fetch(FAL_FLUX_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Key ${falKey}`,
      "Content-Type": "application/json",
      "X-Fal-Store-IO": "0",
    },
    body: JSON.stringify({
      prompt: input.heroPrompt,
      image_size: {
        width: FAL_HERO_IMAGE_WIDTH,
        height: FAL_HERO_IMAGE_HEIGHT,
      },
      num_images: 1,
      enable_safety_checker: true,
      output_format: "jpeg",
    }),
    signal: input.abortSignal,
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(
      `fal.ai hero image request failed: ${response.status} ${response.statusText}${details ? ` - ${details.slice(0, 300)}` : ""}`,
    );
  }

  const data = await response.json() as {
    images?: Array<{ url?: unknown }>;
  };
  const imageUrl = data.images?.find((image) => typeof image.url === "string" && image.url.trim().length > 0)?.url;

  if (typeof imageUrl !== "string") {
    throw new Error("fal.ai hero image response did not include an image URL.");
  }

  return imageUrl.trim();
}

function replaceHeroImageSrc(heroContent: string, imageUrl: string): string | null {
  const quotedSrcUpdated = heroContent.replace(
    /(<img\b[\s\S]*?\bsrc=)(["'])(.*?)\2/,
    (_match, prefix: string, quote: string) => `${prefix}${quote}${imageUrl}${quote}`,
  );

  if (quotedSrcUpdated !== heroContent) {
    return quotedSrcUpdated;
  }

  const jsxWrappedSrcUpdated = heroContent.replace(
    /(<img\b[\s\S]*?\bsrc=\{)(["'])(.*?)\2\}/,
    (_match, prefix: string, quote: string) => `${prefix}${quote}${imageUrl}${quote}}`,
  );

  return jsxWrappedSrcUpdated !== heroContent ? jsxWrappedSrcUpdated : null;
}

function applyHeroImageUpdate(files: StudioFile[], imageUrl: string): {
  files: StudioFile[];
  updatedContent: string | null;
} {
  let updatedContent: string | null = null;

  const nextFiles = files.map((file) => {
    if (file.path !== WEBSITE_HERO_FILE_PATH) {
      return file;
    }

    const replacedContent = replaceHeroImageSrc(file.content, imageUrl);
    if (!replacedContent || replacedContent === file.content) {
      return file;
    }

    updatedContent = replacedContent;
    return {
      ...file,
      content: replacedContent,
    };
  });

  return { files: nextFiles, updatedContent };
}

function isSocketDropError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.message === "terminated") return true;
  const cause = (err as Error & { cause?: { code?: string } }).cause;
  return cause?.code === "UND_ERR_SOCKET";
}

async function callAnthropicWebsiteGeneration(input: {
  prompt: string;
  siteType: SiteType;
  vibe: Vibe;
  pages: string[];
  projectName: string;
  abortSignal?: AbortSignal;
}): Promise<WebsiteGenerationResult> {
  const userPrompt = [
    `Project name: ${input.projectName}`,
    `Site type: ${input.siteType}`,
    `Vibe: ${input.vibe}`,
    input.pages.length > 0 ? `Requested pages or nav themes: ${input.pages.join(", ")}` : "Requested pages or nav themes: none provided",
    "",
    "User brief:",
    input.prompt.trim(),
  ].join("\n");

  const systemPrompt = [
    "You are generating a polished React + TypeScript marketing website for Beomz.",
    "This is a website generator, not an app generator.",
    "",
    "Non-negotiable rules:",
    "1. Build marketing or informational content only. Do NOT generate dashboards, auth, carts, CRUD, booking engines, forms with backend logic, or any functional app workflows.",
    "2. Return the full website scaffold through the deliver_website_files tool.",
    "3. Required files: index.html, src/components/Nav.tsx, Hero.tsx, Features.tsx, About.tsx, CTA.tsx, Footer.tsx, src/pages/Home.tsx, src/App.tsx, src/main.tsx, src/index.css.",
    "4. Each section component must be a separate file. The outermost element in each section component must include a data-section attribute. Required values: nav, hero, features, about, cta, footer.",
    "5. Hero, Features, About, and CTA should use <section data-section=\"...\"> as the outermost element.",
    "6. Use real contextual copy grounded in the brief. Never use lorem ipsum, placeholder company names, or vague filler.",
    "7. SEO is mandatory: exactly one h1 on the page, sensible h2 and h3 hierarchy, and meta tags in index.html.",
    "8. Use Tailwind utility classes with a mobile-first responsive layout.",
    "9. Make the design modern, high quality, and aligned to the requested vibe. Default to a clean minimal aesthetic unless the vibe clearly asks for something stronger.",
    "CRITICAL: Navigation links must have sufficient contrast against the background color. If the nav background is dark, nav links must be white or light grey (#fff or #e5e5e5). If light, use dark (#1a1a1a). NEVER use opacity < 0.8 on nav links. Nav must always be clearly readable.",
    "CRITICAL JSX RULES — violations will break the preview:",
    "    - NEVER use single quotes for strings containing apostrophes. Use double quotes: label: \"Editor's Pick\"",
    "    - Strings with apostrophes MUST use double quotes or template literals",
    "    - Emoji in object properties must be in JSX elements: <span>Pick 🧡</span> not label: 'Pick 🧡'",
    "    - All JS object string values must be properly quoted — validate before returning",
    "10. For ALL images use Unsplash Source API through the Beomz proxy:",
    "    <img src=\"https://beomz.ai/api/proxy/image?url=https://source.unsplash.com/{width}x{height}/?{keyword1},{keyword2}\" alt=\"description\" />",
    "    Keywords by context: hero→restaurant,fine-dining | gallery→food,plating | person→chef,portrait | product→product,lifestyle",
    "    NEVER use picsum, direct external image URLs, or broken src. Every <img> must use https://beomz.ai/api/proxy/image?url=https://source.unsplash.com",
    "11. Keep the output self-contained. Do not add route.ts files, backend files, or package manager files.",
    "12. Prefer a tasteful, production-ready website that could realistically be shown to a customer immediately.",
  ].join("\n");

  const executeCall = async (model: string): Promise<WebsiteGenerationResult> => {
    const client = new Anthropic({ apiKey: apiConfig.ANTHROPIC_API_KEY });
    const stream = client.messages.stream(
      {
        model,
        max_tokens: WEBSITE_MAX_TOKENS,
        system: [
          {
            type: "text",
            text: systemPrompt,
            cache_control: { type: "ephemeral" },
          } as any,
        ],
        tools: [WEBSITE_FILES_TOOL],
        tool_choice: { type: "tool", name: WEBSITE_FILES_TOOL.name },
        messages: [{ role: "user", content: userPrompt }],
      },
      input.abortSignal ? { signal: input.abortSignal } : undefined,
    );
    // Prevent Node from throwing on EventEmitter 'error' before finalMessage() can catch it
    stream.on("error", () => {});
    const message = await stream.finalMessage().catch((err: unknown) => {
      if (isSocketDropError(err)) {
        console.error("[websites/generate] Anthropic socket dropped:", err instanceof Error ? err.message : String(err));
        throw new Error("Connection dropped, please retry");
      }
      throw err;
    });
    const toolBlock = message.content.find(
      (block): block is Anthropic.Messages.ToolUseBlock => block.type === "tool_use" && block.name === WEBSITE_FILES_TOOL.name,
    );

    if (!toolBlock) {
      throw new Error("Anthropic did not call the deliver_website_files tool.");
    }

    const parsed = parseToolResult(toolBlock.input as {
      files?: unknown;
      summary?: unknown;
      siteName?: unknown;
    });

    return {
      ...parsed,
      inputTokens: message.usage?.input_tokens ?? 0,
      outputTokens: message.usage?.output_tokens ?? 0,
    };
  };

  const runWithRetry = async (model: string): Promise<WebsiteGenerationResult> => {
    const initial = await executeCall(model);
    if (initial.files.length > 0) {
      return initial;
    }

    const retry = await executeCall(model);
    if (retry.files.length === 0) {
      throw new Error("Model returned 0 files on retry.");
    }

    return {
      ...retry,
      inputTokens: initial.inputTokens + retry.inputTokens,
      outputTokens: initial.outputTokens + retry.outputTokens,
    };
  };

  try {
    return await runWithRetry(await getModelForBuilder("websites"));
  } catch (error) {
    if (error instanceof Anthropic.APIError && error.status === 404) {
      return runWithRetry(WEBSITE_MODEL_FALLBACK);
    }
    throw error;
  }
}

function isAllowedWebsitePath(path: string): boolean {
  return path === "index.html" || path.startsWith("src/");
}

function hasMetaTags(content: string): boolean {
  return /<meta\s+name="description"/i.test(content)
    && /<meta\s+property="og:title"/i.test(content)
    && /<title>.+<\/title>/i.test(content);
}

function normaliseWebsiteFiles(input: {
  aiFiles: WebsiteFileOutput[];
  fallbackFiles: WebsiteFileOutput[];
}): {
  files: WebsiteFileOutput[];
  scaffoldEnforced: boolean;
} {
  const fallbackByPath = new Map(input.fallbackFiles.map((file) => [file.path, file]));
  const merged = new Map<string, WebsiteFileOutput>();
  let scaffoldEnforced = false;

  for (const file of input.aiFiles) {
    const path = file.path.replace(/^\.?\//, "").replaceAll("\\", "/").trim();
    if (!path || !isAllowedWebsitePath(path)) {
      continue;
    }

    merged.set(path, { path, content: file.content });
  }

  for (const requiredPath of REQUIRED_FILE_PATHS) {
    if (!merged.has(requiredPath)) {
      const fallback = fallbackByPath.get(requiredPath);
      if (fallback) {
        merged.set(requiredPath, fallback);
        scaffoldEnforced = true;
      }
    }
  }

  const indexHtml = merged.get("index.html");
  if (!indexHtml || !hasMetaTags(indexHtml.content)) {
    const fallback = fallbackByPath.get("index.html");
    if (fallback) {
      merged.set("index.html", fallback);
      scaffoldEnforced = true;
    }
  }

  for (const [path, section] of Object.entries(REQUIRED_SECTION_ATTRIBUTES)) {
    const current = merged.get(path);
    if (!current || !current.content.includes(`data-section="${section}"`)) {
      const fallback = fallbackByPath.get(path);
      if (fallback) {
        merged.set(path, fallback);
        scaffoldEnforced = true;
      }
    }
  }

  const mainFile = merged.get("src/main.tsx");
  if (!mainFile || !mainFile.content.includes("./index.css")) {
    const fallback = fallbackByPath.get("src/main.tsx");
    if (fallback) {
      merged.set("src/main.tsx", fallback);
      scaffoldEnforced = true;
    }
  }

  const appFile = merged.get("src/App.tsx");
  if (!appFile || !appFile.content.includes("Home")) {
    const fallback = fallbackByPath.get("src/App.tsx");
    if (fallback) {
      merged.set("src/App.tsx", fallback);
      scaffoldEnforced = true;
    }
  }

  const cssFile = merged.get("src/index.css");
  if (!cssFile || !/@import\s+"tailwindcss"/.test(cssFile.content)) {
    const fallback = fallbackByPath.get("src/index.css");
    if (fallback) {
      merged.set("src/index.css", fallback);
      scaffoldEnforced = true;
    }
  }

  const requiredOrder = new Map<string, number>(REQUIRED_FILE_PATHS.map((path, index) => [path, index]));
  const files = [...merged.values()].sort((left, right) => {
    const leftIndex = requiredOrder.get(left.path);
    const rightIndex = requiredOrder.get(right.path);

    if (leftIndex !== undefined || rightIndex !== undefined) {
      return (leftIndex ?? Number.MAX_SAFE_INTEGER) - (rightIndex ?? Number.MAX_SAFE_INTEGER);
    }

    return left.path.localeCompare(right.path);
  });

  return { files, scaffoldEnforced };
}

function toStudioFiles(files: WebsiteFileOutput[]): StudioFile[] {
  return files.map((file) => ({
    path: file.path,
    kind: inferFileKind(file.path),
    language: inferLanguage(file.path),
    content: file.content,
    source: "ai",
    locked: false,
  }));
}

function buildDoneMessage(
  summary: string,
  projectName: string,
): string {
  return summary.trim().length > 0 ? summary.trim() : `${projectName} website generated.`;
}

function createAbortError(): Error {
  const error = new Error("The operation was aborted.");
  error.name = "AbortError";
  return error;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw createAbortError();
  }
}

websitesGenerateRoute.post(
  "/generate",
  verifyPlatformJwt,
  loadOrgContext,
  async (c) => {
    const orgContext = c.get("orgContext") as OrgContext;
    const body = await c.req.json().catch(() => null);
    const parsed = requestSchema.safeParse(body);

    if (!parsed.success) {
      return c.json(
        {
          error: "Invalid website generation request body.",
          details: parsed.error.flatten(),
        },
        400,
      );
    }

    const prompt = parsed.data.prompt;
    const projectId = parsed.data.projectId;
    const sessionId = parsed.data.sessionId.trim();
    const siteType = parsed.data.siteType ?? "landing";
    const vibe = parsed.data.vibe ?? "minimal";
    const pages = [...new Set((parsed.data.pages ?? []).map((page) => toTitleCase(page)).filter(Boolean))];

    const project = await orgContext.db.findProjectById(projectId);
    if (!project || project.org_id !== orgContext.org.id) {
      return c.json({ error: "Project not found." }, 404);
    }

    const buildId = randomUUID();
    const requestedAt = ts();
    const templateId = mapSiteTypeToTemplateId(siteType);
    const initialMetadata = {
      builderTrace: createEmptyBuilderV3TraceMetadata(),
      generationMode: "website",
      model: await getModelForBuilder("websites"),
      pages,
      resultSource: "ai",
      sessionId,
      siteType,
      vibe,
      creditsUsed: 0,
    };

    await orgContext.db.createGeneration({
      id: buildId,
      project_id: projectId,
      template_id: templateId,
      operation_id: sessionId,
      status: "running",
      prompt,
      started_at: requestedAt,
      completed_at: null,
      output_paths: [],
      summary: `Generating website for ${project.name}.`,
      error: null,
      preview_entry_path: WEBSITE_PREVIEW_ENTRY_PATH,
      warnings: [],
      files: [],
      metadata: initialMetadata,
      session_events: [],
    });

    await orgContext.db.updateProject(projectId, {
      status: "queued",
      template: templateId,
      updated_at: requestedAt,
    }).catch(() => undefined);

    return streamSSE(c, async (sse) => {
      let nextEventId = 1;
      let streamOpen = true;
      const abortController = new AbortController();
      const handleAbort = () => abortController.abort();

      c.req.raw.signal.addEventListener("abort", handleAbort, { once: true });

      const pingInterval = setInterval(async () => {
        if (!streamOpen || c.req.raw.signal.aborted) {
          return;
        }

        try {
          await sse.write(": ping\n\n");
        } catch {
          streamOpen = false;
        }
      }, WEBSITE_PING_INTERVAL_MS);

      const cleanup = () => {
        streamOpen = false;
        clearInterval(pingInterval);
        c.req.raw.signal.removeEventListener("abort", handleAbort);
      };

      const writeEvent = async (
        eventName: string,
        payload: BuilderV3Event | WebsiteFilesEvent | WebsiteImageUpdateEvent,
        extraPatch?: Partial<Parameters<StudioDbClient["updateGeneration"]>[1]>,
      ) => {
        await appendEventToDb(
          orgContext.db,
          buildId,
          payload as unknown as BuilderV3Event,
          extraPatch,
        );

        if (!streamOpen || c.req.raw.signal.aborted) {
          throw createAbortError();
        }

        try {
          await sse.writeSSE({
            event: eventName,
            id: payload.id,
            data: JSON.stringify(payload),
          });
        } catch (error) {
          streamOpen = false;
          throw error;
        }
      };

      try {
        throwIfAborted(abortController.signal);

        if (!isAdminEmail(orgContext.user.email)) {
          let totalAvailable = 0;
          try {
            const freshOrg = await orgContext.db.getOrgWithBalance(orgContext.org.id);
            totalAvailable = Number(freshOrg?.credits ?? 0) + Number(freshOrg?.topup_credits ?? 0);
          } catch (error) {
            console.warn(
              "[websites/generate] credit check failed (non-fatal):",
              error instanceof Error ? error.message : String(error),
            );
          }

          if (totalAvailable <= 0) {
            const insufficientEvent: BuilderV3InsufficientCreditsEvent = {
              type: "insufficient_credits",
              id: String(nextEventId++),
              timestamp: ts(),
              operation: WEBSITE_OPERATION,
              available: totalAvailable,
              required: 0,
              features: [],
            };

            await writeEvent("insufficient_credits", insufficientEvent, {
              status: "insufficient_credits",
            });
            await orgContext.db.updateProject(projectId, {
              status: "draft",
              updated_at: ts(),
            }).catch(() => undefined);
            return;
          }
        }

        const preBuildAckEvent: BuilderV3PreBuildAckEvent = {
          type: "pre_build_ack",
          id: String(nextEventId++),
          timestamp: ts(),
          operation: WEBSITE_OPERATION,
          message: "Building your website scaffold...",
        };

        await writeEvent("pre_build_ack", preBuildAckEvent, { status: "running" });
        await appendSessionEventToDb(orgContext.db, buildId, { type: "user", content: prompt });
        await appendSessionEventToDb(orgContext.db, buildId, {
          type: "pre_build_ack",
          content: preBuildAckEvent.message,
        });

        throwIfAborted(abortController.signal);

        const preambleEvent: BuilderV3PreambleEvent = {
          type: "stage_preamble",
          id: String(nextEventId++),
          timestamp: ts(),
          operation: WEBSITE_OPERATION,
          restatement: buildRestatement(siteType, vibe, prompt),
          bullets: buildPreambleBullets(siteType, vibe, pages),
        };

        await writeEvent("stage_preamble", preambleEvent);

        const fallbackFiles = buildFallbackWebsiteFiles({
          projectName: project.name,
          prompt,
          siteType,
          vibe,
          pages,
        });

        let generation = apiConfig.MOCK_ANTHROPIC
          ? null
          : await callAnthropicWebsiteGeneration({
              prompt,
              siteType,
              vibe,
              pages,
              projectName: project.name,
              abortSignal: abortController.signal,
            }).catch((error) => {
              console.error(
                "[websites/generate] anthropic generation failed; falling back to scaffold:",
                error instanceof Error ? error.message : String(error),
              );
              return null;
            });

        const normalized = normaliseWebsiteFiles({
          aiFiles: generation?.files ?? [],
          fallbackFiles,
        });
        let finalFiles = toStudioFiles(normalized.files);
        const fallbackUsed = generation === null || normalized.scaffoldEnforced || apiConfig.MOCK_ANTHROPIC === true;
        const fallbackReason = generation === null
          ? (apiConfig.MOCK_ANTHROPIC ? "mock_anthropic" : "anthropic_error")
          : normalized.scaffoldEnforced
          ? "scaffold_enforced"
          : null;
        const summary = buildDoneMessage(
          generation?.summary ?? `Generated a ${vibe} ${siteType} website for ${project.name}.`,
          project.name,
        );

        throwIfAborted(abortController.signal);

        const filesEvent: WebsiteFilesEvent = {
          type: "files",
          id: String(nextEventId++),
          timestamp: ts(),
          operation: WEBSITE_OPERATION,
          files: finalFiles.map((file) => ({ path: file.path, content: file.content })),
          totalFiles: finalFiles.length,
        };

        await writeEvent("files", filesEvent, {
          files: finalFiles,
          output_paths: finalFiles.map((file) => file.path),
          preview_entry_path: WEBSITE_PREVIEW_ENTRY_PATH,
        });

        throwIfAborted(abortController.signal);

        const heroImagePrompt = buildHeroImagePrompt({
          projectName: project.name,
          prompt,
          siteType,
          vibe,
          pages,
          summary,
        });
        const heroImageUrl = await generateFalHeroImageUrl({
          heroPrompt: heroImagePrompt,
          abortSignal: abortController.signal,
        }).catch((error) => {
          if (isAbortError(error) || abortController.signal.aborted || c.req.raw.signal.aborted) {
            throw error;
          }

          console.warn(
            "[websites/generate] fal hero image generation failed; keeping existing hero image:",
            error instanceof Error ? error.message : String(error),
          );
          return null;
        });

        if (heroImageUrl) {
          const proxiedUrl = buildImageProxyUrl(heroImageUrl);
          const heroUpdate = applyHeroImageUpdate(finalFiles, proxiedUrl);
          if (heroUpdate.updatedContent) {
            finalFiles = heroUpdate.files;

            const imageUpdateEvent: WebsiteImageUpdateEvent = {
              type: "image_update",
              id: String(nextEventId++),
              timestamp: ts(),
              operation: WEBSITE_OPERATION,
              file: WEBSITE_HERO_FILE_PATH,
              content: heroUpdate.updatedContent,
            };

            await writeEvent("image_update", imageUpdateEvent, {
              files: finalFiles,
              output_paths: finalFiles.map((file) => file.path),
              preview_entry_path: WEBSITE_PREVIEW_ENTRY_PATH,
            });
          }
        }

        const inputTokens = generation?.inputTokens ?? 0;
        const outputTokens = generation?.outputTokens ?? 0;
        let creditsUsed = 0;
        if (!fallbackUsed && outputTokens > 0 && !isAdminEmail(orgContext.user.email)) {
          const totalCost = calcCreditCost(inputTokens, outputTokens);
          try {
            const deduction = await orgContext.db.applyOrgUsageDeduction(
              orgContext.org.id,
              totalCost,
              buildId,
              "App generation",
            );
            creditsUsed = deduction.deducted;
            console.log("[websites/generate] credits deducted:", {
              deducted: creditsUsed,
              inputTokens,
              outputTokens,
              buildId,
            });
          } catch (error) {
            console.error(
              "[websites/generate] credit deduction failed (non-fatal):",
              error instanceof Error ? error.message : String(error),
            );
          }
        }

        const completedAt = ts();
        const doneEvent: BuilderV3DoneEvent = {
          type: "done",
          id: String(nextEventId++),
          timestamp: completedAt,
          operation: WEBSITE_OPERATION,
          code: "build_completed",
          message: summary,
          buildId,
          projectId,
          fallbackUsed,
          fallbackReason,
          payload: {
            previewEntryPath: WEBSITE_PREVIEW_ENTRY_PATH,
            source: fallbackUsed ? "fallback" : "ai",
            totalFiles: finalFiles.length,
            siteType,
            vibe,
          },
        };

        await writeEvent("done", doneEvent, {
          completed_at: completedAt,
          files: finalFiles,
          output_paths: finalFiles.map((file) => file.path),
          preview_entry_path: WEBSITE_PREVIEW_ENTRY_PATH,
          status: "completed",
          summary,
        });

        const completedRow = await orgContext.db.findGenerationById(buildId).catch(() => null);
        const completedMetadata = typeof completedRow?.metadata === "object" && completedRow.metadata !== null
          ? (completedRow.metadata as Record<string, unknown>)
          : initialMetadata;
        await orgContext.db.updateGeneration(buildId, {
          metadata: {
            ...completedMetadata,
            creditsUsed,
            inputTokens,
            outputTokens,
            resultSource: fallbackUsed ? "fallback" : "ai",
            fallbackReason,
          },
        }).catch(() => undefined);

        await orgContext.db.updateProject(projectId, {
          status: "ready",
          template: templateId,
          updated_at: completedAt,
        }).catch(() => undefined);

        await syncGeneratedProjectName({
          db: orgContext.db,
          projectId,
          currentProjectName: project.name,
          files: finalFiles,
          requestUrl: c.req.url,
          authorizationHeader: c.req.header("authorization"),
          abortSignal: abortController.signal,
        });

        void saveProjectVersion(
          projectId,
          prompt.slice(0, 100),
          studioFilesToVersionFiles(finalFiles),
        ).catch((error) => {
          console.error("[websites/generate] auto-save failed:", error);
        });
      } catch (error) {
        const aborted = isAbortError(error) || abortController.signal.aborted || c.req.raw.signal.aborted;
        const failedAt = ts();

        if (aborted) {
          await orgContext.db.updateGeneration(buildId, {
            completed_at: failedAt,
            error: "Request aborted during website generation.",
            status: "cancelled",
          }).catch(() => undefined);
        } else {
          console.error(
            "[websites/generate] request failed:",
            error instanceof Error ? error.message : String(error),
          );

          await orgContext.db.updateGeneration(buildId, {
            completed_at: failedAt,
            error: error instanceof Error ? error.message : "Website generation failed.",
            status: "failed",
          }).catch(() => undefined);

          if (streamOpen) {
            try {
              await sse.writeSSE({
                event: "error",
                id: String(nextEventId++),
                data: JSON.stringify({
                  type: "error",
                  id: String(nextEventId - 1),
                  timestamp: failedAt,
                  operation: WEBSITE_OPERATION,
                  code: "build_failed",
                  message: error instanceof Error ? error.message : "Website generation failed.",
                  buildId,
                  projectId,
                }),
              });
            } catch {
              // ignore write failures during shutdown
            }
          }
        }

        await orgContext.db.updateProject(projectId, {
          status: "draft",
          updated_at: failedAt,
        }).catch(() => undefined);
      } finally {
        cleanup();
      }
    });
  },
);

export default websitesGenerateRoute;
