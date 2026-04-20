import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Project, StudioFile } from "@beomz-studio/contracts";
import {
  Monitor,
  Smartphone,
  Tablet,
  RefreshCw,
  Zap,
  AlertTriangle,
} from "lucide-react";

// ─────────────────────────────────────────────
// BEO-454/455: Progress bar milestones (% at start of each phase)
// ─────────────────────────────────────────────

/** Progress percentage at the START of each step (before it completes). */
const STEP_PROGRESS_START = [5, 15, 75, 90] as const;

/** Milliseconds each step lasts before advancing (initial build timings). */
const STEP_DURATIONS_MS = [30_000, 180_000, 60_000, 30_000] as const;

import { cn } from "../../lib/cn";
import { buildStudioPreviewHtml } from "../../lib/studio-preview";
import { useWebContainerPreview } from "../../hooks/useWebContainerPreview";

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
  isAiCustomising?: boolean;
  previewEntryPath?: string | null;
  project?: Pick<Project, "id" | "name" | "templateId"> | null;
  refreshToken?: number;
  publishedSlug?: string | null;
  onFilesWritten?: () => void;
  /** BEO-391: WebContainer dev server bound — checklist "deploying" can complete. */
  onPreviewServerReady?: () => void;
  /** BEO-340: Build ended in fallback (no AI files) — show error state instead of preview. */
  buildFailed?: boolean;
  /** BEO-452: Neon connection string — re-injected into .env.local after every hot-swap. */
  neonDbUrl?: string | null;
  /** BEO-454: Specific error reason from SSE for the polished error overlay. */
  buildErrorMessage?: string | null;
  /** BEO-454: Re-submit the last prompt when user clicks Retry. */
  onRetry?: () => void;
  /** BEO-454: Actual credits consumed — replaces estimate once build completes. */
  creditsUsed?: number | null;
  /**
   * BEO-456 final: authoritative "build pipeline is still running" from
   * useBuildChat. Passed through to useWebContainerPreview so the hook can
   * defer the first wc.mount() until the build is truly done — preventing
   * the API's early scaffold/prebuilt files (e.g. Kanban Board) from ever
   * touching the WebContainer filesystem. Not used for visual gating since
   * iterations keep the iframe live via BEO-449.
   */
  isBuildInProgress?: boolean;
}

export function PreviewPane({
  files,
  generationId,
  isAiCustomising = false,
  previewEntryPath,
  project,
  refreshToken = 0,
  publishedSlug,
  onFilesWritten,
  onPreviewServerReady,
  buildFailed = false,
  neonDbUrl,
  buildErrorMessage,
  onRetry,
  isBuildInProgress = false,
}: PreviewPaneProps) {
  // Local "no files yet" gate used only for visual overlay/shimmer transitions.
  // The authoritative "build in flight" signal is `isBuildInProgress` (prop).
  const isBuilding = !!(project?.id && (!files || files.length === 0));
  const wcIframeRef = useRef<HTMLIFrameElement | null>(null);
  const prevRefreshTokenRef = useRef(refreshToken);

  // Viewport state
  const [viewMode, setViewMode] = useState<"web" | "tablet" | "mobile">("web");
  const [mobileLandscape, setMobileLandscape] = useState(false);
  const [tabletPortrait, setTabletPortrait] = useState(true);
  const [zoom, setZoom] = useState(1);

  const mobileViewportWidth = mobileLandscape ? 844 : 390;
  const mobileViewportHeight = mobileLandscape ? 390 : 844;
  const tabletViewportWidth = tabletPortrait ? 768 : 1024;
  const tabletViewportHeight = tabletPortrait ? 1024 : 768;

  // ── WebContainer (primary preview) ──────────────────────────────────────
  const {
    status: wcStatus,
    previewUrl,
    progressMessage,
    isFixing,
    firstFilesDelivered,
  } = useWebContainerPreview(
    files,
    project,
    onFilesWritten,
    undefined, // dbEnv is injected separately via ProjectPage
    generationId,
    onPreviewServerReady,
    neonDbUrl,
    isBuildInProgress,
  );

  // ── Inline srcDoc (shown immediately; stays visible until WC is ready) ──
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

  // Active frame: prefer WebContainer URL when the dev server is ready;
  // fall back to inline srcDoc otherwise.
  const useWebContainer = wcStatus === "ready" && previewUrl !== null;

  // Show a loading screen (instead of srcDoc) while WC is booting/installing/starting
  const wcIsLoading =
    !!(files && files.length > 0) &&
    (wcStatus === "booting" || wcStatus === "installing" || wcStatus === "starting");

  const activeFrame = useMemo(() => {
    if (!project || !files || files.length === 0) return null;

    if (useWebContainer && previewUrl) {
      // WC iframe must stay stable — Vite HMR handles file updates.
      // DO NOT include generationId or refreshToken in the key:
      // remounting the iframe while WC is mid-HMR causes 504 Outdated
      // Request and MIME type errors.
      return {
        key: `wc:${project.id}`,
        src: previewUrl,
        srcDoc: undefined,
      };
    }

    const html =
      viewMode === "mobile" ? mobileHtml
        : viewMode === "tablet" ? tabletHtml
          : webHtml;

    if (!html) return null;

    return {
      key: `inline:${project.id}:${generationId ?? "draft"}:${refreshToken}:${viewMode}`,
      src: undefined,
      srcDoc: html,
    };
  }, [
    useWebContainer, previewUrl,
    files, generationId, project, refreshToken, viewMode,
    mobileHtml, tabletHtml, webHtml,
  ]);

  // WC refresh: reload the iframe in-place instead of remounting (avoids 504s)
  useEffect(() => {
    if (prevRefreshTokenRef.current === refreshToken) return;
    prevRefreshTokenRef.current = refreshToken;
    if (useWebContainer && wcIframeRef.current) {
      try {
        wcIframeRef.current.contentWindow?.location.reload();
      } catch {
        // cross-origin or destroyed — ignore
      }
    }
  }, [refreshToken, useWebContainer]);

  // Confirm WC is actually serving — server-ready event fires when the port
  // binds, but Vite still needs a moment to serve initial content.
  // Delay revealing the iframe by 600ms after wcStatus=ready+previewUrl set,
  // so the user sees the loading spinner instead of a transient error page.
  // BEO-456 follow-up: server-ready fires for the BLANK SHELL first. If we
  // start the 600ms timer at that point, the iframe can fade in while Vite
  // is still serving the shell — briefly exposing the old scaffold template.
  // Gate the timer on firstFilesDelivered so it only runs AFTER deliverFiles()
  // has wc.mount()-ed the real app files. Iterations: firstFilesDelivered
  // stays true across the component lifetime so their behaviour is unchanged.
  const [wcReadyConfirmed, setWcReadyConfirmed] = useState(false);
  useEffect(() => {
    if (
      !isBuilding &&
      wcStatus === "ready" &&
      previewUrl &&
      firstFilesDelivered
    ) {
      setWcReadyConfirmed(false);
      const t = setTimeout(() => setWcReadyConfirmed(true), 600);
      return () => clearTimeout(t);
    }
    setWcReadyConfirmed(false);
  }, [wcStatus, previewUrl, isBuilding, firstFilesDelivered]);

  // Unified "should hide iframe behind overlay" — true when:
  //  - WC is still booting (not ready yet), OR
  //  - WC just became ready but we haven't confirmed it's serving yet.
  // BEO-449: isAiCustomising no longer forces the overlay when WC is already
  // confirmed live. For iterations the iframe stays visible and Vite HMR
  // updates it in place; only the "Updating…" badge in the URL bar changes.
  const showLoadingOverlay =
    !!(files && files.length > 0) &&
    (wcIsLoading || !wcReadyConfirmed);

  // ── BEO-454/455: Progress bar only (shimmer checklist moved to chat panel) ─
  const firstBuildActive = isBuilding && !wcReadyConfirmed;

  const [progressPct, setProgressPct] = useState(5);
  const [showProgressBar, setShowProgressBar] = useState(false);
  const buildWasActiveRef = useRef(false);
  const progressBarHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!firstBuildActive) {
      if (buildWasActiveRef.current) {
        buildWasActiveRef.current = false;
      }
      return;
    }
    if (buildWasActiveRef.current) return;
    buildWasActiveRef.current = true;

    setProgressPct(STEP_PROGRESS_START[0]);
    setShowProgressBar(true);
    if (progressBarHideTimerRef.current) clearTimeout(progressBarHideTimerRef.current);

    let runningTotal = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 0; i < STEP_DURATIONS_MS.length - 1; i++) {
      runningTotal += STEP_DURATIONS_MS[i];
      const nextProgress = STEP_PROGRESS_START[i + 1];
      const delay = runningTotal;
      timers.push(setTimeout(() => setProgressPct(nextProgress), delay));
    }

    return () => {
      for (const t of timers) clearTimeout(t);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstBuildActive]);

  // When WC confirms live — jump progress bar to 100% then hide it after 600ms
  const prevWcReadyRef = useRef(wcReadyConfirmed);
  useEffect(() => {
    const wasReady = prevWcReadyRef.current;
    prevWcReadyRef.current = wcReadyConfirmed;
    if (!wasReady && wcReadyConfirmed && showProgressBar) {
      setProgressPct(100);
      if (progressBarHideTimerRef.current) clearTimeout(progressBarHideTimerRef.current);
      progressBarHideTimerRef.current = setTimeout(() => {
        setShowProgressBar(false);
        progressBarHideTimerRef.current = null;
      }, 600);
    }
  }, [wcReadyConfirmed, showProgressBar]);

  // ── BEO-454: Preview iframe fade-in on first reveal ─────────────────────
  const [iframeFadeIn, setIframeFadeIn] = useState(false);
  const prevShowLoadingOverlayRef = useRef(showLoadingOverlay);
  useEffect(() => {
    const wasLoading = prevShowLoadingOverlayRef.current;
    prevShowLoadingOverlayRef.current = showLoadingOverlay;
    if (wasLoading && !showLoadingOverlay) {
      setIframeFadeIn(true);
      const t = setTimeout(() => setIframeFadeIn(false), 400);
      return () => clearTimeout(t);
    }
  }, [showLoadingOverlay]);

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
      <div className="flex flex-shrink-0 items-center gap-2 border-b border-[#e5e5e5] bg-[#f5f5f5] px-3 py-2">
        <div className="flex gap-1.5">
          <div className="h-3 w-3 rounded-full bg-[#ff5f57]" />
          <div className="h-3 w-3 rounded-full bg-[#febc2e]" />
          <div className="h-3 w-3 rounded-full bg-[#28c840]" />
        </div>
        <div className="flex flex-1 items-center gap-2 rounded-md border border-[#e5e5e5] bg-white px-3 py-1">
          <span className="flex-1 text-xs text-[#9ca3af]">{urlBarText}</span>
          {wcStatus === "ready" && isAiCustomising && (
            <span className="flex items-center gap-1 rounded-full bg-[#a855f7]/10 px-1.5 py-0.5 text-[10px] font-medium text-[#a855f7]">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#a855f7]" />
              Updating…
            </span>
          )}
          {wcStatus === "ready" && !isAiCustomising && !isFixing && (
            <span className="flex items-center gap-1 text-[10px] font-medium text-[#22c55e]">
              <Zap size={9} />
              Live
            </span>
          )}
          {isFixing && (
            <span className="flex items-center gap-1 text-[10px] font-medium text-[#f59e0b]">
              <Zap size={9} className="animate-pulse" />
              Fixing…
            </span>
          )}
          {(wcStatus === "booting" || wcStatus === "installing" || wcStatus === "starting") && (
            <span className="text-[10px] text-[#9ca3af]">{progressMessage}</span>
          )}
        </div>
      </div>
      <div className="relative flex-1 overflow-hidden">
        {/* iframe — always mounted when activeFrame exists (stable key for HMR).
            Visibility is controlled below; overlay hides it while WC isn't ready. */}
        {activeFrame && (
          <iframe
            ref={useWebContainer ? wcIframeRef : undefined}
            key={activeFrame.key}
            allow="clipboard-read; clipboard-write"
            className={cn(
              "absolute inset-0 h-full w-full bg-white",
              iframeFadeIn && "preview-fade-in",
            )}
            style={{ visibility: (showLoadingOverlay || (isBuilding && !wcReadyConfirmed)) ? "hidden" : "visible" }}
            referrerPolicy="no-referrer"
            sandbox="allow-downloads allow-forms allow-modals allow-pointer-lock allow-popups allow-same-origin allow-scripts"
            src={activeFrame.src}
            srcDoc={activeFrame.srcDoc}
            title="Beomz Studio Preview"
          />
        )}

        {/* Loading overlay — shown while WC is booting or mid-HMR.
            Layered ON TOP of iframe so the iframe can keep its stable mount. */}
        {showLoadingOverlay && (
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{ background: "#060612" }}
          >
            <div className="flex flex-col items-center gap-4">
              <div className="relative flex h-16 w-16 items-center justify-center">
                <div className="absolute inset-2 animate-spin rounded-full border-2 border-transparent border-t-[#F97316]" />
                <span className="text-xl font-bold text-[#F97316]">B</span>
              </div>
              <div className="text-center">
                <p className="text-sm text-[#9ca3af]">
                  Starting preview…
                </p>
                <p className="mt-1 text-xs text-[#6b7280]">{progressMessage}</p>
              </div>
            </div>
          </div>
        )}

        {/* BEO-454: Polished error state — reason + retry + no credits charged note */}
        {buildFailed && (
          <div className="absolute inset-0 flex items-center justify-center bg-white">
            <div className="flex max-w-sm flex-col items-center gap-4 px-6 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border-2 border-orange-200 bg-orange-50">
                <AlertTriangle className="h-5 w-5 text-orange-500" />
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-sm font-semibold text-[#1a1a1a]">Build ran into an issue</p>
                {buildErrorMessage && (
                  <p className="text-xs leading-relaxed text-[#6b7280]">{buildErrorMessage}</p>
                )}
              </div>
              <div className="flex gap-2">
                {onRetry && (
                  <button
                    onClick={onRetry}
                    className="rounded-lg bg-[#F97316] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#EA580C]"
                  >
                    Retry
                  </button>
                )}
                <button className="rounded-lg border border-[#e5e5e5] bg-white px-4 py-2 text-xs font-medium text-[#6b7280] transition-colors hover:bg-[#f9f9f9]">
                  Report issue
                </button>
              </div>
              <p className="text-[11px] text-[#9ca3af]">No credits were charged</p>
            </div>
          </div>
        )}

        {/* Empty states — only when no activeFrame, not loading, and not failed */}
        {!activeFrame && !showLoadingOverlay && !buildFailed && files && files.length > 0 && (
          <div className="flex h-full items-center justify-center bg-white">
            <div className="flex flex-col items-center gap-3 text-center px-6">
              <p className="text-sm font-medium text-[#6b7280]">Preview unavailable</p>
              <p className="text-xs text-[#9ca3af]">Your files are ready in the Code tab</p>
            </div>
          </div>
        )}
        {!activeFrame && !showLoadingOverlay && !buildFailed && (!files || files.length === 0) && (
          <div className="flex h-full items-center justify-center bg-white">
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
              <div className="relative" style={{ width: `${vpW}px`, height: `${vpH}px` }}>
                <iframe
                  ref={useWebContainer ? wcIframeRef : undefined}
                  key={useWebContainer ? `${activeFrame.key}:${viewMode}` : `${activeFrame.key}:${viewMode}:${refreshToken}`}
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
                    height: `${vpH}px`,
                    visibility: (showLoadingOverlay || (isBuilding && !wcReadyConfirmed)) ? "hidden" : "visible",
                  }}
                  sandbox="allow-downloads allow-forms allow-modals allow-pointer-lock allow-popups allow-same-origin allow-scripts"
                  title={`${viewMode} preview`}
                />
                {showLoadingOverlay && (
                  <div
                    className="absolute inset-0 flex flex-col items-center justify-center gap-4"
                    style={{ background: "#060612", borderRadius: "inherit" }}
                  >
                    <div className="relative flex h-14 w-14 items-center justify-center">
                      <div className="absolute inset-2 animate-spin rounded-full border-2 border-transparent border-t-[#F97316]" />
                      <span className="text-lg font-bold text-[#F97316]">B</span>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-[#9ca3af]">
                        Starting preview…
                      </p>
                      <p className="mt-1 text-xs text-[#6b7280]">{progressMessage}</p>
                    </div>
                  </div>
                )}
              </div>
            ) : showLoadingOverlay ? (
              <div
                className="flex h-full flex-col items-center justify-center gap-4"
                style={{ background: "#060612" }}
              >
                <div className="relative flex h-14 w-14 items-center justify-center">
                  <div className="absolute inset-2 animate-spin rounded-full border-2 border-transparent border-t-[#F97316]" />
                  <span className="text-lg font-bold text-[#F97316]">B</span>
                </div>
                <div className="text-center">
                  <p className="text-sm text-[#9ca3af]">Starting preview…</p>
                  <p className="mt-1 text-xs text-[#6b7280]">{progressMessage}</p>
                </div>
              </div>
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
      {/* BEO-454: 2px orange progress bar at very top of preview panel */}
      {showProgressBar && (
        <div
          className="absolute left-0 top-0 z-30 h-[2px] bg-[#F97316]"
          style={{
            width: `${progressPct}%`,
            transition: "width 0.6s ease-out",
          }}
        />
      )}
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
      <div className={cn("relative min-h-0 flex-1 overflow-auto", viewMode !== "web" && "p-4 md:p-6")}>
        {viewMode === "web" ? renderWebView() : renderFramedView()}
      </div>
    </div>
  );
}
