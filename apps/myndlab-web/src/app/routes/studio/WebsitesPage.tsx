/**
 * WebsitesPage — BEO-677
 * Lists all projects with project_type = 'website'.
 * Shows a card grid or the empty state with the Globe + "New website" CTA.
 */

import { useEffect, useState } from "react";
import { Globe, Plus, Clock } from "lucide-react";
import { Link, useNavigate } from "@tanstack/react-router";
import type { Project } from "@beomz-studio/contracts";
import { listWebsiteProjects } from "../../../lib/api";
import { cn } from "../../../lib/cn";

interface WebsiteProject extends Project {
  generationCount: number;
  thumbnail_url?: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ICON_COLORS = [
  { bg: "#fb923c", text: "#fff" },
  { bg: "#60a5fa", text: "#fff" },
  { bg: "#34d399", text: "#fff" },
  { bg: "#c084fc", text: "#fff" },
  { bg: "#fbbf24", text: "#fff" },
  { bg: "#22d3ee", text: "#fff" },
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

// ─── Website card ─────────────────────────────────────────────────────────────

function WebsiteCard({ project, onClick }: { project: WebsiteProject; onClick: () => void }) {
  const { bg, text } = projectColor(project.id);
  const initial = (project.name || "W").charAt(0).toUpperCase();

  return (
    <button
      onClick={onClick}
      className="group flex flex-col rounded-xl border border-[#e5e5e5] bg-white text-left transition-all duration-150 hover:border-[#F97316]/40 hover:shadow-md active:scale-[0.99]"
    >
      {/* Thumbnail */}
      <div className="relative h-36 w-full overflow-hidden rounded-t-xl bg-[#f3f4f6]">
        {project.thumbnail_url ? (
          <img
            src={project.thumbnail_url}
            alt={project.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center text-3xl font-bold"
            style={{ backgroundColor: bg, color: text }}
          >
            {initial}
          </div>
        )}
        {/* Globe badge */}
        <div className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-white/90 shadow-sm">
          <Globe size={12} className="text-[#F97316]" />
        </div>
      </div>

      {/* Info */}
      <div className="flex flex-col gap-1 px-3.5 py-3">
        <span className="truncate text-[14px] font-semibold text-[#1a1a1a] group-hover:text-[#F97316] transition-colors">
          {project.name || "Untitled Website"}
        </span>
        <div className="flex items-center gap-1 text-[11px] text-[#9ca3af]">
          <Clock size={10} />
          <span>{timeAgo(project.lastOpenedAt ?? project.updatedAt)}</span>
        </div>
      </div>
    </button>
  );
}

// ─── Skeleton card ────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="flex flex-col rounded-xl border border-[#e5e5e5] bg-white">
      <div className="h-36 w-full animate-pulse rounded-t-xl bg-gray-200" />
      <div className="flex flex-col gap-2 px-3.5 py-3">
        <div className="h-3 w-2/3 animate-pulse rounded bg-gray-200" />
        <div className="h-2.5 w-1/3 animate-pulse rounded bg-gray-100" />
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function WebsitesPage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<WebsiteProject[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const data = await listWebsiteProjects();
        setProjects(data.projects.map((p) => ({ ...p })) as WebsiteProject[]);
      } catch {
        // ignore until authenticated
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ── Empty state (no websites yet) ──────────────────────────────────────────
  if (!loading && projects.length === 0) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center bg-[#faf9f6] p-6">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-[#e5e5e5] bg-white">
          <Globe size={28} className="text-[#F97316]" />
        </div>
        <h1 className="mt-5 text-2xl font-semibold text-[#1a1a1a]">Websites</h1>
        <p className="mt-2 text-sm text-[#6b7280]">
          AI-powered website builder — create your first site
        </p>
        <Link
          to="/studio/websites/new"
          className="mt-6 flex items-center gap-2 rounded-xl bg-[#F97316] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#EA580C]"
        >
          <Plus size={16} />
          New website
        </Link>
      </div>
    );
  }

  // ── Grid view ──────────────────────────────────────────────────────────────
  return (
    <div className="min-h-full bg-[#faf9f6] p-6 lg:p-10">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1a1a1a]">Websites</h1>
          <p className="mt-1 text-sm text-[#9ca3af]">
            {loading ? "Loading…" : `${projects.length} site${projects.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <Link
          to="/studio/websites/new"
          className={cn(
            "flex items-center gap-2 rounded-xl bg-[#F97316] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#EA580C]",
          )}
        >
          <Plus size={16} />
          New website
        </Link>
      </div>

      {/* Cards grid */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {loading ? (
          Array.from({ length: 4 }, (_, i) => <SkeletonCard key={i} />)
        ) : (
          projects.map((project) => (
            <WebsiteCard
              key={project.id}
              project={project}
              onClick={() =>
                void navigate({
                  to: "/studio/websites/$projectId",
                  params: { projectId: project.id },
                  search: { brief: undefined },
                })
              }
            />
          ))
        )}
      </div>
    </div>
  );
}
