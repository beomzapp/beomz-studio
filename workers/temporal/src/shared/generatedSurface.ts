import type {
  GeneratedAppManifest,
  Project,
  StudioFile,
  TemplateDefinition,
  TemplatePage,
} from "@beomz-studio/contracts";
import {
  buildGeneratedAppShellPath,
  buildGeneratedDataFilePath,
  buildGeneratedManifest,
  buildGeneratedManifestPath,
  buildGeneratedNavigationFilePath,
  buildGeneratedThemeFilePath,
  buildGeneratedUiComponentPath,
  buildGeneratedUtilsPath,
} from "@beomz-studio/contracts";

function serialize(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function iconForPage(page: TemplatePage): string {
  switch (page.kind) {
    case "landing":
      return "Home";
    case "pricing":
      return "BadgeDollarSign";
    case "contact":
      return "MessageSquare";
    case "dashboard-home":
      return "LayoutDashboard";
    case "customers":
      return "Users";
    case "settings":
      return "Settings";
    case "tasks":
      return "ListTodo";
    case "board":
      return "KanbanSquare";
    case "mobile-home":
      return "Home";
    case "activity":
      return "Activity";
    case "profile":
      return "UserRound";
    case "feed":
      return "PanelsTopLeft";
    case "explore":
      return "Compass";
    case "products":
      return "ShoppingBag";
    case "checkout":
      return "CreditCard";
    case "projects":
      return "Briefcase";
    case "articles":
      return "Newspaper";
    case "article":
      return "FileText";
    case "onboarding-step":
      return "Sparkles";
    case "data-table":
      return "TableProperties";
    case "tool":
      return "Wrench";
    default:
      return "ChevronRight";
  }
}

function buildThemeFile(template: TemplateDefinition): string {
  const shellPalette =
    template.shell === "website"
      ? {
          accent: "#f97316",
          accentSoft: "bg-orange-500/10 text-orange-200",
          background: "bg-zinc-950",
          border: "border-white/10",
          card: "bg-white/[0.04]",
          input: "border border-white/10 bg-black/30 text-white placeholder:text-zinc-500",
          muted: "text-zinc-400",
          panel: "bg-zinc-900",
          surfaceText: "text-white",
        }
      : template.id === "mobile-app"
        ? {
            accent: "#2563eb",
            accentSoft: "bg-blue-500/10 text-blue-700",
            background: "bg-slate-100",
            border: "border-slate-200",
            card: "bg-white",
            input: "border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400",
            muted: "text-slate-500",
            panel: "bg-white",
            surfaceText: "text-slate-900",
          }
        : {
            accent: "#2563eb",
            accentSoft: "bg-blue-500/10 text-blue-700",
            background: "bg-slate-100",
            border: "border-slate-200",
            card: "bg-white",
            input: "border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400",
            muted: "text-slate-500",
            panel: "bg-white",
            surfaceText: "text-slate-900",
          };

  return `export const generatedTheme = {
  colors: {
    accent: ${serialize(shellPalette.accent)},
  },
  classes: {
    accentSoft: ${serialize(shellPalette.accentSoft)},
    background: ${serialize(shellPalette.background)},
    border: ${serialize(shellPalette.border)},
    card: ${serialize(shellPalette.card)},
    input: ${serialize(shellPalette.input)},
    muted: ${serialize(shellPalette.muted)},
    panel: ${serialize(shellPalette.panel)},
    surfaceText: ${serialize(shellPalette.surfaceText)},
  },
  shell: ${serialize(template.shell)},
  templateId: ${serialize(template.id)},
} as const;

export type GeneratedTheme = typeof generatedTheme;
`;
}

function buildNavigationFile(template: TemplateDefinition, manifest: GeneratedAppManifest): string {
  const items = manifest.routes.map((route, index) => ({
    ...route,
    icon: iconForPage(template.pages[index] ?? template.pages[0]!),
  }));

  return `export interface GeneratedNavigationItem {
  id: string;
  href: string;
  label: string;
  icon: string;
  auth: "public" | "authenticated";
  inPrimaryNav: boolean;
}

export const generatedNavigation = ${serialize(items)} as const satisfies readonly GeneratedNavigationItem[];
`;
}

function buildDataFile(template: TemplateDefinition, projectName: string): string {
  const shared = {
    activity: [
      { id: "a1", label: "Weekly planning review", detail: "Prepared the next sprint priorities", timestamp: "Today, 09:30" },
      { id: "a2", label: "Customer follow-up", detail: "Sent product recap and next steps", timestamp: "Yesterday, 16:10" },
      { id: "a3", label: "Launch checklist", detail: "Validated content, pricing, and analytics", timestamp: "Yesterday, 11:40" },
    ],
    metrics: [
      { label: "Active users", value: "12.4K", delta: "+8.2%" },
      { label: "Conversion", value: "4.8%", delta: "+1.1%" },
      { label: "Revenue", value: "$48.2K", delta: "+12.6%" },
    ],
    people: [
      { id: "p1", name: "Sarah Chen", role: "Team Lead", status: "Active" },
      { id: "p2", name: "Marcus Rodriguez", role: "Operations", status: "Reviewing" },
      { id: "p3", name: "Ava Thompson", role: "Designer", status: "Active" },
    ],
  };

  const domainSpecific =
    template.id === "ecommerce"
      ? {
          products: [
            { id: "sku-1", name: "Cloud Knit Runner", price: "$84", status: "Best seller" },
            { id: "sku-2", name: "Trail Pack Bottle", price: "$32", status: "Low stock" },
            { id: "sku-3", name: "Everyday Overshirt", price: "$68", status: "New arrival" },
          ],
        }
      : template.id === "blog-cms"
        ? {
            articles: [
              { id: "art-1", title: "How teams ship calmer launches", author: "Omar Fareda", date: "Apr 4, 2026" },
              { id: "art-2", title: "Design systems that still feel human", author: "Mina Hasan", date: "Apr 1, 2026" },
              { id: "art-3", title: "The case for smaller AI workflows", author: "Theo Nguyen", date: "Mar 28, 2026" },
            ],
          }
        : template.id === "workspace-task"
          ? {
              tasks: [
                { id: "tsk-1", title: "Design landing page mockups", owner: "Sarah Chen", priority: "High", due: "Jan 20" },
                { id: "tsk-2", title: "Set up project repository", owner: "Marcus Rodriguez", priority: "High", due: "Jan 15" },
                { id: "tsk-3", title: "Write API documentation", owner: "Alex Thompson", priority: "Medium", due: "Jan 25" },
              ],
            }
          : template.id === "social-app"
            ? {
                feed: [
                  { id: "post-1", author: "Lina Noor", handle: "@linanoor", likes: 184, comments: 28, caption: "Three small UX tweaks that made onboarding feel instant." },
                  { id: "post-2", author: "Evan Brooks", handle: "@evanb", likes: 132, comments: 19, caption: "We shipped the new creator dashboard today." },
                  { id: "post-3", author: "Riya Shah", handle: "@riyashah", likes: 91, comments: 12, caption: "Favorite productivity habit for deep work mornings?" },
                ],
              }
            : template.id === "onboarding-flow"
              ? {
                  steps: [
                    { id: "step-1", title: "Tell us about your team", description: "Right-size the setup around your workflow." },
                    { id: "step-2", title: "Choose your priorities", description: "Focus the first dashboard on the right metrics." },
                    { id: "step-3", title: "Invite collaborators", description: "Start with the people who need visibility now." },
                  ],
                }
              : template.id === "interactive-tool"
                ? {
                    history: [
                      { id: "h1", label: "512 ÷ 8", result: "64", timestamp: "Just now" },
                      { id: "h2", label: "1,024 × 3.14", result: "3,215.36", timestamp: "2 min ago" },
                      { id: "h3", label: "250 + 175", result: "425", timestamp: "5 min ago" },
                    ],
                  }
              : {
                  records: [
                    { id: "rec-1", title: "Northstar Health", value: "$24,500", owner: "Ava Thompson" },
                    { id: "rec-2", title: "Harbor Commerce", value: "$18,200", owner: "Marcus Rodriguez" },
                    { id: "rec-3", title: "Atlas Studio", value: "$9,400", owner: "Sarah Chen" },
                  ],
                };

  return `export const generatedData = ${serialize({
    ...shared,
    ...domainSpecific,
    projectName,
  })} as const;

export type GeneratedData = typeof generatedData;
`;
}

function buildPrimaryButtonFile(template: TemplateDefinition): string {
  if (template.id === "interactive-tool") {
    return `import type { ReactNode } from "react";

interface PrimaryButtonProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  type?: "button" | "submit";
}

function PrimaryButton({
  children,
  className = "",
  onClick,
  type = "button",
}: PrimaryButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      className={\`inline-flex items-center justify-center rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-600 \${className}\`}
    >
      {children}
    </button>
  );
}

export default PrimaryButton;
export { PrimaryButton };
`;
  }

  return `import type { ReactNode } from "react";

interface PrimaryButtonProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  type?: "button" | "submit";
}

function PrimaryButton({
  children,
  className = "",
  onClick,
  type = "button",
}: PrimaryButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      className={\`inline-flex items-center justify-center rounded-2xl px-4 py-2.5 text-sm font-medium shadow-sm transition hover:opacity-90 \${className}\`}
    >
      {children}
    </button>
  );
}

export default PrimaryButton;
export { PrimaryButton };
`;
}

function buildSurfaceCardFile(template: TemplateDefinition): string {
  if (template.id === "interactive-tool") {
    return `import type { ReactNode } from "react";

interface SurfaceCardProps {
  children: ReactNode;
  className?: string;
  title?: string;
  eyebrow?: string;
}

function SurfaceCard({ children, className = "", title, eyebrow }: SurfaceCardProps) {
  return (
    <section className={\`rounded-xl border border-gray-700 bg-gray-900 p-4 \${className}\`}>
      {eyebrow ? (
        <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gray-500">
          {eyebrow}
        </div>
      ) : null}
      {title ? <h2 className="mt-2 text-lg font-semibold text-white">{title}</h2> : null}
      <div className={title || eyebrow ? "mt-3" : ""}>{children}</div>
    </section>
  );
}

export default SurfaceCard;
export { SurfaceCard };
`;
  }

  return `import type { ReactNode } from "react";

interface SurfaceCardProps {
  children: ReactNode;
  className?: string;
  title?: string;
  eyebrow?: string;
}

function SurfaceCard({ children, className = "", title, eyebrow }: SurfaceCardProps) {
  return (
    <section className={\`rounded-3xl border border-inherit bg-inherit p-5 shadow-sm \${className}\`}>
      {eyebrow ? (
        <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-inherit/60">
          {eyebrow}
        </div>
      ) : null}
      {title ? <h2 className="mt-2 text-xl font-semibold">{title}</h2> : null}
      <div className={title || eyebrow ? "mt-4" : ""}>{children}</div>
    </section>
  );
}

export default SurfaceCard;
export { SurfaceCard };
`;
}

function buildUtilsFile(): string {
  return `import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
`;
}

function buildAppShellFile(template: TemplateDefinition, projectName: string): string {
  if (template.id === "mobile-app") {
    return `import { useMemo, type ReactNode } from "react";
import { Bell, Menu, X } from "lucide-react";

import { generatedNavigation } from "@/generated/${template.id}/navigation";
import { generatedTheme } from "@/generated/${template.id}/theme";

interface AppShellProps {
  children: ReactNode;
  currentPath: string;
  title: string;
  subtitle?: string;
}

function AppShell({ children, currentPath, title, subtitle }: AppShellProps) {
  const bottomNav = useMemo(() => generatedNavigation.filter((item) => item.inPrimaryNav).slice(0, 5), []);

  return (
    <div className="mx-auto min-h-screen max-w-[390px] bg-slate-100 px-3 py-4">
      <div className="overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.16)]">
        <header className="flex items-center justify-between border-b border-slate-200 px-4 py-4">
          <button className="rounded-full border border-slate-200 p-2 text-slate-600" aria-label="Open menu">
            <Menu className="h-4 w-4" />
          </button>
          <div className="text-center">
            <div className="text-sm font-semibold text-slate-900">{title}</div>
            {subtitle ? <div className="text-xs text-slate-500">{subtitle}</div> : null}
          </div>
          <button className="rounded-full border border-slate-200 p-2 text-slate-600" aria-label="Notifications">
            <Bell className="h-4 w-4" />
          </button>
        </header>

        <main className="min-h-[640px] bg-slate-50 px-4 py-5">{children}</main>

        <nav className="grid grid-cols-3 border-t border-slate-200 bg-white px-2 py-2">
          {bottomNav.map((item) => {
            const isActive = item.href === currentPath;
            return (
              <button key={item.id} className={\`rounded-2xl px-2 py-2 text-xs font-medium \${isActive ? "bg-blue-50 text-blue-700" : "text-slate-500"}\`}>
                {item.label}
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

export default AppShell;
export { AppShell };
`;
  }

  if (template.id === "interactive-tool") {
    return `import { useMemo, type ReactNode } from "react";

import { generatedNavigation } from "@/generated/${template.id}/navigation";

interface AppShellProps {
  children: ReactNode;
  currentPath: string;
  title: string;
  subtitle?: string;
}

function AppShell({ children, currentPath, title, subtitle }: AppShellProps) {
  const primaryNav = useMemo(() => generatedNavigation.filter((item) => item.inPrimaryNav), []);

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="sticky top-0 z-40 border-b border-gray-800 bg-gray-900">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-3">
          <div className="text-base font-semibold">${projectName}</div>
          <nav className="flex items-center gap-1">
            {primaryNav.map((item) => (
              <span
                key={item.id}
                className={\`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors \${item.href === currentPath ? "bg-gray-800 text-white" : "text-gray-400 hover:text-white"}\`}
              >
                {item.label}
              </span>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-6 py-8">
        {subtitle ? <p className="mb-6 text-sm text-gray-400">{subtitle}</p> : null}
        {children}
      </main>
    </div>
  );
}

export default AppShell;
export { AppShell };
`;
  }

  if (template.shell === "website") {
    return `import { useMemo, useState, type ReactNode } from "react";
import { Menu, X } from "lucide-react";

import { generatedNavigation } from "@/generated/${template.id}/navigation";
import { generatedTheme } from "@/generated/${template.id}/theme";
import { PrimaryButton } from "@/components/generated/${template.id}/ui/PrimaryButton";

interface AppShellProps {
  children: ReactNode;
  currentPath: string;
  title: string;
  subtitle?: string;
}

function AppShell({ children, currentPath, title, subtitle }: AppShellProps) {
  const [open, setOpen] = useState(false);
  const primaryNav = useMemo(() => generatedNavigation.filter((item) => item.inPrimaryNav), []);

  return (
    <div className={\`min-h-screen \${generatedTheme.classes.background} \${generatedTheme.classes.surfaceText}\`}>
      <header className="sticky top-0 z-40 border-b border-white/10 bg-zinc-950/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <div className="text-lg font-semibold">${projectName}</div>
          </div>
          <nav className="hidden items-center gap-6 md:flex">
            {primaryNav.map((item) => (
              <span key={item.id} className={\`text-sm \${item.href === currentPath ? "text-white" : "text-zinc-400"}\`}>
                {item.label}
              </span>
            ))}
            <PrimaryButton className="bg-orange-500 text-black">Start Free Trial</PrimaryButton>
          </nav>
          <button className="rounded-full border border-white/10 p-2 md:hidden" onClick={() => setOpen((value) => !value)}>
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
        {open ? (
          <div className="border-t border-white/10 px-6 py-4 md:hidden">
            <div className="space-y-3">
              {primaryNav.map((item) => (
                <div key={item.id} className="text-sm text-zinc-200">{item.label}</div>
              ))}
            </div>
          </div>
        ) : null}
      </header>

      <main className="mx-auto flex min-h-[calc(100vh-72px)] max-w-6xl flex-col gap-8 px-6 py-8">
        {children}
      </main>
    </div>
  );
}

export default AppShell;
export { AppShell };
`;
  }

  return `import { useMemo, useState, type ReactNode } from "react";
import { Bell, Menu, Search, X } from "lucide-react";

import { generatedNavigation } from "@/generated/${template.id}/navigation";
import { generatedTheme } from "@/generated/${template.id}/theme";

interface AppShellProps {
  children: ReactNode;
  currentPath: string;
  title: string;
  subtitle?: string;
}

function AppShell({ children, currentPath, title, subtitle }: AppShellProps) {
  const [open, setOpen] = useState(false);
  const primaryNav = useMemo(() => generatedNavigation.filter((item) => item.inPrimaryNav), []);

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="flex min-h-screen">
        <aside className="hidden w-64 flex-col border-r border-slate-200 bg-white px-4 py-5 lg:flex">
          <div>
            <div className="mt-2 text-2xl font-semibold text-slate-900">${projectName}</div>
          </div>
          <nav className="mt-8 space-y-2">
            {primaryNav.map((item) => {
              const isActive = item.href === currentPath;
              return (
                <div key={item.id} className={\`rounded-2xl px-3 py-2.5 text-sm font-medium \${isActive ? "bg-blue-50 text-blue-700" : "text-slate-600"}\`}>
                  {item.label}
                </div>
              );
            })}
          </nav>
          <div className="mt-auto rounded-3xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-sm font-semibold text-slate-900">Sarah Chen</div>
            <div className="text-xs text-slate-500">Team Lead</div>
          </div>
        </aside>

        <div className="flex min-h-screen flex-1 flex-col">
          <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
            <div className="flex items-center gap-3 px-4 py-4 lg:px-6">
              <button className="rounded-2xl border border-slate-200 p-2 text-slate-600 lg:hidden" onClick={() => setOpen(true)}>
                <Menu className="h-4 w-4" />
              </button>
              <div className="min-w-0 flex-1">
                <div className="text-lg font-semibold text-slate-900">{title}</div>
                {subtitle ? <div className="text-sm text-slate-500">{subtitle}</div> : null}
              </div>
              <div className="hidden items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 md:flex">
                <Search className="h-4 w-4 text-slate-400" />
                <span className="text-sm text-slate-400">Search</span>
              </div>
              <button className="rounded-2xl border border-slate-200 p-2 text-slate-600">
                <Bell className="h-4 w-4" />
              </button>
            </div>
          </header>

          {open ? (
            <div className="fixed inset-0 z-40 bg-slate-950/40 lg:hidden" onClick={() => setOpen(false)}>
              <div className="h-full w-72 bg-white px-4 py-5" onClick={(event) => event.stopPropagation()}>
                <div className="flex items-center justify-between">
                  <div className="text-lg font-semibold text-slate-900">${projectName}</div>
                  <button className="rounded-2xl border border-slate-200 p-2 text-slate-600" onClick={() => setOpen(false)}>
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-6 space-y-2">
                  {primaryNav.map((item) => (
                    <div key={item.id} className="rounded-2xl px-3 py-2.5 text-sm text-slate-700">{item.label}</div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          <main className="flex-1 px-4 py-5 lg:px-6">{children}</main>
        </div>
      </div>
    </div>
  );
}

export default AppShell;
export { AppShell };
`;
}

export function buildGeneratedScaffoldFiles(input: {
  project: Pick<Project, "name">;
  template: TemplateDefinition;
}): readonly StudioFile[] {
  const manifest = buildGeneratedManifest(input.template);

  return [
    {
      content: `${serialize(manifest)}\n`,
      kind: "config",
      language: "json",
      locked: false,
      path: buildGeneratedManifestPath(input.template.id),
      source: "platform",
    },
    {
      content: buildThemeFile(input.template).trim(),
      kind: "config",
      language: "ts",
      locked: false,
      path: buildGeneratedThemeFilePath(input.template.id),
      source: "platform",
    },
    {
      content: buildNavigationFile(input.template, manifest).trim(),
      kind: "config",
      language: "ts",
      locked: false,
      path: buildGeneratedNavigationFilePath(input.template.id),
      source: "platform",
    },
    {
      content: buildDataFile(input.template, input.project.name).trim(),
      kind: "data",
      language: "ts",
      locked: false,
      path: buildGeneratedDataFilePath(input.template.id),
      source: "platform",
    },
    {
      content: buildUtilsFile().trim(),
      kind: "component",
      language: "ts",
      locked: false,
      path: buildGeneratedUtilsPath(),
      source: "platform",
    },
    {
      content: buildAppShellFile(input.template, input.project.name).trim(),
      kind: "layout",
      language: "tsx",
      locked: false,
      path: buildGeneratedAppShellPath(input.template.id),
      source: "platform",
    },
    {
      content: buildPrimaryButtonFile(input.template).trim(),
      kind: "component",
      language: "tsx",
      locked: false,
      path: buildGeneratedUiComponentPath(input.template.id, "PrimaryButton"),
      source: "platform",
    },
    {
      content: buildSurfaceCardFile(input.template).trim(),
      kind: "component",
      language: "tsx",
      locked: false,
      path: buildGeneratedUiComponentPath(input.template.id, "SurfaceCard"),
      source: "platform",
    },
  ];
}

export function buildScaffoldPromptBlock(template: TemplateDefinition): string {
  return [
    "Shared generated scaffold files already exist and MUST be reused:",
    `- Theme: @/generated/${template.id}/theme`,
    `- Navigation: @/generated/${template.id}/navigation`,
    `- Data: @/generated/${template.id}/data`,
    `- Route manifest JSON: @/generated/${template.id}/app.manifest.json`,
    "- Utility helpers: @/lib/utils (exports cn for className composition)",
    `- App shell: @/components/generated/${template.id}/AppShell`,
    `- Primary button: @/components/generated/${template.id}/ui/PrimaryButton`,
    `- Surface card: @/components/generated/${template.id}/ui/SurfaceCard`,
    "Route files must import AppShell with a default import and keep only route-specific content inside it.",
    "If you need className composition, import cn from @/lib/utils instead of redefining helper utilities.",
    "Do not recreate sidebar, topbar, footer navigation, mobile drawer, or bottom tab chrome inside a route file.",
    "Use the shared scaffold for theme, navigation, and repeated UI instead of redefining those patterns in every page.",
  ].join("\n");
}
