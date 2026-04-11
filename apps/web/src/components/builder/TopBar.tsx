/**
 * TopBar — V2 builder top bar.
 * White bg, center tab switcher (Preview | Code | Database | Integrations),
 * editable project name, publish states, Simple/Pro toggle.
 */
import type React from "react";
import { useState, useRef, useCallback } from "react";
import {
  ChevronLeft,
  RefreshCw,
  ExternalLink,
  Globe,
  Loader,
  Smartphone,
  Code2,
  Database,
  Link2,
  PanelLeftClose,
  PanelLeftOpen,
  BarChart2,
  BookOpen,
  Briefcase,
  CheckSquare,
  ListChecks,
  ShoppingCart,
  Sparkles,
  Table,
  Users,
  Wrench,
} from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { cn } from "../../lib/cn";
import { GlobalNav } from "../layout/GlobalNav";

export type ActiveView = "preview" | "code" | "database" | "integrations";

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

function ProjectIconRenderer({ name, size = 14 }: { name: string; size?: number }) {
  const Icon = PROJECT_ICON_MAP[name] ?? Sparkles;
  return <Icon size={size} />;
}

interface TopBarProps {
  projectName: string;
  projectIcon?: string | null;
  onProjectNameChange?: (name: string) => void;
  onRefreshPreview?: () => void;
  userMode: "simple" | "pro";
  onUserModeChange: (mode: "simple" | "pro") => void;
  activeView: ActiveView;
  onActiveViewChange: (view: ActiveView) => void;
  showSidebar?: boolean;
  onToggleSidebar?: () => void;
  isPublished?: boolean;
  hasUnpublishedChanges?: boolean;
  isPublishing?: boolean;
  onPublish?: () => void;
}

function toast(msg: string) {
  const el = document.createElement("div");
  el.textContent = msg;
  el.className =
    "fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] rounded-lg bg-[#1a1a1a] px-4 py-2 text-sm text-white shadow-lg animate-[fadeIn_200ms_ease-out]";
  document.body.appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transition = "opacity 200ms";
    setTimeout(() => el.remove(), 200);
  }, 2000);
}

const VIEW_TABS: { key: ActiveView; icon: typeof Smartphone; label: string }[] = [
  { key: "preview", icon: Smartphone, label: "Preview" },
  { key: "code", icon: Code2, label: "Code" },
  { key: "database", icon: Database, label: "Database" },
  { key: "integrations", icon: Link2, label: "Integrations" },
];

export function TopBar({
  projectName,
  projectIcon,
  onProjectNameChange,
  onRefreshPreview,
  userMode,
  onUserModeChange,
  activeView,
  onActiveViewChange,
  showSidebar = true,
  onToggleSidebar,
  isPublished = false,
  hasUnpublishedChanges = false,
  isPublishing = false,
  onPublish,
}: TopBarProps) {
  const navigate = useNavigate();
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(projectName);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const handleNameSubmit = useCallback(() => {
    setEditingName(false);
    if (nameInput.trim() && nameInput !== projectName) {
      onProjectNameChange?.(nameInput.trim());
    } else {
      setNameInput(projectName);
    }
  }, [nameInput, projectName, onProjectNameChange]);

  return (
    <header className="relative z-[60] flex h-12 flex-none shrink-0 items-center justify-between border-b border-[#e5e5e5] bg-white px-3">
      {/* Left group */}
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <button
          onClick={() => navigate({ to: "/studio/home" })}
          className="flex flex-none items-center gap-1 rounded-md px-2 py-1.5 text-[#9ca3af] transition-colors hover:bg-[#f3f4f6] hover:text-[#1a1a1a]"
          aria-label="Back to dashboard"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>

        <div className="h-4 w-px flex-none bg-[#e5e5e5]" />

        {onToggleSidebar && (
          <button
            onClick={onToggleSidebar}
            className="flex-none rounded-md p-1.5 text-[#6b7280] transition-colors hover:bg-[#f3f4f6] hover:text-[#1a1a1a]"
            aria-label="Toggle sidebar"
          >
            {showSidebar ? (
              <PanelLeftClose className="h-4 w-4" />
            ) : (
              <PanelLeftOpen className="h-4 w-4" />
            )}
          </button>
        )}

        {/* Project name — editable */}
        {editingName ? (
          <input
            ref={nameInputRef}
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onBlur={handleNameSubmit}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleNameSubmit();
              if (e.key === "Escape") {
                setNameInput(projectName);
                setEditingName(false);
              }
            }}
            className="min-w-0 max-w-[200px] border-b border-[#1a1a1a] bg-transparent text-sm font-semibold outline-none"
            autoFocus
          />
        ) : (
          <button
            onClick={() => {
              setEditingName(true);
              setNameInput(projectName);
              setTimeout(() => nameInputRef.current?.select(), 0);
            }}
            className="flex items-center gap-1.5 max-w-[220px] truncate text-sm font-semibold text-[#1a1a1a] transition-colors hover:text-[#6b7280]"
          >
            {projectIcon && (
              <span className="flex-none text-[#F97316]">
                <ProjectIconRenderer name={projectIcon} size={14} />
              </span>
            )}
            <span className="truncate">{projectName}</span>
          </button>
        )}
      </div>

      {/* Center — tab switcher (absolute centered) */}
      <div className="absolute left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-lg bg-[#f3f4f6] p-0.5">
        {VIEW_TABS.map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            onClick={() => onActiveViewChange(key)}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all",
              activeView === key
                ? "bg-white text-[#1a1a1a] shadow-sm"
                : "text-[#6b7280] hover:text-[#1a1a1a]",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Right group */}
      <div className="flex flex-1 items-center justify-end gap-1.5">
        {/* Simple / Pro toggle */}
        <div className="flex rounded-full border border-[#e5e5e5] bg-white p-0.5">
          <button
            onClick={() => onUserModeChange("simple")}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-all",
              userMode === "simple"
                ? "bg-[#F97316] text-white"
                : "text-[#6b7280] hover:text-[#1a1a1a]",
            )}
          >
            Simple
          </button>
          <button
            onClick={() => onUserModeChange("pro")}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-all",
              userMode === "pro"
                ? "bg-[#F97316] text-white"
                : "text-[#6b7280] hover:text-[#1a1a1a]",
            )}
          >
            Pro
          </button>
        </div>

        <div className="h-4 w-px bg-[#e5e5e5]" />

        {/* Refresh preview */}
        <button
          onClick={onRefreshPreview}
          className="rounded-md p-1.5 text-[#6b7280] transition-colors hover:bg-[#f3f4f6] hover:text-[#1a1a1a]"
          aria-label="Refresh preview"
        >
          <RefreshCw size={16} />
        </button>

        {/* Open in new tab */}
        <button
          onClick={() => toast("Coming soon")}
          className="rounded-md p-1.5 text-[#6b7280] transition-colors hover:bg-[#f3f4f6] hover:text-[#1a1a1a]"
          aria-label="Open in new tab"
        >
          <ExternalLink size={16} />
        </button>

        <div className="h-4 w-px bg-[#e5e5e5]" />

        {/* Publish button with states */}
        {isPublished ? (
          hasUnpublishedChanges ? (
            <button
              onClick={onPublish}
              disabled={isPublishing}
              className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-amber-600 disabled:opacity-60"
            >
              {isPublishing ? <Loader size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              Update Live
            </button>
          ) : (
            <button
              onClick={onPublish}
              className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-100"
            >
              <Globe size={12} />
              Published
            </button>
          )
        ) : (
          <button
            onClick={onPublish ?? (() => toast("Coming soon"))}
            disabled={isPublishing}
            className="flex items-center gap-1.5 rounded-lg bg-[#1a1a1a] px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#333] disabled:cursor-not-allowed disabled:bg-[#e5e5e5] disabled:text-[#9ca3af]"
          >
            {isPublishing ? <Loader size={12} className="animate-spin" /> : <Globe size={12} />}
            {isPublishing ? "Publishing\u2026" : "Publish"}
          </button>
        )}

        <div className="h-4 w-px bg-[#e5e5e5]" />
        <GlobalNav />
      </div>
    </header>
  );
}
