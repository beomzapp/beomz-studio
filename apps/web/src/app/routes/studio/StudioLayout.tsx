import { useState, useEffect } from "react";
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
import { OnboardingModal } from "../../../components/OnboardingModal";
import { getApiBaseUrl, getAccessToken, type UserProfile } from "../../../lib/api";
import BeomzLogo from "../../../assets/beomz-logo.svg?react";

/**
 * Fetch /api/me without triggering signOutAndRedirectToLogin on 401.
 * Returns null on 401 (user record still bootstrapping after fresh OAuth)
 * so the caller can retry.
 */
async function fetchMeRaw(): Promise<UserProfile | null> {
  const token = await getAccessToken();
  const res = await fetch(`${getApiBaseUrl()}/me`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`GET /me failed with ${res.status}`);
  return res.json() as Promise<UserProfile>;
}

/**
 * Retry once after 800 ms if the first attempt returns 401. This covers the
 * window between fresh OAuth and the API bootstrapping the user record.
 */
async function fetchMeWithRetry(): Promise<UserProfile | null> {
  const first = await fetchMeRaw();
  if (first !== null) return first;
  await new Promise<void>((r) => setTimeout(r, 800));
  return fetchMeRaw().catch(() => null);
}

const NAV_ITEMS = [
  { to: "/studio/home", label: "Projects", icon: FolderOpen, locked: false },
  { to: "/studio/images", label: "Images", icon: Image, locked: true },
  { to: "/studio/agents", label: "Agents", icon: Bot, locked: true },
  { to: "/studio/settings", label: "Settings", icon: Settings, locked: false },
] as const;

export function StudioLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const matchRoute = useMatchRoute();

  useEffect(() => {
    // studioRoute.beforeLoad in router.ts already guards this component behind
    // a confirmed Supabase session, so getAccessToken() is safe to call here.
    // 1s delay ensures the DB upsert has completed before we check.
    const timer = setTimeout(() => {
      fetchMeWithRetry()
        .then((data) => {
          if (!data) return;
          console.log('[onboarding] GET /api/me response:', JSON.stringify(data));
          const showModal =
            data.onboarding_completed === false ||
            data.onboarding_completed === null ||
            data.onboarding_completed === undefined;
          console.log('[onboarding] will show modal:', showModal);
          if (showModal) {
            setShowOnboarding(true);
          }
        })
        .catch(() => {
          // Silently ignore — user may not have migration yet
        });
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

  // Hide sidebar on builder pages — they have their own TopBar + layout
  const isProjectPage = !!matchRoute({ to: "/studio/project/$id", fuzzy: true });
  const isVersionPreviewPage = !!matchRoute({ to: "/studio/version-preview", fuzzy: true });

  if (isProjectPage || isVersionPreviewPage) {
    return (
      <CreditsProvider>
        <div className="flex h-screen flex-col">
          <main className="flex-1 overflow-hidden">
            <Outlet />
          </main>
        </div>
        {showOnboarding && (
          <OnboardingModal onClose={() => setShowOnboarding(false)} />
        )}
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
    {showOnboarding && (
      <OnboardingModal onClose={() => setShowOnboarding(false)} />
    )}
    </CreditsProvider>
  );
}
