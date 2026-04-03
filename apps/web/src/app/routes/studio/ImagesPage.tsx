import { Lock, ImageIcon } from "lucide-react";

export function ImagesPage() {
  return (
    <div className="flex h-full flex-col items-center justify-center p-6">
      <div className="flex flex-col items-center rounded-2xl border border-border bg-bg-card p-12">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-purple/10">
          <ImageIcon size={28} className="text-purple" />
        </div>
        <div className="mb-3 flex items-center gap-2">
          <Lock size={14} className="text-white/30" />
          <span className="rounded-full bg-white/10 px-3 py-0.5 text-xs font-semibold text-white/60">
            Coming Soon
          </span>
        </div>
        <p className="text-center text-sm text-white/40">
          Image generation powered by FLUX — available in Phase 2
        </p>
      </div>
    </div>
  );
}
