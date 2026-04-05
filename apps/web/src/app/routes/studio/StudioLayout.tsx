import { useState } from "react";
import { Link, Outlet, useMatchRoute } from "@tanstack/react-router";
import {
  FolderOpen,
  Image,
  Bot,
  Settings,
  Menu,
  X,
  Lock,
} from "lucide-react";
import { cn } from "../../../lib/cn";

const NAV_ITEMS = [
  { to: "/studio/home", label: "Projects", icon: FolderOpen, locked: false },
  { to: "/studio/images", label: "Images", icon: Image, locked: true },
  { to: "/studio/agents", label: "Agents", icon: Bot, locked: true },
  { to: "/studio/settings", label: "Settings", icon: Settings, locked: false },
] as const;

export function StudioLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const matchRoute = useMatchRoute();

  // Hide sidebar on builder pages — they have their own TopBar + layout
  const isProjectPage = !!matchRoute({ to: "/studio/project/$id", fuzzy: true });

  if (isProjectPage) {
    return (
      <div className="flex h-screen flex-col">
        <main className="flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-bg">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-border bg-bg-sidebar transition-transform lg:static lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-14 items-center justify-between border-b border-border px-4">
          <Link to="/" className="text-lg font-bold text-white">
            beomz<span className="text-orange">.ai</span>
          </Link>
          <button
            onClick={() => setSidebarOpen(false)}
            className="text-white/40 hover:text-white lg:hidden"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {NAV_ITEMS.map((item) => {
            const active = matchRoute({ to: item.to, fuzzy: true });
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-white/10 text-white"
                    : "text-white/50 hover:bg-white/5 hover:text-white/80"
                )}
              >
                <item.icon size={18} />
                {item.label}
                {item.locked && (
                  <Lock size={12} className="ml-auto text-white/20" />
                )}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile header */}
        <header className="flex h-14 items-center border-b border-border px-4 lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-white/60 hover:text-white"
          >
            <Menu size={20} />
          </button>
          <span className="ml-3 text-sm font-semibold text-white">
            beomz<span className="text-orange">.ai</span> Studio
          </span>
        </header>

        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
