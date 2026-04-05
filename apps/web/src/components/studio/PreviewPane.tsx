import { startTransition, useEffect, useEffectEvent, useMemo, useState } from "react";
import type { CreatePreviewSessionResponse } from "@beomz-studio/contracts";
import { Loader2, MonitorSmartphone } from "lucide-react";

import { cn } from "../../lib/cn";
import { createOrResumePreviewSession } from "../../lib/api";
import { supabase } from "../../lib/supabase";

interface PreviewPaneProps {
  generationId?: string | null;
  projectId?: string | null;
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
  generationId,
  projectId,
}: PreviewPaneProps) {
  const [error, setError] = useState<string | null>(null);
  const [hasFirstFrame, setHasFirstFrame] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [response, setResponse] = useState<CreatePreviewSessionResponse | null>(null);

  const activeFrame = useMemo(() => {
    if (response?.session.provider === "e2b" && response.session.url) {
      return {
        key: `${response.session.id}:${response.session.url}`,
        src: response.session.url,
        srcDoc: undefined,
      };
    }

    if (response?.fallbackHtml) {
      return {
        key: `${response.session.id}:fallback`,
        src: undefined,
        srcDoc: response.fallbackHtml,
      };
    }

    return null;
  }, [response]);

  const requestPreviewSession = useEffectEvent(async (opts?: { force?: boolean }) => {
    // Don't re-fire if a request is already in-flight.
    if (isLoading) {
      return;
    }

    // Don't re-fire from realtime events if we already have a resolved session
    // (E2B URL or local fallback). The realtime subscription writing to the
    // previews table would otherwise cause an infinite loop.
    if (!opts?.force && response && (response.session.url || response.fallbackHtml)) {
      return;
    }

    if (!projectId || !isUuid(projectId)) {
      setError(null);
      setHasFirstFrame(false);
      setIsLoading(false);
      setResponse(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const nextResponse = await createOrResumePreviewSession({
        generationId: generationId ?? undefined,
        projectId,
      });

      startTransition(() => {
        setHasFirstFrame(false);
        setResponse(nextResponse);
      });
    } catch (requestError) {
      const message =
        requestError instanceof Error ? requestError.message : "Preview failed to load.";

      startTransition(() => {
        setHasFirstFrame(false);
        setError(message);
        setResponse({
          error: message,
          fallbackHtml: buildInlineFallbackDoc(message),
          generationId: generationId ?? "local",
          runtime: {
            entryPath: "/",
            mode: "preview",
            navigation: [],
            project: {
              id: projectId,
              name: "Preview unavailable",
              templateId: "marketing-website",
            },
            provider: "local",
            routes: [],
            shell: "website",
            templateId: "marketing-website",
          },
          session: {
            createdAt: new Date().toISOString(),
            entryPath: "/",
            id: `local-${projectId}`,
            projectId,
            provider: "local",
            status: "running",
          },
        });
      });
    } finally {
      setIsLoading(false);
    }
  });

  useEffect(() => {
    void requestPreviewSession({ force: true });
  }, [generationId, projectId, requestPreviewSession]);

  useEffect(() => {
    if (!generationId) {
      return;
    }

    const channel = supabase
      .channel(`preview-pane-${generationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          filter: `id=eq.${generationId}`,
          schema: "public",
          table: "generations",
        },
        () => {
          startTransition(() => {
            void requestPreviewSession();
          });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          filter: `generation_id=eq.${generationId}`,
          schema: "public",
          table: "previews",
        },
        () => {
          startTransition(() => {
            void requestPreviewSession();
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [generationId, requestPreviewSession]);

  if (!projectId) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-white/30">
        Start a build to launch the live preview.
      </div>
    );
  }

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
          Preparing preview shell…
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
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-orange/80">
              <MonitorSmartphone size={14} />
              Preview
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="h-28 rounded-3xl border border-white/10 bg-white/[0.03]" />
              <div className="h-28 rounded-3xl border border-white/10 bg-white/[0.03]" />
            </div>
            <div className="h-44 rounded-[28px] border border-white/10 bg-white/[0.04]" />
          </div>

          <div className="flex items-center gap-3 text-sm text-white/65">
            <Loader2 size={16} className={cn("text-orange", isLoading && "animate-spin")} />
            <span>{error ?? "Launching the deterministic shell and waiting for the first frame."}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
