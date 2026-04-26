import { useState, useEffect, useMemo } from "react";
import { Link, Outlet, useMatchRoute } from "@tanstack/react-router";
import {
  FolderOpen,
  Image,
  Bot,
  Settings,
  Menu,
  X,
  Lock,
  Gift,
} from "lucide-react";
import { cn } from "../../../lib/cn";
import { GlobalNav } from "../../../components/layout/GlobalNav";
import { OnboardingModal } from "../../../components/OnboardingModal";
import { getApiBaseUrl, getAccessToken, type UserProfile } from "../../../lib/api";
import { useAuth } from "../../../lib/useAuth";
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

import type { ForwardRefExoticComponent, RefAttributes } from "react";
import type { LucideProps } from "lucide-react";

interface NavItem {
  to: string;
  label: string;
  icon: ForwardRefExoticComponent<Omit<LucideProps, "ref"> & RefAttributes<SVGSVGElement>>;
  locked: boolean;
  activeFor?: string;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/studio/home", label: "Projects", icon: FolderOpen, locked: false },
  { to: "/studio/images", label: "Images", icon: Image, locked: true },
  { to: "/studio/agents", label: "Agents", icon: Bot, locked: true },
  { to: "/studio/settings/profile", label: "Settings", icon: Settings, locked: false, activeFor: "/studio/settings" },
  { to: "/studio/settings/referrals", label: "Referrals", icon: Gift, locked: false },
];

export function StudioLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingUser, setOnboardingUser] = useState<UserProfile | null>(null);
  const matchRoute = useMatchRoute();
  const { session } = useAuth();

  // Pull Google OAuth metadata so the onboarding form pre-fills name + avatar
  // even when the API row hasn't been backfilled yet (e.g. fresh signup or
  // the Google profile metadata wasn't propagated to the DB users row).
  const googleProfile = useMemo(() => {
    const meta = (session?.user?.user_metadata ?? null) as Record<string, unknown> | null;
    const name = typeof meta?.full_name === "string" && meta.full_name.trim().length > 0
      ? meta.full_name.trim()
      : typeof meta?.name === "string" && meta.name.trim().length > 0
        ? meta.name.trim()
        : null;
    const avatar = typeof meta?.avatar_url === "string" && meta.avatar_url.trim().length > 0
      ? meta.avatar_url.trim()
      : typeof meta?.picture === "string" && meta.picture.trim().length > 0
        ? meta.picture.trim()
        : null;
    return { name, avatar };
  }, [session]);

  useEffect(() => {
    // studioRoute.beforeLoad in router.ts already guards this component behind
    // a confirmed Supabase session, so getAccessToken() is safe to call here.
    // The /me middleware bootstraps the user row on first call, so we can
    // fetch immediately — no upfront delay needed. fetchMeWithRetry already
    // covers the brief 401 window with a single 800ms retry.
    fetchMeWithRetry()
      .then((data) => {
        if (!data) return;
        const showModal =
          data.onboarding_completed === false ||
          data.onboarding_completed === null ||
          data.onboarding_completed === undefined;
        if (showModal) {
          setOnboardingUser(data);
          setShowOnboarding(true);
        }
      })
      .catch(() => {
        // Silently ignore — user may not have migration yet
      });
  }, []);

  // Hide sidebar on builder pages — they have their own TopBar + layout
  const isProjectPage = !!matchRoute({ to: "/studio/project/$id", fuzzy: true });
  const isVersionPreviewPage = !!matchRoute({ to: "/studio/version-preview", fuzzy: true });
  // Onboarding modal must only appear on the home dashboard
  const isHomePage = !!matchRoute({ to: "/studio/home", fuzzy: true });

  if (isProjectPage || isVersionPreviewPage) {
    return (
      <div className="flex h-screen flex-col">
        <main className="flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>
    );
  }

  return (
    <>
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
            <BeomzLogo className="h-6 w-auto text-[#1a1a1a]" />
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
            const active = matchRoute({ to: item.activeFor ?? item.to, fuzzy: true });
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
    {showOnboarding && isHomePage && (
      <OnboardingModal
        initialName={onboardingUser?.full_name ?? googleProfile.name ?? null}
        initialAvatarUrl={onboardingUser?.avatar_url ?? googleProfile.avatar ?? null}
        onClose={() => setShowOnboarding(false)}
      />
    )}
    </>
  );
}
