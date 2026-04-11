/**
 * HomePage — V1 projects dashboard ported to V2.
 * Shows project grid, stats cards, empty state.
 * Light mode — uses StudioLayout sidebar (dark) as wrapper.
 */
import type React from "react";
import { useEffect, useState } from "react";
import {
  Plus,
  FolderOpen,
  Globe,
  Zap,
  Star,
  Eye,
  MoreHorizontal,
  Pencil,
  Copy,
  Trash2,
  BarChart2,
  BookOpen,
  Briefcase,
  CheckSquare,
  ListChecks,
  ShoppingCart,
  Smartphone,
  Sparkles,
  Table,
  Users,
  Wrench,
} from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { cn } from "../../../lib/cn";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../lib/useAuth";

interface ProjectCard {
  id: string;
  name: string;
  icon: string | null;
  status: "draft" | "published" | "building";
  updatedAt: string;
  generationCount: number;
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

function timeAgo(iso: string): string {
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
  const [projects, setProjects] = useState<ProjectCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);

  // Fetch projects
  useEffect(() => {
    void (async () => {
      try {
        const { data } = await supabase
          .from("projects")
          .select("id, name, status, updated_at, icon")
          .order("updated_at", { ascending: false })
          .limit(20);

        if (data) {
          setProjects(
            data.map((p) => ({
              id: p.id,
              name: p.name ?? "Untitled",
              icon: (p.icon as string | null) ?? null,
              status: (p.status ?? "draft") as ProjectCard["status"],
              updatedAt: p.updated_at,
              generationCount: 0,
            })),
          );
        }
      } catch {
        // Supabase query may fail if table doesn't exist yet
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const userName = session?.user?.user_metadata?.full_name?.split(" ")[0] ?? "there";

  return (
    <div className="min-h-full bg-[#faf9f6] p-6 lg:p-10">
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
          { label: "Credits", value: "—", icon: Star, color: "text-amber-500" },
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
        <button
          onClick={() =>
            navigate({ to: "/studio/project/$id", params: { id: "new" } })
          }
          className="flex items-center gap-2 rounded-lg bg-[#F97316] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#ea6c10]"
        >
          <Plus size={16} />
          New App
        </button>
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
            onClick={() =>
              navigate({ to: "/studio/project/$id", params: { id: "new" } })
            }
            className="flex items-center gap-2 rounded-lg bg-[#F97316] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#ea6c10]"
          >
            <Plus size={16} />
            New App
          </button>
        </div>
      )}

      {/* Project grid */}
      {!loading && projects.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {projects.map((project) => (
            <div
              key={project.id}
              className="group cursor-pointer overflow-hidden rounded-xl border border-[#e5e7eb] bg-white shadow-sm transition-shadow hover:shadow-md"
              onClick={() =>
                navigate({
                  to: "/studio/project/$id",
                  params: { id: project.id },
                })
              }
            >
              {/* Gradient thumbnail with icon */}
              <div
                className={cn(
                  "relative flex h-32 items-center justify-center bg-gradient-to-br",
                  projectGradient(project.id),
                )}
              >
                <ProjectIconBadge name={project.icon} className="text-white/80" />
                {/* Status badge */}
                <span
                  className={cn(
                    "absolute top-2 right-2 rounded-full px-2 py-0.5 text-[10px] font-medium",
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

              {/* Card body */}
              <div className="p-3">
                <div className="flex items-center justify-between">
                  <h3 className="truncate text-sm font-semibold text-[#1a1a1a]">
                    {project.name}
                  </h3>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpen(menuOpen === project.id ? null : project.id);
                    }}
                    className="rounded p-1 text-[#9ca3af] opacity-0 transition-all hover:bg-[rgba(0,0,0,0.04)] hover:text-[#6b7280] group-hover:opacity-100"
                  >
                    <MoreHorizontal size={14} />
                  </button>
                </div>

                {/* Menu dropdown */}
                {menuOpen === project.id && (
                  <div className="absolute z-20 mt-1 w-36 rounded-lg border border-[#e5e7eb] bg-white py-1 shadow-lg">
                    <button className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-[#6b7280] hover:bg-[rgba(0,0,0,0.04)]">
                      <Pencil size={12} /> Rename
                    </button>
                    <button className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-[#6b7280] hover:bg-[rgba(0,0,0,0.04)]">
                      <Copy size={12} /> Duplicate
                    </button>
                    <button className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-red-500 hover:bg-red-50">
                      <Trash2 size={12} /> Delete
                    </button>
                  </div>
                )}

                {/* Stats row */}
                <div className="mt-2 flex items-center gap-3 text-[10px] text-[#9ca3af]">
                  <span className="flex items-center gap-1">
                    <Eye size={10} /> 0 views
                  </span>
                  <span className="flex items-center gap-1">
                    <Zap size={10} /> {project.generationCount} builds
                  </span>
                  <span className="ml-auto">{timeAgo(project.updatedAt)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
