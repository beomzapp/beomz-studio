/**
 * GlobalNav — credits pill + user avatar with dropdown.
 * Used across all authenticated screens: TopBar, StudioLayout, and landing/plan pages.
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { Link } from "@tanstack/react-router";
import { LogOut, Settings, LayoutDashboard, AlertTriangle, UserCircle, Zap } from "lucide-react";
import { useAuth } from "../../lib/useAuth";
import { useCredits } from "../../lib/CreditsContext";
import { supabase } from "../../lib/supabase";
import { getApiBaseUrl } from "../../lib/api";
import { CreditBar } from "../CreditBar";
import { usePricingModal } from "../../contexts/PricingModalContext";

interface GlobalNavProps {
  /** When true, uses light text (for dark backgrounds like landing page). Default false (dark text). */
  variant?: "light" | "dark";
}

export function GlobalNav({ variant = "dark" }: GlobalNavProps) {
  const { session } = useAuth();
  const { credits } = useCredits();
  const { openPricingModal } = usePricingModal();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [avatarError, setAvatarError] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [dropdownOpen]);

  const handleSignOut = useCallback(async () => {
    setDropdownOpen(false);
    await supabase.auth.signOut();
  }, []);

  if (!session) return null;

  const user = session.user;
  const rawAvatarUrl = user?.user_metadata?.avatar_url as string | undefined;
  // Proxy Google avatars through our API to avoid COEP blocking
  const avatarUrl = rawAvatarUrl?.includes("googleusercontent.com")
    ? `${getApiBaseUrl()}/avatar?url=${encodeURIComponent(rawAvatarUrl)}`
    : rawAvatarUrl;
  const fullName =
    (user?.user_metadata?.full_name as string | undefined)
    ?? (user?.user_metadata?.name as string | undefined)
    ?? user?.email
    ?? "";
  const initials = fullName
    .split(" ")
    .slice(0, 2)
    .map((n: string) => n[0]?.toUpperCase() ?? "")
    .join("");

  const isLight = variant === "light";

  const plan = credits?.plan ?? null;

  return (
    <div className="flex items-center gap-3">
      {/* Plan badge — shown when credits are loaded */}
      {plan && <PlanBadge plan={plan} isLight={isLight} onUpgrade={openPricingModal} />}

      {/* BEO-346: Credit bar — mini segmented bar + balance + hover popover */}
      {credits ? (
        <CreditPill
          credits={credits}
          isLight={isLight}
          onUpgrade={openPricingModal}
        />
      ) : (
        <span
          className={
            isLight
              ? "rounded-full border border-white/10 px-2.5 py-1 font-mono text-xs text-white/40"
              : "rounded-full border border-[#e5e5e5] px-2.5 py-1 font-mono text-xs text-[#6b7280]"
          }
        >
          &#9889; &mdash;
        </span>
      )}

      {/* Avatar + dropdown */}
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setDropdownOpen((v) => !v)}
          className="flex items-center gap-2"
        >
          {avatarUrl && !avatarError ? (
            <img
              src={avatarUrl}
              alt="Avatar"
              className="h-8 w-8 rounded-full object-cover"
              referrerPolicy="no-referrer"
              onError={() => setAvatarError(true)}
            />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#F97316] text-xs font-bold text-white">
              {initials || "U"}
            </div>
          )}
        </button>

        {/* Dropdown */}
        {dropdownOpen && (
          <div className="absolute right-0 top-10 z-50 w-48 rounded-xl border border-[#e5e5e5] bg-white py-1.5 shadow-lg">
            {/* User info */}
            <div className="border-b border-[#e5e5e5] px-4 py-2">
              <p className="truncate text-sm font-medium text-[#1a1a1a]">{fullName}</p>
              {user?.email && fullName !== user.email && (
                <p className="truncate text-xs text-[#9ca3af]">{user.email}</p>
              )}
            </div>

            <Link
              to="/studio/home"
              onClick={() => setDropdownOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2 text-sm text-[#374151] transition-colors hover:bg-[#f3f4f6]"
            >
              <LayoutDashboard size={14} />
              Dashboard
            </Link>
            <Link
              to="/studio/profile"
              onClick={() => setDropdownOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2 text-sm text-[#374151] transition-colors hover:bg-[#f3f4f6]"
            >
              <UserCircle size={14} />
              Profile
            </Link>
            <Link
              to="/studio/settings"
              onClick={() => setDropdownOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2 text-sm text-[#374151] transition-colors hover:bg-[#f3f4f6]"
            >
              <Settings size={14} />
              Settings
            </Link>
            <button
              onClick={handleSignOut}
              className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-[#374151] transition-colors hover:bg-[#f3f4f6]"
            >
              <LogOut size={14} />
              Sign out
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// BEO-284: Plan badge — pill next to the credit pill
// ─────────────────────────────────────────────

const PLAN_LABELS: Record<string, string> = {
  free: "Free",
  pro_starter: "Starter",
  pro_builder: "Pro",
  business: "Business",
};

interface PlanBadgeProps {
  plan: string;
  isLight: boolean;
  onUpgrade: () => void;
}

function PlanBadge({ plan, isLight, onUpgrade }: PlanBadgeProps) {
  const isFree = plan === "free";
  const label = PLAN_LABELS[plan] ?? plan;
  if (isLight) return null;
  return (
    <div className="flex items-center gap-1.5">
      <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${isFree ? "bg-[#fff7ed] text-[#F97316]" : "bg-[#f3f4f6] text-[#6b7280]"}`}>
        {label}
      </span>
      {isFree && (
        <button
          type="button"
          onClick={onUpgrade}
          className="text-[11px] font-medium text-[#F97316] underline-offset-2 hover:underline"
        >
          Upgrade
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// BEO-346: Credit pill — mini bar + balance + hover popover breakdown
// ─────────────────────────────────────────────

interface CreditPillProps {
  credits: {
    balance: number;
    monthly: number;
    topup: number;
    rollover?: number;
    used?: number;
  };
  isLight: boolean;
  onUpgrade: () => void;
}

function CreditPill({ credits, isLight, onUpgrade }: CreditPillProps) {
  const totalBalance = Math.floor(credits.balance);
  const monthly = Math.round(credits.monthly ?? 0);
  const rollover = Math.round(credits.rollover ?? 0);
  const topup = Math.round(credits.topup ?? 0);
  const used = Math.round(credits.used ?? 0);
  const buildsRemaining = Math.max(0, Math.floor(totalBalance / 3));
  const isLow = totalBalance > 0 && totalBalance < 5;
  const isEmpty = totalBalance === 0;

  return (
    <div className="group relative">
      {/* Pill trigger */}
      <button
        type="button"
        onClick={onUpgrade}
        className={
          isLight
            ? "flex items-center gap-2 rounded-full border border-white/10 px-2.5 py-1 text-xs text-white/60 transition-colors hover:border-white/20 hover:text-white/90"
            : isEmpty
              ? "flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs text-red-600 transition-colors hover:bg-red-100"
              : isLow
                ? "flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs text-amber-700 transition-colors hover:bg-amber-100"
                : "flex items-center gap-2 rounded-full border border-zinc-200 px-2.5 py-1 text-xs text-zinc-600 transition-colors hover:bg-zinc-50"
        }
      >
        {isLow && <AlertTriangle size={10} className="flex-none" />}
        <CreditBar
          monthly={monthly}
          rollover={rollover}
          topup={topup}
          balance={totalBalance}
          size="mini"
          className="w-20"
          showTooltips={false}
        />
        <span className="font-mono tabular-nums">{totalBalance}</span>
      </button>

      {/* Hover popover — full breakdown */}
      <div
        className={
          // BEO-355: no mt gap — panel sits flush with the button so the
          // cursor can reach it without losing hover. pt-4 inside the panel
          // keeps the visible top-padding we want, while an extra invisible
          // strip above the content (via -mt-2 wrapper) bridges the seam.
          "pointer-events-none absolute right-0 top-full z-50 w-64 origin-top-right rounded-xl border border-zinc-200 bg-white pt-4 pb-3 px-3 opacity-0 shadow-lg transition-opacity group-hover:pointer-events-auto group-hover:opacity-100"
        }
        role="tooltip"
      >
        <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
          Credits
        </p>
        <div className="mt-1 flex items-baseline gap-1.5">
          <span className="text-lg font-bold text-zinc-900 tabular-nums">
            {totalBalance}
          </span>
          <span className="text-[11px] text-zinc-500">remaining</span>
        </div>
        <p className="mt-0.5 text-[11px] text-zinc-500">
          &asymp; {buildsRemaining} build{buildsRemaining === 1 ? "" : "s"} remaining
        </p>

        {/* Full-size bar */}
        <div className="mt-3">
          <CreditBar
            used={used}
            monthly={monthly}
            rollover={rollover}
            topup={topup}
            balance={totalBalance}
            size="medium"
          />
        </div>

        {/* Breakdown rows */}
        <div className="mt-2.5 space-y-1 text-[11px]">
          {used > 0 && (
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 flex-none rounded-full bg-zinc-300" />
              <span className="flex-1 text-zinc-500">Used this period</span>
              <span className="tabular-nums text-zinc-700">{used}</span>
            </div>
          )}
          {monthly > 0 && (
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 flex-none rounded-full bg-blue-500" />
              <span className="flex-1 text-zinc-500">Monthly</span>
              <span className="tabular-nums text-zinc-700">{monthly}</span>
            </div>
          )}
          {rollover > 0 && (
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 flex-none rounded-full bg-purple-500" />
              <span className="flex-1 text-zinc-500">Rollover</span>
              <span className="tabular-nums text-zinc-700">{rollover}</span>
            </div>
          )}
          {topup > 0 && (
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 flex-none rounded-full bg-[#F97316]" />
              <span className="flex-1 text-zinc-500">Top-up <span className="text-zinc-400">(never expire)</span></span>
              <span className="tabular-nums text-zinc-700">{topup}</span>
            </div>
          )}
        </div>

        <p className="mt-2 text-[10px] leading-relaxed text-zinc-400">
          1 credit &asymp; a small tweak. A full app build uses 40&ndash;55 credits.
        </p>

        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onUpgrade(); }}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#F97316] px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-[#ea6c0e]"
        >
          <Zap size={11} />
          Upgrade plan
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onUpgrade(); }}
          className="mt-1.5 flex w-full items-center justify-center rounded-lg border border-zinc-200 px-3 py-1.5 text-[11px] font-semibold text-zinc-600 transition-colors hover:bg-zinc-50"
        >
          Buy credits
        </button>
      </div>
    </div>
  );
}
