import type { ReactNode } from "react";
import type { KernelNavItem } from "../nav/navRegistry.js";

export type ShellVariant = "app" | "website" | "dashboard" | "workspace";

export interface AppShellProps {
  variant?: ShellVariant;
  brand?: ReactNode;
  title?: ReactNode;
  subtitle?: ReactNode;
  navigation?: readonly KernelNavItem[];
  headerActions?: ReactNode;
  aside?: ReactNode;
  secondaryPanel?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}

const containerByVariant: Record<ShellVariant, string> = {
  app: "min-h-screen bg-zinc-950 text-white",
  website: "min-h-screen bg-zinc-950 text-white",
  dashboard: "min-h-screen bg-zinc-950 text-white",
  workspace: "min-h-screen bg-zinc-950 text-white",
};

export function AppShell({
  variant = "app",
  brand = "Beomz Studio",
  title,
  subtitle,
  navigation = [],
  headerActions,
  aside,
  secondaryPanel,
  footer,
  children,
}: AppShellProps) {
  const isWebsite = variant === "website";

  return (
    <div className={containerByVariant[variant]} data-shell={variant}>
      <header className="border-b border-white/10 bg-white/5 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl items-center gap-4 px-6 py-4">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold uppercase tracking-[0.24em] text-orange-300">
              {brand}
            </div>
            {title ? <div className="mt-1 text-2xl font-semibold text-white">{title}</div> : null}
            {subtitle ? <div className="mt-1 text-sm text-white/60">{subtitle}</div> : null}
          </div>

          {isWebsite && navigation.length > 0 ? (
            <nav className="hidden items-center gap-4 md:flex">
              {navigation.map((item) => (
                <a key={item.id} href={item.href} className="text-sm text-white/70 transition hover:text-white">
                  {item.label}
                </a>
              ))}
            </nav>
          ) : null}

          {headerActions ? <div className="shrink-0">{headerActions}</div> : null}
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl flex-1 gap-6 px-6 py-6">
        {!isWebsite && navigation.length > 0 ? (
          <aside className="hidden w-64 shrink-0 rounded-2xl border border-white/10 bg-white/5 p-4 lg:block">
            <nav className="space-y-2">
              {navigation.map((item) => (
                <a
                  key={item.id}
                  href={item.href}
                  className="block rounded-xl px-3 py-2 text-sm text-white/70 transition hover:bg-white/5 hover:text-white"
                >
                  {item.label}
                </a>
              ))}
            </nav>
            {aside ? <div className="mt-6">{aside}</div> : null}
          </aside>
        ) : null}

        <main className="min-h-[32rem] min-w-0 flex-1 rounded-3xl border border-white/10 bg-black/30 p-6">
          {children}
        </main>

        {secondaryPanel ? (
          <aside className="hidden w-80 shrink-0 rounded-2xl border border-white/10 bg-white/5 p-4 xl:block">
            {secondaryPanel}
          </aside>
        ) : null}
      </div>

      {footer ? <footer className="border-t border-white/10 px-6 py-4 text-sm text-white/50">{footer}</footer> : null}
    </div>
  );
}
