/**
 * TopBar — V1 builder top bar ported to V2.
 * Light mode, cream bg, all V1 buttons present.
 */
import { useState, useRef, useCallback } from "react";
import {
  ChevronLeft,
  Rocket,
  Share2,
  GitBranch,
  Globe,
  RefreshCw,
  ExternalLink,
  FolderTree,
  Clock,
  MessageSquare,
} from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { cn } from "../../lib/cn";

interface TopBarProps {
  projectName: string;
  onProjectNameChange?: (name: string) => void;
  onRefreshPreview?: () => void;
  userMode: "simple" | "pro";
  onUserModeChange: (mode: "simple" | "pro") => void;
  showFiles: boolean;
  showHistory: boolean;
  showChat: boolean;
  onToggleFiles: () => void;
  onToggleHistory: () => void;
  onToggleChat: () => void;
}

function toast(msg: string) {
  // Lightweight toast — renders inline notification
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

export function TopBar({
  projectName,
  onProjectNameChange,
  onRefreshPreview,
  userMode,
  onUserModeChange,
  showFiles,
  showHistory,
  showChat,
  onToggleFiles,
  onToggleHistory,
  onToggleChat,
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
    <div className="flex h-12 shrink-0 items-center justify-between border-b border-[#e5e7eb] bg-[#faf9f6] px-3">
      {/* Left */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => navigate({ to: "/studio/home" })}
          className="flex items-center gap-1 rounded-lg p-1.5 text-[#6b7280] transition-colors hover:bg-[rgba(0,0,0,0.04)] hover:text-[#1a1a1a]"
          title="Back to projects"
        >
          <ChevronLeft size={16} />
        </button>

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
            className="rounded border border-[#e5e7eb] bg-white px-2 py-0.5 text-sm font-medium text-[#1a1a1a] outline-none focus:border-[#F97316]/50"
            autoFocus
          />
        ) : (
          <button
            onClick={() => {
              setEditingName(true);
              setNameInput(projectName);
              setTimeout(() => nameInputRef.current?.select(), 0);
            }}
            className="rounded px-2 py-0.5 text-sm font-medium text-[#1a1a1a] transition-colors hover:bg-[rgba(0,0,0,0.04)]"
          >
            {projectName}
          </button>
        )}

        <div className="mx-1.5 h-4 w-px bg-[#e5e7eb]" />

        {/* Panel toggles */}
        {([
          { key: "files" as const, icon: FolderTree, label: "Files", active: showFiles, toggle: onToggleFiles },
          { key: "history" as const, icon: Clock, label: "History", active: showHistory, toggle: onToggleHistory },
          { key: "chat" as const, icon: MessageSquare, label: "Chat", active: showChat, toggle: onToggleChat },
        ]).map(({ key, icon: Icon, label, active, toggle }) => (
          <button
            key={key}
            onClick={toggle}
            className={cn(
              "flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition-colors",
              active
                ? "bg-[#F97316]/10 text-[#F97316]"
                : "text-[#9ca3af] hover:bg-[rgba(0,0,0,0.04)] hover:text-[#6b7280]",
            )}
            title={`${active ? "Hide" : "Show"} ${label}`}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      {/* Center — Simple/Pro toggle */}
      <div className="absolute left-1/2 flex -translate-x-1/2 rounded-full border border-[#e5e7eb] bg-white p-0.5">
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

      {/* Right — action buttons */}
      <div className="flex items-center gap-1">
        <button
          onClick={onRefreshPreview}
          className="rounded-lg p-1.5 text-[#6b7280] transition-colors hover:bg-[rgba(0,0,0,0.04)] hover:text-[#1a1a1a]"
          title="Refresh preview"
        >
          <RefreshCw size={14} />
        </button>
        <button
          onClick={() => toast("Coming soon")}
          className="rounded-lg p-1.5 text-[#6b7280] transition-colors hover:bg-[rgba(0,0,0,0.04)] hover:text-[#1a1a1a]"
          title="Open in new tab"
        >
          <ExternalLink size={14} />
        </button>

        <div className="mx-1 h-4 w-px bg-[#e5e7eb]" />

        <button
          onClick={() => toast("Coming soon")}
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-[#6b7280] transition-colors hover:bg-[rgba(0,0,0,0.04)] hover:text-[#1a1a1a]"
        >
          <GitBranch size={14} />
          GitHub
        </button>
        <button
          onClick={() => toast("Coming soon")}
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-[#6b7280] transition-colors hover:bg-[rgba(0,0,0,0.04)] hover:text-[#1a1a1a]"
        >
          <Share2 size={14} />
          Share
        </button>
        <button
          onClick={() => toast("Coming soon")}
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-[#6b7280] transition-colors hover:bg-[rgba(0,0,0,0.04)] hover:text-[#1a1a1a]"
        >
          <Globe size={14} />
          Publish
        </button>
        <button
          onClick={() => toast("Deploy coming soon")}
          className="flex items-center gap-1.5 rounded-lg bg-[#F97316] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#ea6c10]"
        >
          <Rocket size={14} />
          Deploy
        </button>
      </div>
    </div>
  );
}
