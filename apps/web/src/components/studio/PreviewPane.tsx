import { useEffect, useMemo, useState, useCallback } from "react";
import type { CreatePreviewSessionResponse, Project, StudioFile } from "@beomz-studio/contracts";
import {
  Monitor,
  Smartphone,
  Tablet,
  RefreshCw
} from "lucide-react";

import { cn } from "../../lib/cn";
import { createOrResumePreviewSession } from "../../lib/api";
import { buildStudioPreviewHtml } from "../../lib/studio-preview";

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function injectViewport(html: string, width: number | null): string {
  if (!width) return html;

  const viewportMeta = `<meta name="viewport" content="width=${width}, initial-scale=1.0" />`;

  const widthStyle = `
    <style>
      html, body {
        width: ${width}px !important;
        min-width: ${width}px !important;
        overflow-x: hidden;
      }
    </style>`;

  return html
    .replace(/<meta name="viewport"[^>]*\/?>/, viewportMeta)
    .replace("</head>", widthStyle + "</head>");
}

// ─────────────────────────────────────────────
// PhoneFrame
// ─────────────────────────────────────────────

function PhoneFrame({
  children,
  viewportWidth,
  viewportHeight
}: {
  children?: React.ReactNode;
  viewportWidth: number;
  viewportHeight: number;
}) {
  const bezel = 8;
  const stageWidth = viewportWidth + bezel * 2;
  const stageHeight = viewportHeight + bezel * 2;
  const portraitStageHeight = 844 + bezel * 2;
  const phoneScale = (870 / portraitStageHeight) * 0.85;
  const frameWidth = Math.round(stageWidth * phoneScale);
  const frameHeight = Math.round(stageHeight * phoneScale);

  return (
    <div
      className="relative inline-block"
      style={{ width: frameWidth, height: frameHeight, maxHeight: "calc(100vh - 160px)" }}
    >
      <div
        className="absolute left-0 top-0 overflow-hidden"
        style={{
          borderRadius: 40,
          border: `${bezel}px solid #1a1a1a`,
          background: "#1a1a1a",
          width: stageWidth,
          height: stageHeight,
          transform: `scale(${phoneScale})`,
          transformOrigin: "top left"
}}
      >
        <div
          className="flex h-full w-full flex-col overflow-hidden bg-white"
          style={{ borderRadius: 34 }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// TabletFrame
// ─────────────────────────────────────────────

function TabletFrame({
  children,
  viewportWidth,
  viewportHeight,
  isPortrait
}: {
  children?: React.ReactNode;
  viewportWidth: number;
  viewportHeight: number;
  isPortrait: boolean;
}) {
  const bezel = 10;
  const stageWidth = viewportWidth + bezel * 2;
  const stageHeight = viewportHeight + bezel * 2;
  const stageScale = isPortrait
    ? 600 / viewportWidth
    : Math.min(900 / viewportWidth, 640 / viewportHeight);
  const frameWidth = Math.round(stageWidth * stageScale);
  const frameHeight = Math.round(stageHeight * stageScale);

  return (
    <div className="relative inline-block" style={{ width: frameWidth, height: frameHeight }}>
      <div
        className="absolute left-0 top-0 flex flex-col overflow-hidden"
        style={{
          borderRadius: 20,
          border: `${bezel}px solid #1a1a1a`,
          background: "#1a1a1a",
          width: stageWidth,
          height: stageHeight,
          transform: `scale(${stageScale})`,
          transformOrigin: "top left"
}}
      >
        <div className="flex flex-1 flex-col overflow-hidden bg-white" style={{ borderRadius: 12 }}>
          {children}
        </div>
        {isPortrait ? (
          <div className="flex h-6 items-center justify-center">
            <div className="h-1.5 w-28 rounded-full bg-white/45" />
          </div>
        ) : (
          <div className="absolute right-1.5 top-1/2 h-24 w-1.5 -translate-y-1/2 rounded-full bg-white/45" />
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────

interface PreviewPaneProps {
  files?: readonly StudioFile[] | null;
  generationId?: string | null;
  previewEntryPath?: string | null;
  project?: Pick<Project, "id" | "name" | "templateId"> | null;
  refreshToken?: number;
  publishedSlug?: string | null;
}

const PREVIEW_SESSION_RETRY_DELAY_MS = 1_500;
const PREVIEW_SESSION_RETRY_LIMIT = 20;
// Keep-alive heartbeat: extend the E2B sandbox before it can time out.
// E2B_PREVIEW_TIMEOUT_MS defaults to 30 minutes; ping every 4 minutes.
const PREVIEW_HEARTBEAT_INTERVAL_MS = 4 * 60 * 1_000;

export function PreviewPane({
  files,
  generationId,
  previewEntryPath,
  project,
  refreshToken = 0,
  publishedSlug
}: PreviewPaneProps) {
  // Show building overlay when project exists but no preview files yet
  const isBuilding = !!(project?.id && (!files || files.length === 0));
  const [previewMode, setPreviewMode] = useState<"inline" | "remote">("inline");
  const [, setRemoteError] = useState<string | null>(null);
  const [remoteResponse, setRemoteResponse] = useState<CreatePreviewSessionResponse | null>(null);

  // Viewport state
  const [viewMode, setViewMode] = useState<"web" | "tablet" | "mobile">("web");
  const [mobileLandscape, setMobileLandscape] = useState(false);
  const [tabletPortrait, setTabletPortrait] = useState(true);
  const [zoom, setZoom] = useState(1);

  const mobileViewportWidth = mobileLandscape ? 844 : 390;
  const mobileViewportHeight = mobileLandscape ? 390 : 844;
  const tabletViewportWidth = tabletPortrait ? 768 : 1024;
  const tabletViewportHeight = tabletPortrait ? 1024 : 768;

  const inlineHtml = useMemo(() => {
    if (!project || !files || files.length === 0) return null;
    try {
      return buildStudioPreviewHtml({ files, previewEntryPath, project });
    } catch {
      return null;
    }
  }, [files, previewEntryPath, project]);

  const mobileHtml = useMemo(
    () => (inlineHtml ? injectViewport(inlineHtml, mobileViewportWidth) : null),
    [inlineHtml, mobileViewportWidth],
  );
  const tabletHtml = useMemo(
    () => (inlineHtml ? injectViewport(inlineHtml, tabletViewportWidth) : null),
    [inlineHtml, tabletViewportWidth],
  );
  const webHtml = useMemo(
    () => (inlineHtml ? injectViewport(inlineHtml, null) : null),
    [inlineHtml],
  );

  const inlineFrame = useMemo(() => {
    if (!project || !files || files.length === 0) return null;

    const html =
      viewMode === "mobile" ? mobileHtml
        : viewMode === "tablet" ? tabletHtml
          : webHtml;

    if (!html) return null;

    return {
      key: `inline:${project.id}:${generationId ?? "draft"}:${refreshToken}:${viewMode}`,
      src: undefined,
      srcDoc: html
};
  }, [files, generationId, project, refreshToken, viewMode, mobileHtml, tabletHtml, webHtml]);

  const remoteFrame = useMemo(() => {
    if (remoteResponse?.session.provider === "e2b" && remoteResponse.session.url) {
      return {
        key: `${remoteResponse.session.id}:${remoteResponse.session.url}`,
        src: remoteResponse.session.url,
        srcDoc: undefined
};
    }
    return null;
  }, [remoteResponse]);

  const activeFrame =
    previewMode === "remote" && remoteFrame
      ? remoteFrame
      : inlineFrame;


  useEffect(() => {
    function handlePreviewMessage(event: MessageEvent) {
      if (event.data?.type !== "beomz-preview-ready") return;
    }
    window.addEventListener("message", handlePreviewMessage);
    return () => { window.removeEventListener("message", handlePreviewMessage); };
  }, []);

  useEffect(() => {
    setPreviewMode("inline");
    setRemoteError(null);
    setRemoteResponse(null);
  }, [generationId, project?.id]);

  useEffect(() => {
    if (!project?.id || !generationId) {
      return;
    }

    let cancelled = false;
    let retryTimeoutId: number | null = null;
    let attempts = 0;

    const clearRetry = () => {
      if (retryTimeoutId !== null) {
        window.clearTimeout(retryTimeoutId);
        retryTimeoutId = null;
      }
    };

    const scheduleRetry = () => {
      if (cancelled) {
        return;
      }

      if (attempts >= PREVIEW_SESSION_RETRY_LIMIT) {
        setRemoteError("Preview is taking longer than expected to start.");
        return;
      }

      retryTimeoutId = window.setTimeout(() => {
        retryTimeoutId = null;
        void loadRemotePreview();
      }, PREVIEW_SESSION_RETRY_DELAY_MS);
    };

    const loadRemotePreview = async () => {
      attempts += 1;

      try {
        const response = await createOrResumePreviewSession({
          generationId,
          projectId: project.id,
        });

        if (cancelled) {
          return;
        }

        if (response.session.provider === "e2b" && response.session.url) {
          // Only persist the response when we have a real E2B URL — booting/local
          // responses must never overwrite an already-established session.
          setRemoteResponse(response);
          setRemoteError(null);
          setPreviewMode("remote");
          return;
        }

        setRemoteError(response.error ?? null);

        if (response.session.status === "booting") {
          scheduleRetry();
        }
      } catch (error) {
        if (cancelled) {
          return;
        }

        setRemoteError(
          error instanceof Error ? error.message : "Failed to start preview session.",
        );
      }
    };

    void loadRemotePreview();

    return () => {
      cancelled = true;
      clearRetry();
    };
  }, [generationId, project?.id, refreshToken]);

  // Heartbeat: re-ping the session API on an interval so the E2B sandbox
  // timeout is continuously extended and the session stays alive.
  useEffect(() => {
    if (previewMode !== "remote" || !project?.id || !generationId) return;

    const heartbeatId = window.setInterval(async () => {
      try {
        const response = await createOrResumePreviewSession({
          generationId,
          projectId: project.id,
        });
        // Refresh the stored URL only if we get a reconnected/new sandbox URL.
        if (response.session.provider === "e2b" && response.session.url) {
          setRemoteResponse(response);
        }
      } catch {
        // Heartbeat errors are non-fatal — don't fall back on a failed keep-alive.
      }
    }, PREVIEW_HEARTBEAT_INTERVAL_MS);

    return () => { window.clearInterval(heartbeatId); };
  }, [previewMode, generationId, project?.id]);

  const handleRotate = useCallback(() => {
    if (viewMode === "mobile") setMobileLandscape((prev) => !prev);
    if (viewMode === "tablet") setTabletPortrait((prev) => !prev);
  }, [viewMode]);

  if (!project?.id) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-[#9ca3af]">
        Start a build to launch the live preview.
      </div>
    );
  }

  const urlBarText = publishedSlug ? `${publishedSlug}.beomz.app` : "beomz.app/preview";

  // ── Web view with browser chrome ──
  const renderWebView = () => (
    <div className="flex h-full flex-col">
      {/* Browser chrome */}
      <div className="flex flex-shrink-0 items-center gap-2 rounded-t-xl border border-b-0 border-[#e5e5e5] bg-[#f5f5f5] px-3 py-2">
        <div className="flex gap-1.5">
          <div className="h-3 w-3 rounded-full bg-[#ff5f57]" />
          <div className="h-3 w-3 rounded-full bg-[#febc2e]" />
          <div className="h-3 w-3 rounded-full bg-[#28c840]" />
        </div>
        <div className="flex-1 rounded-md border border-[#e5e5e5] bg-white px-3 py-1 text-xs text-[#9ca3af]">
          {urlBarText}
        </div>
      </div>
      {activeFrame ? (
        <iframe
          key={activeFrame.key}
          allow="clipboard-read; clipboard-write"
          className="flex-1 w-full rounded-b-xl border border-[#e5e5e5] bg-white"
          referrerPolicy="no-referrer"
          sandbox="allow-downloads allow-forms allow-modals allow-pointer-lock allow-popups allow-same-origin allow-scripts"
          src={activeFrame.src}
          srcDoc={activeFrame.srcDoc}
          title="Beomz Studio Preview"
         
        />
      ) : files && files.length > 0 ? (
        <div className="flex flex-1 items-center justify-center rounded-b-xl border border-[#e5e5e5] bg-white">
          <div className="flex flex-col items-center gap-3 text-center px-6">
            <p className="text-sm font-medium text-[#6b7280]">Preview unavailable</p>
            <p className="text-xs text-[#9ca3af]">Your files are ready in the Code tab</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center rounded-b-xl border border-[#e5e5e5] bg-white">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border-2 border-dashed border-[#e5e5e5]">
              <Monitor className="h-5 w-5 text-[#d1d5db]" />
            </div>
            <p className="text-sm font-medium text-[#6b7280]">Your app will appear here</p>
            <p className="text-xs text-[#9ca3af]">Start a conversation to generate your app.</p>
          </div>
        </div>
      )}
    </div>
  );

  // ── Framed views (mobile/tablet) ──
  const renderFramedView = () => {
    const isMobile = viewMode === "mobile";
    const vpW = isMobile ? mobileViewportWidth : tabletViewportWidth;
    const vpH = isMobile ? mobileViewportHeight : tabletViewportHeight;
    const Frame = isMobile ? PhoneFrame : TabletFrame;

    const frameProps = isMobile
      ? { viewportWidth: vpW, viewportHeight: vpH }
      : { viewportWidth: vpW, viewportHeight: vpH, isPortrait: tabletPortrait };

    return (
      <div className="flex h-full items-center justify-center overflow-auto">
        <div style={{ transform: `scale(${zoom})`, transformOrigin: "center center", transition: "transform 0.2s ease" }}>
          {/* @ts-expect-error -- Frame union, props are compatible */}
          <Frame {...frameProps}>
            {activeFrame ? (
              <iframe
                key={`${activeFrame.key}:${viewMode}:${refreshToken}`}
                allow="clipboard-read; clipboard-write"
                referrerPolicy="no-referrer"
                src={activeFrame.src}
                srcDoc={activeFrame.srcDoc}
                width={String(vpW)}
                height={String(vpH)}
                style={{
                  border: "none",
                  display: "block",
                  borderRadius: "inherit",
                  overflowY: "auto",
                  width: `${vpW}px`,
                  height: `${vpH}px`
}}
                sandbox="allow-downloads allow-forms allow-modals allow-pointer-lock allow-popups allow-same-origin allow-scripts"
                title={`${viewMode} preview`}
               
              />
            ) : files && files.length > 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
                <p className="text-sm font-medium text-[#6b7280]">Preview unavailable</p>
                <p className="text-xs text-[#9ca3af]">Your files are ready in the Code tab</p>
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border-2 border-dashed border-[#d1d5db]">
                  {isMobile ? <Smartphone className="h-5 w-5 text-[#d1d5db]" /> : <Tablet className="h-5 w-5 text-[#d1d5db]" />}
                </div>
                <p className="text-xs text-[#9ca3af]">Your app will appear here</p>
              </div>
            )}
          </Frame>
        </div>
      </div>
    );
  };

  return (
    <div className="relative flex h-full min-h-[340px] flex-col overflow-hidden bg-white">
      {/* Viewport toolbar */}
      <div className="flex flex-shrink-0 items-center justify-center gap-2 border-b border-[#e5e5e5] py-2">
        {/* Web / Tablet / Mobile switcher */}
        <div className="flex items-center rounded-lg bg-[#f3f4f6] p-0.5">
          {([
            { mode: "web" as const, icon: Monitor, label: "Web" },
            { mode: "tablet" as const, icon: Tablet, label: "Tablet" },
            { mode: "mobile" as const, icon: Smartphone, label: "Mobile" },
          ]).map(({ mode, icon: Icon, label }) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1 text-xs transition-all",
                viewMode === mode
                  ? "bg-white font-medium text-[#1a1a1a] shadow-sm"
                  : "text-[#6b7280] hover:text-[#1a1a1a]",
              )}
            >
              <Icon size={12} />
              {label}
            </button>
          ))}
        </div>

        {/* Rotate button */}
        {viewMode !== "web" && (
          <>
            <div className="h-4 w-px bg-[#e5e5e5]" />
            <button
              onClick={handleRotate}
              className="flex items-center gap-1.5 rounded-lg bg-[#f3f4f6] px-2.5 py-1 text-xs text-[#6b7280] transition-colors hover:bg-[#e5e7eb]"
              title="Rotate"
            >
              <RefreshCw size={12} />
              Rotate
            </button>
          </>
        )}

        {/* Zoom controls */}
        {viewMode !== "web" && (
          <>
            <div className="h-4 w-px bg-[#e5e5e5]" />
            <div className="flex items-center gap-1">
              <button
                onClick={() => setZoom((z) => Math.max(0.3, z - 0.1))}
                className="flex h-6 w-6 items-center justify-center rounded text-sm font-medium text-[#6b7280] hover:bg-[#f3f4f6]"
              >
                {"\u2212"}
              </button>
              <span className="w-8 text-center text-xs text-[#6b7280]">
                {Math.round(zoom * 100)}%
              </span>
              <button
                onClick={() => setZoom((z) => Math.min(2.0, z + 0.1))}
                className="flex h-6 w-6 items-center justify-center rounded text-sm font-medium text-[#6b7280] hover:bg-[#f3f4f6]"
              >
                +
              </button>
            </div>
          </>
        )}
      </div>

      {/* Preview area */}
      <div className="relative min-h-0 flex-1 overflow-auto p-4 md:p-6">
        {viewMode === "web" ? renderWebView() : renderFramedView()}
      </div>

      {/* Building overlay */}
      {isBuilding && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[#faf9f6]">
          <div className="flex flex-col items-center gap-4">
            <div className="relative flex h-16 w-16 items-center justify-center">
              <div className="absolute inset-0 animate-ping rounded-full bg-[#F97316]/20" />
              <div className="absolute inset-2 animate-spin rounded-full border-2 border-transparent border-t-[#F97316]" />
              <span className="text-xl font-bold text-[#F97316]">B</span>
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-[#1a1a1a]">Building your app…</p>
              <p className="mt-1 text-xs text-[#9ca3af]">This usually takes 15–30 seconds</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
