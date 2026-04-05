/**
 * PreviewPanel — V1 preview panel ported to V2.
 * Shows iframe preview with viewport switcher (Web/Tablet/Mobile).
 * Light mode, cream bg.
 */
import { useState, useCallback } from "react";
import {
  Monitor,
  Tablet,
  Smartphone,
  RotateCcw,
  Loader2,
} from "lucide-react";
import { cn } from "../../lib/cn";

type ViewportMode = "web" | "tablet" | "mobile";

interface PreviewPanelProps {
  previewUrl?: string | null;
  previewHtml?: string;
  isLoading?: boolean;
  onRefresh?: () => void;
}

export function PreviewPanel({
  previewUrl,
  previewHtml,
  isLoading,
  onRefresh,
}: PreviewPanelProps) {
  const [viewMode, setViewMode] = useState<ViewportMode>("web");
  const [previewKey, setPreviewKey] = useState(0);

  const handleRefresh = useCallback(() => {
    setPreviewKey((k) => k + 1);
    onRefresh?.();
  }, [onRefresh]);

  // Viewport dimensions
  const viewportStyle: Record<ViewportMode, { width: string; maxWidth: string; borderRadius: string }> = {
    web: { width: "100%", maxWidth: "100%", borderRadius: "0" },
    tablet: { width: "768px", maxWidth: "768px", borderRadius: "20px" },
    mobile: { width: "375px", maxWidth: "375px", borderRadius: "40px" },
  };

  const style = viewportStyle[viewMode];

  return (
    <div className="flex flex-1 flex-col bg-[#faf9f6]">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-[#e5e7eb] px-4 py-2">
        <div className="flex items-center gap-1">
          <span className="mr-2 text-xs font-medium text-[#9ca3af]">Preview</span>
          {([
            { mode: "web" as const, icon: Monitor, label: "Web" },
            { mode: "tablet" as const, icon: Tablet, label: "Tablet" },
            { mode: "mobile" as const, icon: Smartphone, label: "Mobile" },
          ]).map(({ mode, icon: Icon, label }) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={cn(
                "flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition-colors",
                viewMode === mode
                  ? "bg-[#F97316]/10 text-[#F97316]"
                  : "text-[#6b7280] hover:bg-[rgba(0,0,0,0.04)] hover:text-[#1a1a1a]",
              )}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>
        <button
          onClick={handleRefresh}
          className="rounded-lg p-1.5 text-[#6b7280] transition-colors hover:bg-[rgba(0,0,0,0.04)] hover:text-[#1a1a1a]"
          title="Refresh"
        >
          <RotateCcw size={14} />
        </button>
      </div>

      {/* Preview area */}
      <div className="flex flex-1 items-start justify-center overflow-auto bg-[#f0efe9] p-4">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <Loader2 size={24} className="mx-auto animate-spin text-[#F97316]" />
              <p className="mt-3 text-sm text-[#9ca3af]">Loading preview...</p>
            </div>
          </div>
        ) : (
          <div
            className="overflow-hidden bg-white shadow-lg transition-all duration-200"
            style={{
              width: style.width,
              maxWidth: style.maxWidth,
              borderRadius: style.borderRadius,
              height: viewMode === "web" ? "100%" : viewMode === "tablet" ? "1024px" : "812px",
              border: viewMode !== "web" ? "8px solid #1a1a1a" : undefined,
            }}
          >
            {previewUrl ? (
              <iframe
                key={`${viewMode}-${previewKey}`}
                src={previewUrl}
                className="h-full w-full border-0"
                title="Preview"
                sandbox="allow-downloads allow-forms allow-modals allow-pointer-lock allow-popups allow-same-origin allow-scripts"
                allow="clipboard-read; clipboard-write"
              />
            ) : previewHtml ? (
              <iframe
                key={`${viewMode}-${previewKey}`}
                srcDoc={previewHtml}
                className="h-full w-full border-0"
                title="Preview"
                sandbox="allow-downloads allow-forms allow-modals allow-pointer-lock allow-popups allow-same-origin allow-scripts"
              />
            ) : (
              <div className="flex h-full items-center justify-center">
                <p className="text-sm text-[#9ca3af]">
                  Start a build to see the preview
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
