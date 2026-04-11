import type { TemplateDefinition, TemplateId } from "@beomz-studio/contracts";

const marketingWebsiteTemplate = {
  id: "marketing-website",
  name: "Marketing Website",
  description: "A public-facing launch site with a hero, pricing, and contact flow.",
  shell: "website",
  defaultProjectName: "Launch Website",
  previewEntryPath: "/",
  promptHints: [
    "Lead with a clear value proposition and a single primary CTA.",
    "Keep navigation simple and conversion-focused.",
  ],
  pages: [
    {
      id: "home",
      name: "Home",
      path: "/",
      kind: "landing",
      summary: "Hero, social proof, and the main conversion CTA.",
      navigationLabel: "Home",
      inPrimaryNav: true,
      requiresAuth: false,
    },
    {
      id: "pricing",
      name: "Pricing",
      path: "/pricing",
      kind: "pricing",
      summary: "Pricing tiers, included features, and objections handled inline.",
      navigationLabel: "Pricing",
      inPrimaryNav: true,
      requiresAuth: false,
    },
    {
      id: "contact",
      name: "Contact",
      path: "/contact",
      kind: "contact",
      summary: "Lead capture form and high-intent contact details.",
      navigationLabel: "Contact",
      inPrimaryNav: true,
      requiresAuth: false,
    },
  ],
} as const satisfies TemplateDefinition;

const saasDashboardTemplate = {
  id: "saas-dashboard",
  name: "SaaS Dashboard",
  description: "An authenticated product dashboard with account-focused navigation.",
  shell: "dashboard",
  defaultProjectName: "Product Dashboard",
  previewEntryPath: "/app",
  promptHints: [
    "Prioritize one primary metric area and one clear next action.",
    "Use side navigation and authenticated states throughout the experience.",
  ],
  pages: [
    {
      id: "overview",
      name: "Overview",
      path: "/app",
      kind: "dashboard-home",
      summary: "Primary metrics, activity, and recent work.",
      navigationLabel: "Overview",
      inPrimaryNav: true,
      requiresAuth: true,
    },
    {
      id: "customers",
      name: "Customers",
      path: "/app/customers",
      kind: "customers",
      summary: "Customer records, lifecycle state, and account details.",
      navigationLabel: "Customers",
      inPrimaryNav: true,
      requiresAuth: true,
    },
    {
      id: "settings",
      name: "Settings",
      path: "/app/settings",
      kind: "settings",
      summary: "Workspace settings, billing, and account controls.",
      navigationLabel: "Settings",
      inPrimaryNav: true,
      requiresAuth: true,
    },
  ],
} as const satisfies TemplateDefinition;

const workspaceTaskTemplate = {
  id: "workspace-task",
  name: "Workspace Task Manager",
  description: "A collaborative workspace with tasks, board views, and team settings.",
  shell: "workspace",
  defaultProjectName: "Team Workspace",
  previewEntryPath: "/workspace",
  promptHints: [
    "Optimize for daily use: quick capture, filtering, and progress visibility.",
    "Make team workflows obvious through lists, board states, and settings.",
  ],
  pages: [
    {
      id: "tasks",
      name: "Tasks",
      path: "/workspace",
      kind: "tasks",
      summary: "Task inbox, ownership, due dates, and focus views.",
      navigationLabel: "Tasks",
      inPrimaryNav: true,
      requiresAuth: true,
    },
    {
      id: "board",
      name: "Board",
      path: "/workspace/board",
      kind: "board",
      summary: "Kanban-style work tracking with status columns.",
      navigationLabel: "Board",
      inPrimaryNav: true,
      requiresAuth: true,
    },
    {
      id: "settings",
      name: "Settings",
      path: "/workspace/settings",
      kind: "settings",
      summary: "Team-level workflow, member, and workspace settings.",
      navigationLabel: "Settings",
      inPrimaryNav: true,
      requiresAuth: true,
    },
  ],
} as const satisfies TemplateDefinition;

const mobileAppTemplate = {
  id: "mobile-app",
  name: "Mobile App",
  description: "A mobile-first consumer app with a phone-frame layout and bottom tab navigation.",
  shell: "workspace",
  defaultProjectName: "Mobile App",
  previewEntryPath: "/mobile",
  promptHints: [
    "Simulate a polished iOS/Android app inside a centered phone-width frame.",
    "Prioritize touch-friendly navigation, thumb reach, and bottom-tab flows.",
  ],
  pages: [
    {
      id: "home",
      name: "Home",
      path: "/mobile",
      kind: "mobile-home",
      summary: "Primary mobile dashboard with daily progress, shortcuts, and key metrics.",
      navigationLabel: "Home",
      inPrimaryNav: true,
      requiresAuth: true,
    },
    {
      id: "activity",
      name: "Activity",
      path: "/mobile/activity",
      kind: "activity",
      summary: "Recent sessions, streaks, logs, or habits with touch-friendly cards.",
      navigationLabel: "Activity",
      inPrimaryNav: true,
      requiresAuth: true,
    },
    {
      id: "profile",
      name: "Profile",
      path: "/mobile/profile",
      kind: "profile",
      summary: "Profile preferences, goals, and mobile settings.",
      navigationLabel: "Profile",
      inPrimaryNav: true,
      requiresAuth: true,
    },
  ],
} as const satisfies TemplateDefinition;

const socialAppTemplate = {
  id: "social-app",
  name: "Social App",
  description: "A community or feed-based product with a responsive social layout.",
  shell: "workspace",
  defaultProjectName: "Community Platform",
  previewEntryPath: "/social",
  promptHints: [
    "Make the feed feel alive with avatars, reactions, comments, and discovery surfaces.",
    "Balance posting, exploration, notifications, and profile moments across breakpoints.",
  ],
  pages: [
    {
      id: "feed",
      name: "Feed",
      path: "/social",
      kind: "feed",
      summary: "Primary content feed with posts, reactions, and discussion threads.",
      navigationLabel: "Home",
      inPrimaryNav: true,
      requiresAuth: true,
    },
    {
      id: "explore",
      name: "Explore",
      path: "/social/explore",
      kind: "explore",
      summary: "Discovery surface for trending posts, people, tags, or communities.",
      navigationLabel: "Explore",
      inPrimaryNav: true,
      requiresAuth: true,
    },
    {
      id: "profile",
      name: "Profile",
      path: "/social/profile",
      kind: "profile",
      summary: "User profile with bio, stats, recent posts, and saved content.",
      navigationLabel: "Profile",
      inPrimaryNav: true,
      requiresAuth: true,
    },
  ],
} as const satisfies TemplateDefinition;

const ecommerceTemplate = {
  id: "ecommerce",
  name: "E-Commerce Storefront",
  description: "A responsive online store with merchandising, product detail, and checkout paths.",
  shell: "website",
  defaultProjectName: "Online Store",
  previewEntryPath: "/",
  promptHints: [
    "Use strong merchandising, search, and conversion-focused shopping patterns.",
    "Make cart and checkout actions obvious on both desktop and mobile.",
  ],
  pages: [
    {
      id: "home",
      name: "Storefront",
      path: "/",
      kind: "landing",
      summary: "Featured products, categories, promos, and merchandising hero blocks.",
      navigationLabel: "Shop",
      inPrimaryNav: true,
      requiresAuth: false,
    },
    {
      id: "products",
      name: "Products",
      path: "/products",
      kind: "products",
      summary: "Filterable product grid with pricing, ratings, and inventory cues.",
      navigationLabel: "Products",
      inPrimaryNav: true,
      requiresAuth: false,
    },
    {
      id: "checkout",
      name: "Checkout",
      path: "/checkout",
      kind: "checkout",
      summary: "Cart review, delivery details, and payment confirmation flow.",
      navigationLabel: "Checkout",
      inPrimaryNav: true,
      requiresAuth: false,
    },
  ],
} as const satisfies TemplateDefinition;

const portfolioTemplate = {
  id: "portfolio",
  name: "Portfolio Website",
  description: "A clean personal or agency portfolio with project showcases and contact flow.",
  shell: "website",
  defaultProjectName: "Portfolio Site",
  previewEntryPath: "/",
  promptHints: [
    "Highlight craft, credibility, and selected work with strong typography and spacing.",
    "Keep the layout minimal but memorable, with clear contact actions.",
  ],
  pages: [
    {
      id: "home",
      name: "Home",
      path: "/",
      kind: "landing",
      summary: "Hero, intro, and standout work teasers for a creator or agency.",
      navigationLabel: "Home",
      inPrimaryNav: true,
      requiresAuth: false,
    },
    {
      id: "projects",
      name: "Projects",
      path: "/projects",
      kind: "projects",
      summary: "Case-study style project grid with outcomes, visuals, and services.",
      navigationLabel: "Work",
      inPrimaryNav: true,
      requiresAuth: false,
    },
    {
      id: "contact",
      name: "Contact",
      path: "/contact",
      kind: "contact",
      summary: "Inquiry form, availability, and booking/contact details.",
      navigationLabel: "Contact",
      inPrimaryNav: true,
      requiresAuth: false,
    },
  ],
} as const satisfies TemplateDefinition;

const blogCmsTemplate = {
  id: "blog-cms",
  name: "Blog CMS",
  description: "A content-focused publication site with article listings and readable editorial pages.",
  shell: "website",
  defaultProjectName: "Editorial Site",
  previewEntryPath: "/",
  promptHints: [
    "Prioritize readable typography, article discovery, and editorial credibility.",
    "Show authorship, dates, tags, and related reading throughout.",
  ],
  pages: [
    {
      id: "articles",
      name: "Articles",
      path: "/",
      kind: "articles",
      summary: "Article listing with featured posts, categories, and editorial highlights.",
      navigationLabel: "Latest",
      inPrimaryNav: true,
      requiresAuth: false,
    },
    {
      id: "article",
      name: "Article",
      path: "/article",
      kind: "article",
      summary: "Single article page with author details, body content, and related posts.",
      navigationLabel: "Featured Story",
      inPrimaryNav: true,
      requiresAuth: false,
    },
    {
      id: "contact",
      name: "Contact",
      path: "/contact",
      kind: "contact",
      summary: "Newsletter signup, editorial contact details, and contributor CTA.",
      navigationLabel: "Contact",
      inPrimaryNav: true,
      requiresAuth: false,
    },
  ],
} as const satisfies TemplateDefinition;

const onboardingFlowTemplate = {
  id: "onboarding-flow",
  name: "Onboarding Flow",
  description: "A multi-step onboarding or signup wizard with progress cues and a success state.",
  shell: "website",
  defaultProjectName: "Onboarding Flow",
  previewEntryPath: "/",
  promptHints: [
    "Keep each step focused, centered, and easy to complete.",
    "Use clear progress cues, next actions, and confirmation moments.",
  ],
  pages: [
    {
      id: "welcome",
      name: "Welcome",
      path: "/",
      kind: "onboarding-step",
      summary: "Step one with intro copy, progress indicator, and the first decision.",
      navigationLabel: "Start",
      inPrimaryNav: true,
      requiresAuth: false,
    },
    {
      id: "profile",
      name: "Profile Setup",
      path: "/profile",
      kind: "onboarding-step",
      summary: "Focused profile or preferences step with clear back/next controls.",
      navigationLabel: "Profile",
      inPrimaryNav: true,
      requiresAuth: false,
    },
    {
      id: "confirmation",
      name: "Confirmation",
      path: "/done",
      kind: "onboarding-step",
      summary: "Final review or success screen with confirmation and next-step CTA.",
      navigationLabel: "Done",
      inPrimaryNav: true,
      requiresAuth: false,
    },
  ],
} as const satisfies TemplateDefinition;

const dataTableAppTemplate = {
  id: "data-table-app",
  name: "Data Table App",
  description: "A management tool centered around dense, filterable data tables and record actions.",
  shell: "dashboard",
  defaultProjectName: "Operations Console",
  previewEntryPath: "/app",
  promptHints: [
    "Make the primary table highly usable with filters, search, pagination, and row actions.",
    "Support detail panels, edit actions, and dense but readable layouts.",
  ],
  pages: [
    {
      id: "overview",
      name: "Overview",
      path: "/app",
      kind: "dashboard-home",
      summary: "Overview with KPI cards, filters, and a primary management table.",
      navigationLabel: "Overview",
      inPrimaryNav: true,
      requiresAuth: true,
    },
    {
      id: "records",
      name: "Records",
      path: "/app/records",
      kind: "data-table",
      summary: "Full data table with sorting, pagination, filters, and row actions.",
      navigationLabel: "Records",
      inPrimaryNav: true,
      requiresAuth: true,
    },
    {
      id: "settings",
      name: "Settings",
      path: "/app/settings",
      kind: "settings",
      summary: "Operational settings, permissions, saved views, and automation controls.",
      navigationLabel: "Settings",
      inPrimaryNav: true,
      requiresAuth: true,
    },
  ],
} as const satisfies TemplateDefinition;

const interactiveToolTemplate = {
  id: "interactive-tool",
  name: "Interactive Tool",
  description: "A focused single-purpose interactive utility, calculator, counter, or game app.",
  shell: "website",
  defaultProjectName: "Interactive Tool",
  previewEntryPath: "/",
  promptHints: [
    "Build the primary interactive surface with clear inputs, controls, outputs, and live state.",
    "Keep the interface focused and immediate — minimize navigation and prioritize the core interaction.",
  ],
  pages: [
    {
      id: "tool",
      name: "Tool",
      path: "/",
      kind: "tool",
      summary: "The primary interactive surface: inputs, controls, outputs, and live state.",
      navigationLabel: "Tool",
      inPrimaryNav: true,
      requiresAuth: false,
    },
    {
      id: "settings",
      name: "Settings",
      path: "/settings",
      kind: "settings",
      summary: "Tool configuration: precision, units, display preferences, and reset controls.",
      navigationLabel: "Settings",
      inPrimaryNav: true,
      requiresAuth: false,
    },
  ],
} as const satisfies TemplateDefinition;

export const TEMPLATE_REGISTRY = [
  marketingWebsiteTemplate,
  saasDashboardTemplate,
  workspaceTaskTemplate,
  mobileAppTemplate,
  socialAppTemplate,
  ecommerceTemplate,
  portfolioTemplate,
  blogCmsTemplate,
  onboardingFlowTemplate,
  dataTableAppTemplate,
  interactiveToolTemplate,
] as const satisfies readonly TemplateDefinition[];

const templateRegistryById = TEMPLATE_REGISTRY.reduce<Record<TemplateId, TemplateDefinition>>(
  (registry, template) => {
    registry[template.id] = template;
    return registry;
  },
  {} as Record<TemplateId, TemplateDefinition>,
);

export function getTemplateDefinition(templateId: TemplateId): TemplateDefinition {
  return templateRegistryById[templateId];
}

/**
 * Like getTemplateDefinition but accepts any string (e.g. prebuilt template IDs
 * such as "budget-planner"). Falls back to the "interactive-tool" definition so
 * callers always get a valid previewEntryPath and shell.
 */
export function getTemplateDefinitionSafe(templateId: string): TemplateDefinition {
  return (templateRegistryById as Record<string, TemplateDefinition>)[templateId]
    ?? interactiveToolTemplate;
}

export function listTemplateDefinitions(): readonly TemplateDefinition[] {
  return TEMPLATE_REGISTRY;
}
