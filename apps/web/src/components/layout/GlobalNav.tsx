/**
 * GlobalNav — credits pill + user avatar with dropdown.
 * Used across all authenticated screens: TopBar, StudioLayout, and landing/plan pages.
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { Link } from "@tanstack/react-router";
import { LogOut, Settings, LayoutDashboard, AlertTriangle, UserCircle } from "lucide-react";
import { useAuth } from "../../lib/useAuth";
import { useCredits } from "../../lib/CreditsContext";
import { supabase } from "../../lib/supabase";
import { getApiBaseUrl } from "../../lib/api";

interface GlobalNavProps {
  /** When true, uses light text (for dark backgrounds like landing page). Default false (dark text). */
  variant?: "light" | "dark";
}

export function GlobalNav({ variant = "dark" }: GlobalNavProps) {
  const { session } = useAuth();
  const { credits } = useCredits();
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

  return (
    <div className="flex items-center gap-3">
      {/* Credits pill */}
      {credits ? (
        <div className="flex items-center gap-1.5">
          {credits.balance < 5 && credits.balance > 0 && (
            <span
              className={
                isLight
                  ? "flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-medium text-amber-300"
                  : "flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-600"
              }
              title="Low credits — top up to keep building"
            >
              <AlertTriangle size={10} />
              Low
            </span>
          )}
          <span
            className={
              isLight
                ? "rounded-full border border-white/10 px-2.5 py-1 font-mono text-xs text-white/40"
                : credits.balance === 0
                  ? "rounded-full border border-red-200 bg-red-50 px-2.5 py-1 font-mono text-xs text-red-500"
                  : credits.balance < 5
                    ? "rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 font-mono text-xs text-amber-600"
                    : "rounded-full border border-[#e5e5e5] px-2.5 py-1 font-mono text-xs text-[#6b7280]"
            }
          >
            &#9889; {Math.round(credits.balance)} credits
          </span>
        </div>
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

      {/* Dashboard link — always visible in nav bar */}
      <Link
        to="/studio/home"
        className={
          isLight
            ? "text-sm text-white/50 transition-colors hover:text-white/80"
            : "text-sm text-[#6b7280] transition-colors hover:text-[#1a1a1a]"
        }
      >
        Dashboard &rarr;
      </Link>

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
