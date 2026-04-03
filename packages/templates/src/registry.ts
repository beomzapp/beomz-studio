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

export const TEMPLATE_REGISTRY = [
  marketingWebsiteTemplate,
  saasDashboardTemplate,
  workspaceTaskTemplate,
] as const satisfies readonly [
  TemplateDefinition,
  TemplateDefinition,
  TemplateDefinition,
];

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

export function listTemplateDefinitions(): readonly TemplateDefinition[] {
  return TEMPLATE_REGISTRY;
}
