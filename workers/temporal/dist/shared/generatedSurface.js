import { DEFAULT_COLOR_PALETTE, buildGeneratedAppShellPath, buildGeneratedDataFilePath, buildGeneratedManifest, buildGeneratedManifestPath, buildGeneratedNavigationFilePath, buildGeneratedThemeFilePath, buildGeneratedUiComponentPath, buildGeneratedUtilsPath, } from "@beomz-studio/contracts";
function serialize(value) {
    return JSON.stringify(value, null, 2);
}
function withHexAlpha(hex, alpha) {
    return `${hex}${alpha}`;
}
function iconForPage(page) {
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
function buildThemeFile(template, colorPalette) {
    const shellPalette = {
        accent: colorPalette.accent,
        accentSoft: `bg-[${withHexAlpha(colorPalette.accent, "1A")}] text-[${colorPalette.accent}]`,
        background: `bg-[${colorPalette.background}]`,
        border: `border-[${withHexAlpha(colorPalette.accent, "26")}]`,
        card: "bg-white/[0.06]",
        input: `border border-[${withHexAlpha(colorPalette.accent, "26")}] bg-black/20 text-white placeholder:text-white/40`,
        muted: "text-white/70",
        panel: "bg-white/[0.05]",
        surfaceText: "text-white",
    };
    return `export const generatedTheme = {
  colors: {
    primary: ${serialize(colorPalette.primary)},
    accent: ${serialize(shellPalette.accent)},
    background: ${serialize(colorPalette.background)},
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
  palette: ${serialize({
        bestFor: colorPalette.bestFor,
        id: colorPalette.id,
        label: colorPalette.label,
    })},
  shell: ${serialize(template.shell)},
  templateId: ${serialize(template.id)},
} as const;

export type GeneratedTheme = typeof generatedTheme;
`;
}
function buildNavigationFile(template, manifest) {
    const items = manifest.routes.map((route, index) => ({
        ...route,
        icon: iconForPage(template.pages[index] ?? template.pages[0]),
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
function buildDataFile(template, projectName) {
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
    const domainSpecific = template.id === "ecommerce"
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
function buildPrimaryButtonFile(template, colorPalette) {
    const shadowColor = withHexAlpha(colorPalette.primary, "33");
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
      style={{ backgroundColor: "${colorPalette.primary}", boxShadow: "0 18px 40px ${shadowColor}", color: "#FFFFFF" }}
      className={\`inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition hover:opacity-90 \${className}\`}
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
      style={{ backgroundColor: "${colorPalette.primary}", boxShadow: "0 18px 40px ${shadowColor}", color: "#FFFFFF" }}
      className={\`inline-flex items-center justify-center rounded-2xl px-4 py-2.5 text-sm font-medium transition hover:opacity-90 \${className}\`}
    >
      {children}
    </button>
  );
}

export default PrimaryButton;
export { PrimaryButton };
`;
}
function buildSurfaceCardFile(template, colorPalette) {
    const borderColor = withHexAlpha(colorPalette.accent, "33");
    const cardBackground = withHexAlpha("#FFFFFF", template.id === "interactive-tool" ? "08" : "06");
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
    <section
      style={{ backgroundColor: "${cardBackground}", borderColor: "${borderColor}" }}
      className={\`rounded-xl border p-6 text-white shadow-[0_24px_60px_rgba(15,23,42,0.24)] \${className}\`}
    >
      {eyebrow ? (
        <div className="text-[11px] font-semibold uppercase tracking-[0.22em]" style={{ color: "${colorPalette.accent}" }}>
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
    <section
      style={{ backgroundColor: "${cardBackground}", borderColor: "${borderColor}" }}
      className={\`rounded-3xl border p-5 text-white shadow-[0_24px_60px_rgba(15,23,42,0.18)] \${className}\`}
    >
      {eyebrow ? (
        <div className="text-[11px] font-semibold uppercase tracking-[0.22em]" style={{ color: "${colorPalette.accent}" }}>
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
function buildUtilsFile() {
    return `import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
`;
}
function buildAppShellFile(template, projectName, colorPalette) {
    const borderColor = withHexAlpha(colorPalette.accent, "26");
    const borderStrongColor = withHexAlpha(colorPalette.accent, "33");
    const activeBackground = withHexAlpha(colorPalette.primary, "22");
    const panelBackground = withHexAlpha("#FFFFFF", "06");
    const panelBackgroundStrong = withHexAlpha("#FFFFFF", "08");
    const mutedText = withHexAlpha("#FFFFFF", "B3");
    const subtleText = withHexAlpha("#FFFFFF", "80");
    if (template.id === "mobile-app") {
        return `import { useMemo, type ReactNode } from "react";
import { Bell, Menu, X } from "lucide-react";

import { generatedNavigation } from "@/generated/${template.id}/navigation";

interface AppShellProps {
  children: ReactNode;
  currentPath: string;
  title: string;
  subtitle?: string;
}

function AppShell({ children, currentPath, title, subtitle }: AppShellProps) {
  const bottomNav = useMemo(() => generatedNavigation.filter((item) => item.inPrimaryNav).slice(0, 5), []);

  return (
    <div className="mx-auto min-h-screen max-w-[390px] px-3 py-4 text-white" style={{ backgroundColor: "${colorPalette.background}" }}>
      <div
        style={{ backgroundColor: "${panelBackgroundStrong}", borderColor: "${borderColor}" }}
        className="overflow-hidden rounded-[32px] border shadow-[0_30px_80px_rgba(15,23,42,0.32)]"
      >
        <header className="flex items-center justify-between border-b px-4 py-4" style={{ borderColor: "${borderColor}" }}>
          <button
            className="rounded-full border p-2"
            style={{ backgroundColor: "${panelBackground}", borderColor: "${borderColor}", color: "${mutedText}" }}
            aria-label="Open menu"
          >
            <Menu className="h-4 w-4" />
          </button>
          <div className="text-center">
            <div className="text-sm font-semibold text-white">{title}</div>
            {subtitle ? <div className="text-xs" style={{ color: "${subtleText}" }}>{subtitle}</div> : null}
          </div>
          <button
            className="rounded-full border p-2"
            style={{ backgroundColor: "${panelBackground}", borderColor: "${borderColor}", color: "${mutedText}" }}
            aria-label="Notifications"
          >
            <Bell className="h-4 w-4" />
          </button>
        </header>

        <main className="min-h-[640px] px-4 py-5" style={{ backgroundColor: "${withHexAlpha(colorPalette.background, "D9")}" }}>{children}</main>

        <nav className="grid grid-cols-3 border-t px-2 py-2" style={{ backgroundColor: "${panelBackgroundStrong}", borderColor: "${borderColor}" }}>
          {bottomNav.map((item) => {
            const isActive = item.href === currentPath;
            return (
              <button
                key={item.id}
                style={isActive ? { backgroundColor: "${activeBackground}", color: "${colorPalette.accent}" } : { color: "${mutedText}" }}
                className="rounded-2xl px-2 py-2 text-xs font-medium"
              >
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
    <div className="min-h-screen text-white" style={{ backgroundColor: "${colorPalette.background}" }}>
      <header className="sticky top-0 z-40 border-b" style={{ backgroundColor: "${withHexAlpha(colorPalette.background, "ED")}", borderColor: "${borderColor}" }}>
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-3">
          <div className="text-base font-semibold">${projectName}</div>
          <nav className="flex items-center gap-1">
            {primaryNav.map((item) => (
              <a
                key={item.id}
                href={item.href}
                style={item.href === currentPath ? { backgroundColor: "${activeBackground}", color: "${colorPalette.accent}" } : { color: "${mutedText}" }}
                className="rounded-lg px-3 py-1.5 text-sm font-medium no-underline transition hover:opacity-90"
              >
                {item.label}
              </a>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-6 py-8">
        {subtitle ? <p className="mb-6 text-sm" style={{ color: "${subtleText}" }}>{subtitle}</p> : null}
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
    <div className="min-h-screen text-white" style={{ backgroundColor: "${colorPalette.background}" }}>
      <header className="sticky top-0 z-40 border-b backdrop-blur" style={{ backgroundColor: "${withHexAlpha(colorPalette.background, "D9")}", borderColor: "${borderColor}" }}>
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <div className="text-lg font-semibold">${projectName}</div>
          </div>
          <nav className="hidden items-center gap-6 md:flex">
            {primaryNav.map((item) => (
              <a
                key={item.id}
                href={item.href}
                style={item.href === currentPath ? { color: "${colorPalette.accent}" } : { color: "${mutedText}" }}
                className="text-sm no-underline transition hover:opacity-90"
              >
                {item.label}
              </a>
            ))}
            <PrimaryButton>Start Free Trial</PrimaryButton>
          </nav>
          <button className="rounded-full border p-2 md:hidden" style={{ borderColor: "${borderColor}", backgroundColor: "${panelBackground}" }} onClick={() => setOpen((value) => !value)}>
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
        {open ? (
          <div className="border-t px-6 py-4 md:hidden" style={{ borderColor: "${borderColor}" }}>
            <div className="space-y-3">
              {primaryNav.map((item) => (
                <div key={item.id} className="text-sm" style={{ color: "${mutedText}" }}>{item.label}</div>
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
    <div className="min-h-screen text-white" style={{ backgroundColor: "${colorPalette.background}" }}>
      <div className="flex min-h-screen">
        <aside className="hidden w-64 flex-col border-r px-4 py-5 lg:flex" style={{ borderColor: "${borderColor}", backgroundColor: "${panelBackgroundStrong}" }}>
          <div>
            <div className="mt-2 text-2xl font-semibold text-white">${projectName}</div>
          </div>
          <nav className="mt-8 space-y-2">
            {primaryNav.map((item) => {
              const isActive = item.href === currentPath;
              return (
                <div
                  key={item.id}
                  style={isActive ? { backgroundColor: "${activeBackground}", color: "${colorPalette.accent}" } : { color: "${mutedText}" }}
                  className="rounded-2xl px-3 py-2.5 text-sm font-medium"
                >
                  {item.label}
                </div>
              );
            })}
          </nav>
          <div className="mt-auto rounded-3xl border p-4" style={{ borderColor: "${borderStrongColor}", backgroundColor: "${panelBackground}" }}>
            <div className="text-sm font-semibold text-white">Sarah Chen</div>
            <div className="text-xs" style={{ color: "${subtleText}" }}>Team Lead</div>
          </div>
        </aside>

        <div className="flex min-h-screen flex-1 flex-col">
          <header className="sticky top-0 z-30 border-b backdrop-blur" style={{ borderColor: "${borderColor}", backgroundColor: "${withHexAlpha(colorPalette.background, "E6")}" }}>
            <div className="flex items-center gap-3 px-4 py-4 lg:px-6">
              <button className="rounded-2xl border p-2 lg:hidden" style={{ borderColor: "${borderColor}", color: "${mutedText}" }} onClick={() => setOpen(true)}>
                <Menu className="h-4 w-4" />
              </button>
              <div className="min-w-0 flex-1">
                <div className="text-lg font-semibold text-white">{title}</div>
                {subtitle ? <div className="text-sm" style={{ color: "${subtleText}" }}>{subtitle}</div> : null}
              </div>
              <div className="hidden items-center gap-2 rounded-2xl border px-3 py-2 md:flex" style={{ borderColor: "${borderColor}", backgroundColor: "${panelBackground}" }}>
                <Search className="h-4 w-4" style={{ color: "${subtleText}" }} />
                <span className="text-sm" style={{ color: "${subtleText}" }}>Search</span>
              </div>
              <button className="rounded-2xl border p-2" style={{ borderColor: "${borderColor}", color: "${mutedText}" }}>
                <Bell className="h-4 w-4" />
              </button>
            </div>
          </header>

          {open ? (
            <div className="fixed inset-0 z-40 bg-slate-950/60 lg:hidden" onClick={() => setOpen(false)}>
              <div className="h-full w-72 px-4 py-5" style={{ backgroundColor: "${withHexAlpha(colorPalette.background, "FA")}" }} onClick={(event) => event.stopPropagation()}>
                <div className="flex items-center justify-between">
                  <div className="text-lg font-semibold text-white">${projectName}</div>
                  <button className="rounded-2xl border p-2" style={{ borderColor: "${borderColor}", color: "${mutedText}" }} onClick={() => setOpen(false)}>
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-6 space-y-2">
                  {primaryNav.map((item) => (
                    <div key={item.id} className="rounded-2xl px-3 py-2.5 text-sm" style={{ color: "${mutedText}" }}>{item.label}</div>
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
export function buildGeneratedScaffoldFiles(input) {
    const colorPalette = input.colorPalette ?? DEFAULT_COLOR_PALETTE;
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
            content: buildThemeFile(input.template, colorPalette).trim(),
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
            content: buildAppShellFile(input.template, input.project.name, colorPalette).trim(),
            kind: "layout",
            language: "tsx",
            locked: false,
            path: buildGeneratedAppShellPath(input.template.id),
            source: "platform",
        },
        {
            content: buildPrimaryButtonFile(input.template, colorPalette).trim(),
            kind: "component",
            language: "tsx",
            locked: false,
            path: buildGeneratedUiComponentPath(input.template.id, "PrimaryButton"),
            source: "platform",
        },
        {
            content: buildSurfaceCardFile(input.template, colorPalette).trim(),
            kind: "component",
            language: "tsx",
            locked: false,
            path: buildGeneratedUiComponentPath(input.template.id, "SurfaceCard"),
            source: "platform",
        },
    ];
}
function buildPaletteHint(colorPalette) {
    return `selected palette: ${colorPalette.id} (${colorPalette.label}) — primary ${colorPalette.primary}, accent ${colorPalette.accent}, background ${colorPalette.background}; best for ${colorPalette.bestFor}.`;
}
export function buildScaffoldPromptBlock(template, colorPalette = DEFAULT_COLOR_PALETTE) {
    return [
        "Shared generated scaffold files already exist and MUST be reused:",
        `- Theme: @/generated/${template.id}/theme (${buildPaletteHint(colorPalette)})`,
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
        `Use the selected palette throughout the route: primary ${colorPalette.primary}, accent ${colorPalette.accent}, background ${colorPalette.background}.`,
        "Use the accent color specified in the Theme hint above for buttons, active nav items, badges, and highlights — do not hardcode a different accent color.",
    ].join("\n");
}
