import { useState } from "react";
import { ImageIcon, Sparkles, Grid3X3, Wand2, Video } from "lucide-react";

export function ImagesPage() {
  const [prompt, setPrompt] = useState("");

  return (
    <div className="flex h-full flex-col">
      {/* Header + prompt input */}
      <div className="border-b border-[rgba(255,255,255,0.08)] px-6 py-4">
        <h1 className="mb-4 text-lg font-semibold text-white">Images</h1>
        <div className="flex gap-2">
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe the image you want to generate..."
            className="flex-1 rounded-lg border border-[rgba(255,255,255,0.08)] bg-white/[0.03] px-4 py-2.5 text-sm text-white placeholder-white/25 outline-none focus:border-orange/40"
          />
          <button
            disabled
            className="flex items-center gap-2 rounded-lg bg-orange px-5 py-2.5 text-sm font-semibold text-white opacity-50 cursor-not-allowed"
          >
            <Sparkles size={14} />
            Generate
          </button>
        </div>
      </div>

      {/* Image grid — empty state */}
      <div className="flex flex-1 flex-col items-center justify-center p-6">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-[rgba(255,255,255,0.08)] bg-white/[0.03]">
          <ImageIcon size={28} className="text-white/20" />
        </div>
        <h3 className="mt-4 text-sm font-semibold text-white/50">
          Generate your first image
        </h3>
        <p className="mt-1 max-w-xs text-center text-xs text-white/25">
          Describe what you want and AI will create it. Powered by FLUX.
        </p>
      </div>

      {/* Footer banner */}
      <div className="border-t border-[rgba(255,255,255,0.08)] px-6 py-3">
        <div className="flex items-center justify-center gap-4 text-xs text-white/20">
          <span className="flex items-center gap-1.5">
            <Wand2 size={12} />
            Edit
          </span>
          <span className="text-white/10">·</span>
          <span className="flex items-center gap-1.5">
            <Grid3X3 size={12} />
            Variations
          </span>
          <span className="text-white/10">·</span>
          <span className="flex items-center gap-1.5">
            <Video size={12} />
            Video
          </span>
          <span className="ml-2 rounded-full bg-white/[0.04] px-2 py-0.5 text-[10px] text-white/15">
            coming soon
          </span>
        </div>
      </div>
    </div>
  );
}
