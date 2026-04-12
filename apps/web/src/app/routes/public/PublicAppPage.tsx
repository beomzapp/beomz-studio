/**
 * PublicAppPage — Renders a published app at /p/:slug.
 * No auth required. Boots WebContainer with project files and shows full-viewport preview.
 */
import { useEffect, useState, useRef } from "react";
import { getPublicProject, type PublicProjectResponse } from "../../../lib/api";
import type { StudioFile, TemplateId } from "@beomz-studio/contracts";
import {
  buildPreviewFileTree,
  getOrBootWebContainer,
  isWebContainerSupported,
  type DbEnv,
} from "../../../lib/webcontainer";

type PageState = "loading" | "not-found" | "unsupported" | "booting" | "installing" | "ready" | "error";

export function PublicAppPage({ slug }: { slug: string }) {
  const [state, setState] = useState<PageState>("loading");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("App");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const bootedRef = useRef(false);

  useEffect(() => {
    if (!slug) {
      setState("not-found");
      return;
    }

    if (!isWebContainerSupported()) {
      setState("unsupported");
      return;
    }

    let cancelled = false;

    (async () => {
      // 1. Fetch project data
      let data: PublicProjectResponse;
      try {
        data = await getPublicProject(slug);
      } catch {
        if (!cancelled) setState("not-found");
        return;
      }

      if (cancelled) return;

      setProjectName(data.projectName);
      document.title = `${data.projectName} — Built with Beomz`;

      // Prevent double-boot on StrictMode
      if (bootedRef.current) return;
      bootedRef.current = true;

      // 2. Boot WebContainer
      setState("booting");
      let wc;
      try {
        const instance = await getOrBootWebContainer();
        wc = instance.wc;
      } catch (err) {
        if (!cancelled) {
          setErrorMessage(err instanceof Error ? err.message : "Failed to start runtime");
          setState("error");
        }
        return;
      }

      if (cancelled) return;

      // 3. Build file tree with DB credentials if present
      const dbEnv: DbEnv | null = data.dbCredentials
        ? {
            url: data.dbCredentials.supabaseUrl,
            anonKey: data.dbCredentials.supabaseAnonKey,
            dbSchema: data.dbCredentials.schemaName,
            nonce: data.dbCredentials.nonce ?? "",
          }
        : null;

      const studioFiles: StudioFile[] = data.files.map((f) => ({
        path: f.path,
        content: f.content,
        kind: "generated" as const,
        language: f.path.endsWith(".css") ? "css" : "typescript",
        source: "ai" as const,
        locked: false,
      }));

      const fileTree = buildPreviewFileTree(
        studioFiles,
        {
          id: data.projectId,
          name: data.projectName,
          templateId: (data.templateId ?? "blank-canvas") as TemplateId,
        },
        dbEnv,
      );

      // 4. Mount files
      await wc.mount(fileTree);

      if (cancelled) return;

      // 5. npm install
      setState("installing");
      const installProcess = await wc.spawn("npm", ["install"]);
      const installCode = await installProcess.exit;
      if (installCode !== 0) {
        if (!cancelled) {
          setErrorMessage("Failed to install dependencies");
          setState("error");
        }
        return;
      }

      if (cancelled) return;

      // 6. Start dev server
      const devProcess = await wc.spawn("npm", ["run", "dev"]);

      // Listen for server-ready URL
      wc.on("server-ready", (_port: number, url: string) => {
        if (!cancelled) {
          setPreviewUrl(url);
          setState("ready");
        }
      });

      // Also read stderr for errors
      devProcess.output.pipeTo(
        new WritableStream({
          write(chunk) {
            // Log for debugging
            console.log("[PublicApp]", chunk);
          },
        }),
      ).catch(() => {});
    })();

    return () => {
      cancelled = true;
    };
  }, [slug]);

  // Loading states
  if (state === "loading" || state === "booting" || state === "installing") {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-[#faf9f6]">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#F97316] border-t-transparent" />
          <p className="text-sm text-[#6b7280]">
            {state === "loading"
              ? "Loading app..."
              : state === "booting"
                ? "Starting runtime..."
                : "Installing dependencies..."}
          </p>
        </div>
      </div>
    );
  }

  if (state === "not-found") {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-[#faf9f6]">
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="text-lg font-semibold text-[#1a1a1a]">App not found</p>
          <p className="text-sm text-[#6b7280]">
            This app may have been unpublished or the URL is incorrect.
          </p>
          <a
            href="https://beomz.ai"
            className="mt-3 rounded-lg bg-[#F97316] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#ea6c0e]"
          >
            Go to Beomz
          </a>
        </div>
      </div>
    );
  }

  if (state === "unsupported") {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-[#faf9f6]">
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="text-lg font-semibold text-[#1a1a1a]">Browser not supported</p>
          <p className="max-w-sm text-sm text-[#6b7280]">
            This app requires a modern browser with SharedArrayBuffer support.
            Please try Chrome, Edge, or Firefox.
          </p>
        </div>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-[#faf9f6]">
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="text-lg font-semibold text-[#1a1a1a]">Something went wrong</p>
          <p className="text-sm text-[#6b7280]">{errorMessage || "Failed to load app"}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-3 rounded-lg bg-[#F97316] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#ea6c0e]"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Ready — full viewport iframe
  return (
    <div className="relative h-screen w-screen">
      {previewUrl && (
        <iframe
          src={previewUrl}
          title={projectName}
          className="h-full w-full border-0"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
        />
      )}

      {/* "Built with Beomz" badge */}
      <a
        href="https://beomz.ai"
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-3 right-3 z-50 flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-xs font-medium text-[#6b7280] shadow-sm backdrop-blur-sm transition-colors hover:text-[#1a1a1a]"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-[#F97316]">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
          <path d="M8 12l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Built with Beomz
      </a>
    </div>
  );
}
