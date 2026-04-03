import { useParams } from "@tanstack/react-router";
import { Rocket, FolderTree, MessageSquare, Monitor } from "lucide-react";

export function ProjectPage() {
  const { id } = useParams({ from: "/studio/project/$id" });

  return (
    <div className="flex h-full flex-col">
      {/* Project header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-white">Project {id}</h2>
        <button
          disabled
          className="flex items-center gap-2 rounded-lg bg-orange/20 px-3 py-1.5 text-xs font-semibold text-orange opacity-50 cursor-not-allowed"
        >
          <Rocket size={14} />
          Deploy
        </button>
      </div>

      {/* 3-panel layout */}
      <div className="grid flex-1 grid-cols-1 lg:grid-cols-[240px_1fr_1fr]">
        {/* File tree */}
        <div className="hidden border-r border-border p-4 lg:block">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/30">
            <FolderTree size={14} />
            Files
          </div>
          <p className="mt-8 text-center text-xs text-white/20">No files</p>
        </div>

        {/* Chat panel */}
        <div className="flex flex-col border-r border-border">
          <div className="border-b border-border px-4 py-2">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/30">
              <MessageSquare size={14} />
              Chat
            </div>
          </div>
          <div className="flex flex-1 items-center justify-center">
            <p className="text-sm text-white/20">Start a conversation</p>
          </div>
        </div>

        {/* Preview pane */}
        <div className="hidden flex-col lg:flex">
          <div className="border-b border-border px-4 py-2">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/30">
              <Monitor size={14} />
              Preview
            </div>
          </div>
          <div className="flex flex-1 items-center justify-center">
            <p className="text-sm text-white/20">No preview available</p>
          </div>
        </div>
      </div>
    </div>
  );
}
