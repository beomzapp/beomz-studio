/**
 * HomePage — BEO-604 redesign.
 * Two-column layout: compact app list (62%) + context panel (38%).
 * Stats row kept; Credits value orange, Published value green.
 */
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Plus,
  FolderOpen,
  Globe,
  Zap,
  Star,
  MoreHorizontal,
  Pencil,
  Trash2,
  Sparkles,
  ChevronRight,
  Database,
} from "lucide-react";
import { Link, useNavigate } from "@tanstack/react-router";
import type { Project } from "@beomz-studio/contracts";
import { cn } from "../../../lib/cn";
import { listProjectsWithMeta, deleteProject, renameProject, getApiBaseUrl, getAccessToken } from "../../../lib/api";
import { useAuth } from "../../../lib/useAuth";
import { useCredits } from "../../../lib/CreditsContext";
import { usePricingModal } from "../../../contexts/PricingModalContext";
import { OnboardingModal, isOnboardingCompleted, markOnboardingCompleted } from "../../../components/studio/OnboardingModal";
import { saveProjectLaunchIntent } from "../../../lib/projectLaunchIntent";
import { displayProjectName } from "../../../lib/displayProjectName";

interface ProjectCard extends Project {
  generationCount: number;
  database_enabled?: boolean;
  db_wired?: boolean;
  thumbnail_url?: string | null;
}

interface ActivityEvent {
  id?: string;
  type?: string;
  appName?: string;
  description?: string;
  createdAt?: string;
  timestamp?: string;
}

// Deterministic single accent color from project ID for list-row icon
const ICON_COLORS = [
  { bg: "#fb923c", text: "#fff" }, // orange-400
  { bg: "#60a5fa", text: "#fff" }, // blue-400
  { bg: "#34d399", text: "#fff" }, // emerald-400
  { bg: "#c084fc", text: "#fff" }, // purple-400
  { bg: "#fbbf24", text: "#fff" }, // amber-400
  { bg: "#22d3ee", text: "#fff" }, // cyan-400
];

function projectColor(id: string) {
  const hash = id.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return ICON_COLORS[hash % ICON_COLORS.length];
}

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "never opened";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function nextMonthReset(): string {
  const d = new Date();
  const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return next.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function AppIconSquare({ project }: { project: ProjectCard }) {
  const { bg, text } = projectColor(project.id);
  if (project.thumbnail_url) {
    return (
      <img
        src={project.thumbnail_url}
        alt={project.name}
        className="h-10 w-10 flex-shrink-0 rounded-lg object-cover"
      />
    );
  }
  return (
    <div
      className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg text-sm font-bold uppercase"
      style={{ backgroundColor: bg, color: text }}
    >
      {displayProjectName(project.name).charAt(0)}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "published") {
    return (
      <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-800">
        Published
      </span>
    );
  }
  return (
    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">
      {status === "queued" ? "Paused" : (status || "Draft")}
    </span>
  );
}

function SkeletonRow() {
  return (
    <div className="flex items-center gap-2 py-2">
      <div className="h-2 w-2 animate-pulse rounded-full bg-gray-200" />
      <div className="h-3 flex-1 animate-pulse rounded bg-gray-200" />
      <div className="h-3 w-10 animate-pulse rounded bg-gray-100" />
    </div>
  );
}

// Plan credit allowances — fallback when API returns 0
const PLAN_CREDITS: Record<string, number> = {
  free: 100,
  pro_starter: 300,
  pro_builder: 750,
  business: 4000,
};

// ─── Right-panel cards ───────────────────────────────────────────────────────

function CreditsCard() {
  const { credits } = useCredits();
  const { openPricingModal } = usePricingModal();

  const planKey = (credits?.plan ?? "free").toLowerCase();
  const planCredits =
    credits?.planCredits && credits.planCredits > 0
      ? credits.planCredits
      : (PLAN_CREDITS[planKey] ?? 0);

  // Bug 3: use Math.floor to match the popover (avoids +1 rounding discrepancy)
  const balance = credits ? Math.floor(credits.balance) : 0;
  // Bug 1: total = base plan allocation + remaining topup credits
  const topup = credits ? Math.round(credits.topup) : 0;
  const total = planCredits + topup;
  const remainingPct = total > 0 ? Math.min(100, (balance / total) * 100) : 0;

  const planLabel =
    planKey === "pro_starter" ? "Pro Starter" :
    planKey === "pro_builder" ? "Pro Builder" :
    planKey === "business" ? "Business" :
    "Free";

  // Bug 2: free plan label reflects top-up state
  const subLabel =
    planKey === "free" && topup > 0
      ? "Free plan · topped up"
      : planKey === "free"
        ? "Free plan · one-time credits"
        : `${planLabel} · resets ${nextMonthReset()}`;

  return (
    <div className="rounded-xl border border-[#e5e7eb] bg-white p-4">
      <p className="text-[13px] font-medium text-[#1a1a1a]">Credits</p>

      <div className="mt-3">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-full rounded-full bg-orange-500 transition-all duration-500"
            style={{ width: `${remainingPct}%` }}
          />
        </div>
        <div className="mt-1.5 flex items-center justify-between">
          <span className="text-[12px] text-[#9ca3af]">{balance} remaining</span>
          <span className="text-[12px] text-[#9ca3af]">{total > 0 ? total : "—"} total</span>
        </div>
      </div>

      <div className="my-3 border-t border-[#f3f4f6]" />

      <div className="flex items-center justify-between">
        <span className="text-[12px] text-[#9ca3af]">{subLabel}</span>
        <button
          onClick={openPricingModal}
          className="text-[12px] font-medium transition-colors hover:opacity-80"
          style={{ color: "#F97316" }}
        >
          Top up →
        </button>
      </div>
    </div>
  );
}

function ActivityCard() {
  const [events, setEvents] = useState<ActivityEvent[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), 3000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const token = await getAccessToken();
        const resp = await fetch(`${getApiBaseUrl()}/activity?limit=3`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!resp.ok) {
          setEvents(null);
        } else {
          const data = await resp.json() as { events?: ActivityEvent[]; activity?: ActivityEvent[] };
          setEvents(data.events ?? data.activity ?? []);
        }
      } catch {
        setEvents(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const showSkeleton = loading && !timedOut;
  const showEmpty = !showSkeleton && (events === null || events.length === 0);

  return (
    <div className="rounded-xl border border-[#e5e7eb] bg-white p-4">
      <p className="text-[13px] font-medium text-[#1a1a1a]">Recent activity</p>
      <div className="mt-3 space-y-2">
        {showSkeleton ? (
          <>
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </>
        ) : showEmpty ? (
          <p className="py-3 text-center text-[12px] text-[#9ca3af]">No activity yet</p>
        ) : (
          events!.map((ev, i) => {
            const isLatest = i === 0;
            const ts = ev.createdAt ?? ev.timestamp ?? null;
            const label =
              ev.description ??
              (ev.appName && ev.type
                ? ev.type === "published"
                  ? `${ev.appName} published`
                  : ev.type === "iteration"
                    ? `${ev.appName} — iteration`
                    : `${ev.appName} ${ev.type}`
                : "Activity");
            return (
              <div key={ev.id ?? i} className="flex items-start gap-2">
                <span
                  className={cn(
                    "mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full",
                    isLatest ? "bg-orange-500" : "bg-gray-300",
                  )}
                />
                <span className="flex-1 text-[11px] leading-relaxed text-[#6b7280]">
                  {label}
                </span>
                {ts && (
                  <span className="flex-shrink-0 text-[11px] text-[#9ca3af]">
                    {timeAgo(ts)}
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function ReferralCard() {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    let link = "https://beomz.ai/signup";
    try {
      const token = await getAccessToken();
      const resp = await fetch(`${getApiBaseUrl()}/referrals`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (resp.ok) {
        const data = await resp.json() as { code?: string; referral_code?: string };
        const code = data.code ?? data.referral_code;
        if (code) {
          link = `https://beomz.ai/signup?ref=${code}`;
        }
      }
    } catch {
      // fallback to base link
    }
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  return (
    <div
      className="rounded-xl p-4"
      style={{
        backgroundColor: "#FFF7ED",
        border: "0.5px solid #FED7AA",
      }}
    >
      <p className="text-[13px] font-medium" style={{ color: "#C2410C" }}>
        Invite friends
      </p>
      <p
        className="mt-1.5 whitespace-pre-line text-[12px] leading-relaxed"
        style={{ color: "#92400E" }}
      >
        {`Earn 50 credits for each of your first 3 referrals.
Earn 200 credits every time a referral upgrades — no limit.`}
      </p>
      <button
        onClick={() => void handleCopy()}
        className="mt-3 rounded-lg bg-orange-500 px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-orange-600"
      >
        {copied ? "Copied!" : "Copy referral link"}
      </button>
      <Link
        to="/studio/settings/referrals"
        className="mt-2 block text-center text-[12px] font-normal text-[#C2410C]/75 transition-colors hover:text-[#C2410C] hover:underline"
      >
        View referrals →
      </Link>
    </div>
  );
}

const REFERRAL_CREDITS_KEY = "beomz_last_referral_credits";

function ReferralBonusToast({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed z-[200] flex max-w-xs items-start gap-3 rounded-xl border border-orange-200 bg-white p-4 shadow-lg"
      style={{ bottom: 24, right: 24 }}
    >
      <span className="mt-0.5 flex-shrink-0 text-xl">🎉</span>
      <div className="flex-1">
        <p className="text-[13px] font-semibold text-[#1a1a1a]">
          Referral bonus! +50 credits
        </p>
        <p className="mt-0.5 text-[12px] text-[#6b7280]">
          Someone signed up using your referral link.
        </p>
      </div>
      <button
        onClick={onClose}
        className="flex-shrink-0 text-[#9ca3af] transition-colors hover:text-[#6b7280]"
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export function HomePage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const { credits, refresh: refreshCredits } = useCredits();
  const [projects, setProjects] = useState<ProjectCard[]>([]);
  const [checkoutSuccess, setCheckoutSuccess] = useState(false);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showReferralToast, setShowReferralToast] = useState(false);

  // BEO-618: Referral bonus toast — shown once when credits_earned increases
  useEffect(() => {
    let dismissTimer: ReturnType<typeof setTimeout> | undefined;
    (async () => {
      try {
        const token = await getAccessToken();
        const resp = await fetch(`${getApiBaseUrl()}/referrals`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!resp.ok) return;
        const data = await resp.json() as { credits_earned?: number };
        const earned = data.credits_earned ?? 0;
        const stored = parseInt(localStorage.getItem(REFERRAL_CREDITS_KEY) ?? "0", 10);
        if (earned > stored) {
          setShowReferralToast(true);
          localStorage.setItem(REFERRAL_CREDITS_KEY, String(earned));
          dismissTimer = setTimeout(() => setShowReferralToast(false), 5000);
        }
      } catch {
        // silently ignore
      }
    })();
    return () => clearTimeout(dismissTimer);
  }, []);

  // BEO-352: Stripe checkout redirect
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get("checkout");
    if (!outcome) return;
    if (outcome === "success") {
      setCheckoutSuccess(true);
      void refreshCredits();
    }
    window.history.replaceState({}, "", window.location.pathname);
  }, [refreshCredits]);

  useEffect(() => {
    if (!checkoutSuccess) return;
    const t = setTimeout(() => setCheckoutSuccess(false), 5000);
    return () => clearTimeout(t);
  }, [checkoutSuccess]);

  useEffect(() => {
    if (!menuOpen) return;
    function handleClick() { setMenuOpen(null); }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  useEffect(() => {
    if (!deleteTarget) return;
    function handleKey(e: KeyboardEvent) { if (e.key === "Escape") setDeleteTarget(null); }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [deleteTarget]);

  useEffect(() => {
    if (renamingId) {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }
  }, [renamingId]);

  useEffect(() => {
    void (async () => {
      try {
        const data = await listProjectsWithMeta();
        setProjects(data.projects.map((p) => ({ ...p })));
      } catch {
        // ignore until authenticated
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!loading && projects.length === 0 && !isOnboardingCompleted()) {
      setShowOnboarding(true);
    }
  }, [loading, projects.length]);

  const handleDeleteClick = useCallback((e: React.MouseEvent, project: ProjectCard) => {
    e.stopPropagation();
    e.preventDefault();
    setMenuOpen(null);
    setDeleteTarget({ id: project.id, name: project.name });
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      await deleteProject(deleteTarget.id);
      setProjects((prev) => prev.filter((p) => p.id !== deleteTarget.id));
    } catch (err) {
      console.error("Failed to delete project:", err);
    }
    setDeleteTarget(null);
  }, [deleteTarget]);

  const handleStartRename = useCallback((e: React.MouseEvent, project: ProjectCard) => {
    e.stopPropagation();
    e.preventDefault();
    setMenuOpen(null);
    setRenamingId(project.id);
    setRenameValue(project.name);
  }, []);

  const handleFinishRename = useCallback(async (projectId: string) => {
    const trimmed = renameValue.trim();
    if (!trimmed) { setRenamingId(null); return; }
    try {
      await renameProject(projectId, trimmed);
      setProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, name: trimmed } : p)));
    } catch (err) {
      console.error("Failed to rename project:", err);
    }
    setRenamingId(null);
  }, [renameValue]);

  const handleDuplicate = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setMenuOpen(null);
  }, []);

  const userName = session?.user?.user_metadata?.full_name?.split(" ")[0] ?? "there";
  // Mirror GET /projects: free cap, paid unlimited — must stay in sync with API for limit UX
  const planKey = (credits?.plan ?? "free").toLowerCase();
  const projectLimit = planKey === "free" ? 3 : -1;
  const canCreateMore = projectLimit < 0 || projects.length < projectLimit;
  const publishedCount = projects.filter((p) => p.status === "published").length;
  const totalBuilds = projects.reduce((a, p) => a + p.generationCount, 0);
  const creditsBalance = credits ? Math.floor(credits.balance) : "—";

  const SHOW_ALL_THRESHOLD = 4;
  const showViewAll = projects.length > SHOW_ALL_THRESHOLD;

  return (
    <div className="min-h-full bg-[#faf9f6] p-6 lg:p-10">
      {/* BEO-352: checkout success banner */}
      {checkoutSuccess && (
        <div className="fixed left-1/2 top-6 z-[150] -translate-x-1/2">
          <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 shadow-lg">
            <span className="text-lg">🎉</span>
            <div className="text-sm">
              <p className="font-semibold text-emerald-800" style={{ fontFamily: "DM Sans, sans-serif" }}>
                You're now on Pro!
              </p>
              <p className="text-[12px] text-emerald-700">Your plan has been activated.</p>
            </div>
            <button
              onClick={() => setCheckoutSuccess(false)}
              className="ml-2 text-emerald-500 transition-colors hover:text-emerald-700"
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {showOnboarding && (
        <OnboardingModal
          onSelect={(prompt) => {
            setShowOnboarding(false);
            markOnboardingCompleted();
            if (prompt) {
              saveProjectLaunchIntent({ prompt });
              navigate({ to: "/studio/project/$id", params: { id: "new" } });
            }
          }}
          onDismiss={() => setShowOnboarding(false)}
        />
      )}

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[#1a1a1a]">Hey {userName} 👋</h1>
        <p className="mt-1 text-sm text-[#9ca3af]">What are we building today?</p>
      </div>

      {/* Stats row */}
      <div className="mb-8 grid w-full grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl border border-[#e5e7eb] bg-white p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#9ca3af]">Apps</span>
            <FolderOpen size={16} className="text-[#F97316]" />
          </div>
          <p className="mt-2 text-2xl font-bold text-[#1a1a1a]">{projects.length}</p>
        </div>
        <div className="rounded-xl border border-[#e5e7eb] bg-white p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#9ca3af]">Published</span>
            <Globe size={16} className="text-emerald-500" />
          </div>
          <p className="mt-2 text-2xl font-bold" style={{ color: "#16a34a" }}>{publishedCount}</p>
        </div>
        <div className="rounded-xl border border-[#e5e7eb] bg-white p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#9ca3af]">Total Builds</span>
            <Zap size={16} className="text-blue-500" />
          </div>
          <p className="mt-2 text-2xl font-bold text-[#1a1a1a]">{totalBuilds}</p>
        </div>
        <div className="rounded-xl border border-[#e5e7eb] bg-white p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#9ca3af]">Credits</span>
            <Star size={16} className="text-amber-500" />
          </div>
          <p className="mt-2 text-2xl font-bold" style={{ color: "#F97316" }}>{creditsBalance}</p>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-[62fr_38fr] gap-5">
        {/* ── Left column: app list ── */}
        <div className="min-w-0">
          <div className="rounded-xl border border-[#e5e7eb] bg-white">
            {/* List header */}
            <div className="flex items-center justify-between px-4 pt-4 pb-3">
              <span className="text-[14px] font-medium text-[#1a1a1a]">My apps</span>
              {showViewAll && (
                <button
                  onClick={() => navigate({ to: "/studio/project/$id", params: { id: "new" } })}
                  className="text-[12px] text-[#9ca3af] transition-colors hover:text-[#6b7280]"
                >
                  View all
                </button>
              )}
            </div>

            {/* Loading */}
            {loading && (
              <div className="flex items-center justify-center py-12">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#e5e7eb] border-t-[#F97316]" />
              </div>
            )}

            {/* Empty state */}
            {!loading && projects.length === 0 && (
              <div className="flex flex-col items-center justify-center py-14">
                <span className="mb-3 text-4xl">🚀</span>
                <h3 className="mb-1 text-[15px] font-semibold text-[#1a1a1a]">No apps yet</h3>
                <p className="text-[13px] text-[#9ca3af]">Create your first app to get started</p>
              </div>
            )}

            {/* App rows */}
            {!loading && projects.length > 0 && (
              <div className="divide-y divide-[#f3f4f6]">
                {projects.map((project) => (
                  <div
                    key={project.id}
                    className="group flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-[var(--color-background-secondary,#f9fafb)]"
                    onClick={() =>
                      renamingId !== project.id &&
                      navigate({ to: "/studio/project/$id", params: { id: project.id } })
                    }
                  >
                    <AppIconSquare project={project} />

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {renamingId === project.id ? (
                          <input
                            ref={renameInputRef}
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onBlur={() => void handleFinishRename(project.id)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") void handleFinishRename(project.id);
                              if (e.key === "Escape") setRenamingId(null);
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="flex-1 truncate rounded border border-[#F97316]/50 px-1.5 py-0.5 text-sm font-medium text-[#1a1a1a] outline-none"
                          />
                        ) : (
                          <span className="truncate text-[14px] font-medium text-[#1a1a1a]">
                            {displayProjectName(project.name)}
                          </span>
                        )}
                        {project.database_enabled && (
                          <span
                            className={cn(
                              "flex flex-shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                              project.db_wired
                                ? "bg-emerald-500/20 text-emerald-700"
                                : "bg-amber-500/20 text-amber-700",
                            )}
                          >
                            <Database size={8} />
                            DB
                          </span>
                        )}
                        <StatusBadge status={project.status ?? "draft"} />
                      </div>
                      <p className="mt-0.5 text-[12px] text-[#9ca3af]">
                        {project.generationCount} build{project.generationCount !== 1 ? "s" : ""} ·{" "}
                        {timeAgo(project.lastOpenedAt ?? project.updatedAt)}
                      </p>
                    </div>

                    {/* 3-dot menu */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        if (menuOpen === project.id) {
                          setMenuOpen(null);
                        } else {
                          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                          setMenuPos({ top: rect.bottom + 4, left: rect.right - 144 });
                          setMenuOpen(project.id);
                        }
                      }}
                      className="rounded p-1 text-[#9ca3af] opacity-0 transition-all hover:bg-[rgba(0,0,0,0.04)] hover:text-[#6b7280] group-hover:opacity-100"
                    >
                      <MoreHorizontal size={14} />
                    </button>

                    <ChevronRight size={14} className="flex-shrink-0 text-[#d1d5db]" />
                  </div>
                ))}
              </div>
            )}

            {/* New app dashed row */}
            {!loading && (
              <div
                className={cn(
                  "mx-4 mb-4 flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-[#d1d5db] px-3 py-3 transition-colors hover:border-[#F97316]/40 hover:bg-orange-50/30",
                  projects.length > 0 && "mt-2",
                )}
                onClick={() => canCreateMore && navigate({ to: "/studio/project/$id", params: { id: "new" } })}
              >
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border border-dashed border-[#d1d5db]">
                  <Plus size={16} className="text-[#9ca3af]" />
                </div>
                <span className="text-[13px] text-[#9ca3af]">
                  {canCreateMore ? "New app" : "Upgrade to create more"}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ── Right column: context panel ── */}
        <div className="flex flex-col gap-3">
          <CreditsCard />
          <ActivityCard />
          <ReferralCard />
        </div>
      </div>

      {/* Portal: 3-dot dropdown */}
      {menuOpen && createPortal(
        <div
          className="fixed z-50 w-36 rounded-lg border border-[#e5e7eb] bg-white py-1 shadow-lg"
          style={{ top: menuPos.top, left: menuPos.left }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {(() => {
            const project = projects.find((p) => p.id === menuOpen);
            if (!project) return null;
            return (
              <>
                <button
                  onClick={(e) => handleStartRename(e, project)}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-[#6b7280] hover:bg-[rgba(0,0,0,0.04)]"
                >
                  <Pencil size={12} /> Rename
                </button>
                <button
                  onClick={handleDuplicate}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-[#6b7280] hover:bg-[rgba(0,0,0,0.04)]"
                >
                  <Sparkles size={12} /> Duplicate
                </button>
                <button
                  onClick={(e) => handleDeleteClick(e, project)}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-red-500 hover:bg-red-50"
                >
                  <Trash2 size={12} /> Delete
                </button>
              </>
            );
          })()}
        </div>,
        document.body,
      )}

      {/* BEO-618: Referral bonus toast */}
      {showReferralToast && createPortal(
        <ReferralBonusToast onClose={() => setShowReferralToast(false)} />,
        document.body,
      )}

      {/* Delete confirmation modal */}
      {deleteTarget && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/50"
          onClick={() => setDeleteTarget(null)}
        >
          <div
            className="mt-40 w-full max-w-sm rounded-xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-[#1a1a1a]">
              Delete &ldquo;{deleteTarget.name}&rdquo;?
            </h3>
            <p className="mt-1 text-sm text-[#6b7280]">This cannot be undone.</p>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="rounded-lg border border-[#e5e7eb] px-4 py-2 text-sm font-medium text-[#6b7280] transition-colors hover:bg-[#f3f4f6]"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleConfirmDelete()}
                className="rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600"
              >
                Delete
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
