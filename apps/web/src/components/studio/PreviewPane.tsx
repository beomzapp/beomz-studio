import { startTransition, useEffect, useEffectEvent, useMemo, useState } from "react";
import type { CreatePreviewSessionResponse, Project, StudioFile } from "@beomz-studio/contracts";
import { Bug, Loader2, MonitorSmartphone } from "lucide-react";

import { cn } from "../../lib/cn";
import { createOrResumePreviewSession } from "../../lib/api";
import { buildStudioPreviewHtml } from "../../lib/studio-preview";

interface PreviewPaneProps {
  files?: readonly StudioFile[] | null;
  generationId?: string | null;
  previewEntryPath?: string | null;
  project?: Pick<Project, "id" | "name" | "templateId"> | null;
  refreshToken?: number;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function buildInlineFallbackDoc(message: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      :root {
        color-scheme: dark;
        font-family: "Geist Sans", system-ui, sans-serif;
      }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background:
          radial-gradient(circle at top, rgba(249, 115, 22, 0.2), transparent 42%),
          linear-gradient(160deg, #050816 0%, #0d1630 48%, #050816 100%);
        color: rgba(255, 255, 255, 0.92);
      }
      div {
        width: min(540px, calc(100vw - 32px));
        padding: 28px;
        border-radius: 28px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        background: rgba(13, 20, 42, 0.94);
        box-shadow: 0 24px 80px rgba(0, 0, 0, 0.35);
      }
      strong {
        display: block;
        margin-bottom: 12px;
        color: #f97316;
        text-transform: uppercase;
        letter-spacing: 0.18em;
        font-size: 11px;
      }
      p {
        margin: 0;
        line-height: 1.7;
        color: rgba(255, 255, 255, 0.7);
      }
    </style>
  </head>
  <body>
    <div>
      <strong>Preview fallback</strong>
      <p>${message}</p>
    </div>
  </body>
</html>`;
}

export function PreviewPane({
  files,
  generationId,
  previewEntryPath,
  project,
  refreshToken = 0,
}: PreviewPaneProps) {
  const [hasFirstFrame, setHasFirstFrame] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [previewMode, setPreviewMode] = useState<"inline" | "remote">("inline");
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [remoteResponse, setRemoteResponse] = useState<CreatePreviewSessionResponse | null>(null);

  const inlineFrame = useMemo(() => {
    if (!project || !files || files.length === 0) {
      return null;
    }

    try {
      return {
        error: null,
        key: `inline:${project.id}:${generationId ?? "draft"}:${refreshToken}`,
        src: undefined,
        srcDoc: buildStudioPreviewHtml({
          files,
          previewEntryPath,
          project,
        }),
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Inline preview failed to render.";

      return {
        error: message,
        key: `inline:${project.id}:error:${generationId ?? "draft"}:${refreshToken}`,
        src: undefined,
        srcDoc: buildInlineFallbackDoc(message),
      };
    }
  }, [files, generationId, previewEntryPath, project, refreshToken]);

  const remoteFrame = useMemo(() => {
    if (remoteResponse?.session.provider === "e2b" && remoteResponse.session.url) {
      return {
        key: `${remoteResponse.session.id}:${remoteResponse.session.url}`,
        src: remoteResponse.session.url,
        srcDoc: undefined,
      };
    }

    if (remoteResponse?.fallbackHtml) {
      return {
        key: `${remoteResponse.session.id}:fallback`,
        src: undefined,
        srcDoc: remoteResponse.fallbackHtml,
      };
    }

    return null;
  }, [remoteResponse]);

  const activeFrame =
    previewMode === "remote" && remoteFrame
      ? remoteFrame
      : inlineFrame;

  const requestPreviewSession = useEffectEvent(async () => {
    if (isLoading) {
      return;
    }

    if (!project?.id || !isUuid(project.id)) {
      return;
    }

    setIsLoading(true);
    setRemoteError(null);

    try {
      const nextResponse = await createOrResumePreviewSession({
        generationId: generationId ?? undefined,
        projectId: project.id,
      });

      startTransition(() => {
        setHasFirstFrame(false);
        setPreviewMode("remote");
        setRemoteResponse(nextResponse);
      });
    } catch (requestError) {
      const message =
        requestError instanceof Error ? requestError.message : "Remote preview failed to load.";

      startTransition(() => {
        setPreviewMode("inline");
        setRemoteError(message);
      });
    } finally {
      setIsLoading(false);
    }
  });

  useEffect(() => {
    setHasFirstFrame(false);
  }, [activeFrame?.key]);

  useEffect(() => {
    function handlePreviewMessage(event: MessageEvent) {
      if (event.data?.type !== "beomz-preview-ready") {
        return;
      }

      setHasFirstFrame(true);
    }

    window.addEventListener("message", handlePreviewMessage);
    return () => {
      window.removeEventListener("message", handlePreviewMessage);
    };
  }, []);

  useEffect(() => {
    setPreviewMode("inline");
    setRemoteError(null);
    setRemoteResponse(null);
    setHasFirstFrame(false);
  }, [generationId, project?.id]);

  if (!project?.id) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-white/30">
        Start a build to launch the live preview.
      </div>
    );
  }

  const statusMessage =
    remoteError
    ?? inlineFrame?.error
    ?? (previewMode === "remote"
      ? "Launching remote debug preview."
      : "Rendering inline studio preview from the validated files.");

  return (
    <div className="relative h-full min-h-[340px] overflow-hidden bg-[#050816]">
      {activeFrame ? (
        <iframe
          key={activeFrame.key}
          allow="clipboard-read; clipboard-write"
          className="h-full w-full border-0"
          referrerPolicy="no-referrer"
          sandbox="allow-downloads allow-forms allow-modals allow-pointer-lock allow-popups allow-same-origin allow-scripts"
          src={activeFrame.src}
          srcDoc={activeFrame.srcDoc}
          title="Beomz Studio Preview"
          onLoad={() => setHasFirstFrame(true)}
        />
      ) : (
        <div className="flex h-full items-center justify-center text-sm text-white/25">
          Start a build to see the inline preview.
        </div>
      )}

      <div
        className={cn(
          "pointer-events-none absolute inset-0 transition-opacity duration-300",
          hasFirstFrame && !isLoading ? "opacity-0" : "opacity-100",
        )}
      >
        <div className="flex h-full flex-col justify-between bg-[radial-gradient(circle_at_top,rgba(249,115,22,0.18),transparent_40%),linear-gradient(160deg,#050816_0%,#0d1630_48%,#050816_100%)] p-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-orange/80">
                <MonitorSmartphone size={14} />
                Preview
              </div>
              <div className="pointer-events-auto flex items-center gap-2">
                {previewMode === "remote" ? (
                  <button
                    type="button"
                    onClick={() => {
                      setPreviewMode("inline");
                      setHasFirstFrame(false);
                    }}
                    className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/75 transition hover:bg-white/[0.12]"
                  >
                    Use inline preview
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={!generationId || isLoading}
                    onClick={() => {
                      void requestPreviewSession();
                    }}
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/75 transition hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Bug size={12} />
                    Remote debug
                  </button>
                )}
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="h-28 rounded-3xl border border-white/10 bg-white/[0.03]" />
              <div className="h-28 rounded-3xl border border-white/10 bg-white/[0.03]" />
            </div>
            <div className="h-44 rounded-[28px] border border-white/10 bg-white/[0.04]" />
          </div>

          <div className="flex items-center gap-3 text-sm text-white/65">
            <Loader2 size={16} className={cn("text-orange", isLoading && "animate-spin")} />
            <span>{statusMessage}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
