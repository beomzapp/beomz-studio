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
import { GlobalNav } from "../../../components/layout/GlobalNav";
import { CreditsProvider } from "../../../lib/CreditsContext";
import BeomzLogo from "../../../assets/beomz-logo.svg?react";

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
      <CreditsProvider>
        <div className="flex h-screen flex-col">
          <main className="flex-1 overflow-hidden">
            <Outlet />
          </main>
        </div>
      </CreditsProvider>
    );
  }

  return (
    <CreditsProvider>
    <div className="flex h-screen bg-[#faf9f6]">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar — light cream theme */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-[#e5e5e5] bg-white transition-transform lg:static lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-14 items-center justify-between border-b border-[#e5e5e5] px-4">
          <Link to="/" className="flex items-center gap-2">
            <BeomzLogo className="h-6 w-auto text-[#F97316]" />
          </Link>
          <button
            onClick={() => setSidebarOpen(false)}
            className="text-[#9ca3af] hover:text-[#1a1a1a] lg:hidden"
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
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-[#F97316]/10 text-[#F97316]"
                    : "text-[#6b7280] hover:bg-[#f3f4f6] hover:text-[#1a1a1a]"
                )}
              >
                <item.icon size={18} />
                {item.label}
                {item.locked && (
                  <Lock size={12} className="ml-auto text-[#d1d5db]" />
                )}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile header */}
        <header className="flex h-14 items-center justify-between border-b border-[#e5e5e5] bg-white px-4 lg:hidden">
          <div className="flex items-center">
            <button
              onClick={() => setSidebarOpen(true)}
              className="text-[#6b7280] hover:text-[#1a1a1a]"
            >
              <Menu size={20} />
            </button>
            <BeomzLogo className="ml-3 h-5 w-auto text-[#F97316]" />
          </div>
          <GlobalNav />
        </header>

        {/* Desktop header — credits + avatar */}
        <header className="hidden h-14 items-center justify-end border-b border-[#e5e5e5] bg-white px-4 lg:flex">
          <GlobalNav />
        </header>

        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
    </CreditsProvider>
  );
}
