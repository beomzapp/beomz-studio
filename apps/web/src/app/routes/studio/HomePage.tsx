import { FolderOpen, Plus } from "lucide-react";

export function HomePage() {
  return (
    <div className="p-6 lg:p-10">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Your Projects</h1>
        <button
          disabled
          className="flex items-center gap-2 rounded-lg bg-orange px-4 py-2 text-sm font-semibold text-white opacity-50 cursor-not-allowed"
        >
          <Plus size={16} />
          New Project
        </button>
      </div>

      {/* Empty state */}
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-20">
        <FolderOpen size={48} className="mb-4 text-white/20" />
        <h3 className="mb-2 text-lg font-semibold text-white/60">
          No projects yet
        </h3>
        <p className="text-sm text-white/30">
          Create your first project to get started
        </p>
      </div>
    </div>
  );
}
