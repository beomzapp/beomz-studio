/**
 * HomePage — V2 projects dashboard.
 * Shows project grid, stats cards, empty state.
 * Light mode — uses StudioLayout sidebar (dark) as wrapper.
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
  Eye,
  MoreHorizontal,
  Pencil,
  Trash2,
  BarChart2,
  BookOpen,
  Briefcase,
  CheckSquare,
  Database,
  ListChecks,
  ShoppingCart,
  Smartphone,
  Sparkles,
  Table,
  Users,
  Wrench,
} from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import type { Project } from "@beomz-studio/contracts";
import { cn } from "../../../lib/cn";
import { listProjectsWithMeta, deleteProject, renameProject } from "../../../lib/api";
import { useAuth } from "../../../lib/useAuth";
import { useCredits } from "../../../lib/CreditsContext";
import { OnboardingModal, isOnboardingCompleted, markOnboardingCompleted } from "../../../components/studio/OnboardingModal";
import { saveProjectLaunchIntent } from "../../../lib/projectLaunchIntent";

interface ProjectCard extends Project {
  generationCount: number;
  database_enabled?: boolean;
  db_wired?: boolean;
  thumbnail_url?: string | null;
}

const PROJECT_ICON_MAP: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  BarChart2,
  BookOpen,
  Briefcase,
  CheckSquare,
  Globe,
  ListChecks,
  Smartphone,
  ShoppingCart,
  Sparkles,
  Table,
  Users,
  Wrench,
};

function ProjectIconBadge({ name, className }: { name: string | null; className?: string }) {
  const Icon = (name ? PROJECT_ICON_MAP[name] : null) ?? Sparkles;
  return <Icon size={28} className={className} />;
}

// Deterministic gradient from project ID
function projectGradient(id: string): string {
  const hash = id.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const hues = [
    "from-orange-400 to-pink-500",
    "from-blue-400 to-indigo-500",
    "from-emerald-400 to-teal-500",
    "from-purple-400 to-violet-500",
    "from-amber-400 to-orange-500",
    "from-cyan-400 to-blue-500",
  ];
  return hues[hash % hues.length];
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

export function HomePage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const { credits, refresh: refreshCredits } = useCredits();
  const [projects, setProjects] = useState<ProjectCard[]>([]);
  // BEO-352: Stripe checkout redirect success banner
  const [checkoutSuccess, setCheckoutSuccess] = useState(false);
  const [canCreateMore, setCanCreateMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  // Delete confirmation modal
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  // Rename state
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);

  // BEO-352: After Stripe checkout, Stripe redirects back with
  // ?checkout=success (or ?checkout=cancel). Show a toast for success,
  // silently strip the param for cancel, and refresh credits so the
  // CreditBar reflects the freshly activated plan.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get("checkout");
    if (!outcome) return;

    if (outcome === "success") {
      setCheckoutSuccess(true);
      void refreshCredits();
    }
    // Strip the param either way so it doesn't linger in the URL
    window.history.replaceState({}, "", window.location.pathname);
  }, [refreshCredits]);

  // Auto-dismiss the success banner after 5s
  useEffect(() => {
    if (!checkoutSuccess) return;
    const t = setTimeout(() => setCheckoutSuccess(false), 5000);
    return () => clearTimeout(t);
  }, [checkoutSuccess]);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    function handleClick() {
      setMenuOpen(null);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  // Escape key closes delete modal
  useEffect(() => {
    if (!deleteTarget) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setDeleteTarget(null);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [deleteTarget]);

  // Focus rename input when entering rename mode
  useEffect(() => {
    if (renamingId) {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }
  }, [renamingId]);

  // Fetch projects via the authenticated API (avoids needing Supabase RLS)
  useEffect(() => {
    void (async () => {
      try {
        const data = await listProjectsWithMeta();
        setProjects(data.projects.map((p) => ({ ...p })));
        setCanCreateMore(data.canCreateMore);
      } catch {
        // API may fail if user is not yet authenticated or session is loading
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Show onboarding for first-time users with no projects
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
    if (!trimmed) {
      setRenamingId(null);
      return;
    }
    try {
      await renameProject(projectId, trimmed);
      setProjects((prev) =>
        prev.map((p) => (p.id === projectId ? { ...p, name: trimmed } : p)),
      );
    } catch (err) {
      console.error("Failed to rename project:", err);
    }
    setRenamingId(null);
  }, [renameValue]);

  const handleDuplicate = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setMenuOpen(null);
    // Duplicate API not yet available — close menu silently
  }, []);

  const userName = session?.user?.user_metadata?.full_name?.split(" ")[0] ?? "there";

  return (
    <div className="min-h-full bg-[#faf9f6] p-6 lg:p-10">
      {/* BEO-352: Checkout success banner — auto-dismiss after 5s */}
      {checkoutSuccess && (
        <div className="fixed left-1/2 top-6 z-[150] -translate-x-1/2">
          <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 shadow-lg">
            <span className="text-lg">🎉</span>
            <div className="text-sm">
              <p className="font-semibold text-emerald-800" style={{ fontFamily: "DM Sans, sans-serif" }}>
                You're now on Pro!
              </p>
              <p className="text-[12px] text-emerald-700">
                Your plan has been activated.
              </p>
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
        <h1 className="text-2xl font-bold text-[#1a1a1a]">
          Hey {userName} 👋
        </h1>
        <p className="mt-1 text-sm text-[#9ca3af]">
          What are we building today?
        </p>
      </div>

      {/* Stats cards */}
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
      {([
          { label: "Apps", value: projects.length, icon: FolderOpen, color: "text-[#F97316]" },
          { label: "Published", value: projects.filter((p) => p.status === "published").length, icon: Globe, color: "text-emerald-500" },
          { label: "Total Builds", value: projects.reduce((a, p) => a + p.generationCount, 0), icon: Zap, color: "text-blue-500" },
          { label: "Credits", value: credits ? Math.round(credits.balance) : "—", icon: Star, color: "text-amber-500" },
        ]).map(({ label, value, icon: Icon, color }) => (
          <div
            key={label}
            className="rounded-xl border border-[#e5e7eb] bg-white p-4 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[#9ca3af]">{label}</span>
              <Icon size={16} className={color} />
            </div>
            <p className="mt-2 text-2xl font-bold text-[#1a1a1a]">{value}</p>
          </div>
        ))}
      </div>

      {/* Projects section */}
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[#1a1a1a]">My Apps</h2>
        <div className="relative group">
          <button
            onClick={() => canCreateMore && navigate({ to: "/studio/project/$id", params: { id: "new" } })}
            disabled={!canCreateMore}
            className={cn(
              "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors",
              canCreateMore
                ? "bg-[#F97316] text-white hover:bg-[#ea6c10]"
                : "cursor-not-allowed bg-[#e5e7eb] text-[#9ca3af]",
            )}
          >
            <Plus size={16} />
            New App
          </button>
          {!canCreateMore && (
            <div className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-[#1a1a1a] px-3 py-1.5 text-xs text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
              Upgrade to create more projects
              <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-[#1a1a1a]" />
            </div>
          )}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#e5e7eb] border-t-[#F97316]" />
        </div>
      )}

      {/* Empty state */}
      {!loading && projects.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#e5e7eb] bg-white py-20">
          <span className="mb-3 text-4xl">🚀</span>
          <h3 className="mb-2 text-lg font-semibold text-[#1a1a1a]">
            No apps yet
          </h3>
          <p className="mb-6 text-sm text-[#9ca3af]">
            Create your first app to get started
          </p>
          <button
            onClick={() => canCreateMore && navigate({ to: "/studio/project/$id", params: { id: "new" } })}
            disabled={!canCreateMore}
            className={cn(
              "flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold transition-colors",
              canCreateMore
                ? "bg-[#F97316] text-white hover:bg-[#ea6c10]"
                : "cursor-not-allowed bg-[#e5e7eb] text-[#9ca3af]",
            )}
          >
            <Plus size={16} />
            {canCreateMore ? "New App" : "Upgrade to create more"}
          </button>
        </div>
      )}

      {/* Project grid */}
      {!loading && projects.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {projects.map((project) => (
            <div
              key={project.id}
              className="group relative cursor-pointer overflow-hidden rounded-xl border border-[#e5e7eb] bg-white shadow-sm transition-shadow hover:shadow-md"
              onClick={() =>
                renamingId !== project.id &&
                navigate({
                  to: "/studio/project/$id",
                  params: { id: project.id },
                })
              }
            >
              {/* Thumbnail or gradient */}
              <div
                className={cn(
                  "relative flex h-32 items-center justify-center overflow-hidden",
                  !project.thumbnail_url && `bg-gradient-to-br ${projectGradient(project.id)}`,
                )}
              >
                {project.thumbnail_url ? (
                  <img
                    src={project.thumbnail_url}
                    alt={project.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <ProjectIconBadge name={project.icon ?? null} className="text-white/80" />
                )}
                {/* Status badge */}
                <div className="absolute top-2 right-2 flex items-center gap-1">
                  {/* DB badge */}
                  {project.database_enabled && (
                    <span
                      className={cn(
                        "flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                        project.db_wired
                          ? "bg-emerald-500/90 text-white"
                          : "bg-amber-500/90 text-white",
                      )}
                    >
                      <Database size={8} />
                      DB
                    </span>
                  )}
                  {/* Project status badge */}
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-medium",
                      project.status === "published"
                        ? "bg-[#1a1a1a] text-white"
                        : project.status === "building"
                          ? "bg-blue-500 text-white"
                          : "bg-white/80 text-[#6b7280]",
                    )}
                  >
                    {project.status}
                  </span>
                </div>
              </div>

              {/* Card body */}
              <div className="p-3">
                <div className="flex items-center justify-between">
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
                      className="flex-1 truncate rounded border border-[#F97316]/50 px-1.5 py-0.5 text-sm font-semibold text-[#1a1a1a] outline-none"
                    />
                  ) : (
                    <h3 className="truncate text-sm font-semibold text-[#1a1a1a]">
                      {project.name}
                    </h3>
                  )}
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
                </div>

                {/* Portal dropdown rendered below */}

                {/* Stats row */}
                <div className="mt-2 flex items-center gap-3 text-[10px] text-[#9ca3af]">
                  <span className="flex items-center gap-1">
                    <Eye size={10} /> 0 views
                  </span>
                  <span className="flex items-center gap-1">
                    <Zap size={10} /> {project.generationCount} builds
                  </span>
                  <span className="ml-auto">{timeAgo(project.lastOpenedAt ?? project.updatedAt)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Portal: 3-dot dropdown menu */}
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
            <p className="mt-1 text-sm text-[#6b7280]">
              This cannot be undone.
            </p>
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
