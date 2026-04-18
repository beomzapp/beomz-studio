import { useCallback, useEffect, useRef, useState } from "react";

import type { Project, StudioFile } from "@beomz-studio/contracts";

import {
  buildPreviewFileTree,
  getOrBootWebContainer,
  isWebContainerSupported,
  type DbEnv,
  type WcInstance,
  type WcStatus,
} from "../lib/webcontainer";
import {
  wcCacheGetFiles,
  wcCacheSetFiles,
  wcCacheGetNodeModules,
  wcCacheSetNodeModules,
  wcCacheDeleteNodeModules,
} from "../lib/wcCache";
import { fixFile } from "../lib/api";

export type { WcStatus };

export interface WcPreviewState {
  status: WcStatus;
  previewUrl: string | null;
  progressMessage: string;
  isFixing: boolean;
}

// Eagerly kick off the WebContainer boot + npm install as soon as the hook
// mounts — this runs in parallel with the AI generation (30-60s) so by the
// time files arrive the sandbox is already warm.
export function useWebContainerPreview(
  files: readonly StudioFile[] | null | undefined,
  project: Pick<Project, "id" | "name" | "templateId"> | null | undefined,
  onFilesWritten?: () => void,
  dbEnv?: DbEnv | null,
  generationId?: string | null,
  /** BEO-391: fired only when Vite binds the dev port (not on every HMR write). */
  onServerReady?: () => void,
): WcPreviewState {
  const [status, setStatus] = useState<WcStatus>("idle");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [progressMessage, setProgressMessage] = useState("Preparing…");

  const [isFixing, setIsFixing] = useState(false);

  const instanceRef = useRef<WcInstance | null>(null);
  const viteStartedRef = useRef(false);
  const prevFilesRef = useRef<readonly StudioFile[] | null>(null);
  const fixAttemptsRef = useRef<Record<string, number>>({});

  // BEO-202: refs for the 15s stale-cache fallback.
  // cacheTimeoutIdRef  — setTimeout handle; cleared when server-ready fires.
  // cacheFallbackFnRef — the fallback fn; called on [FS] ERROR in output or timeout.
  const cacheTimeoutIdRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cacheFallbackFnRef = useRef<(() => void) | null>(null);
  // BEO-383: armCacheFallbackRef stores the armCacheFallback() function created
  // inside boot() so the post-boot generationId effect can also arm it.
  const armCacheFallbackRef = useRef<(() => void) | null>(null);
  // pendingNmExportRef — true after a fresh npm install; server-ready handler
  // exports + caches node_modules only after Vite confirms a healthy start,
  // preventing a bad binary from being written during a partially-settled FS.
  const pendingNmExportRef = useRef(false);

  // Live refs so the boot closure (which has [] deps and captures stale values)
  // can always read the most-recent files/project at any point in time.
  const filesRef = useRef(files);
  const projectRef = useRef(project);
  filesRef.current = files;
  projectRef.current = project;

  // Keep the latest onFilesWritten callback in a ref so startVite (which has
  // stable [] deps) can always call the current version without re-creating.
  const onFilesWrittenRef = useRef(onFilesWritten);
  onFilesWrittenRef.current = onFilesWritten;

  const onServerReadyRef = useRef(onServerReady);
  onServerReadyRef.current = onServerReady;

  // Keep the latest dbEnv in a ref so startVite can always use the current value.
  const dbEnvRef = useRef(dbEnv);
  dbEnvRef.current = dbEnv;

  // BEO-375: keep generationId in a ref for access inside stable closures.
  const generationIdRef = useRef(generationId);
  generationIdRef.current = generationId;

  // ── Start Vite + hot-reload when files change ─────────────────────────────
  // Defined before boot so boot() can reference it.
  const startVite = useCallback(
    async (
      instance: WcInstance,
      currentFiles: readonly StudioFile[],
      currentProject: Pick<Project, "id" | "name" | "templateId">,
    ) => {
      const { wc } = instance;

      // Mount the full file tree (scaffold + generated files + runtime.json + DB env).
      const tree = buildPreviewFileTree(currentFiles, currentProject, dbEnvRef.current);
      await wc.mount(tree);

      // BEO-375: persist source files to IndexedDB so the next page load can
      // skip the API round-trip and mount immediately while npm install is warm.
      const gId = generationIdRef.current;
      if (gId) {
        void wcCacheSetFiles(currentProject.id, gId, currentFiles);
      }

      if (!viteStartedRef.current) {
        // First time: start the dev server.
        viteStartedRef.current = true;
        setStatus("starting");
        setProgressMessage("Starting dev server…");

        const devProcess = await wc.spawn("npm", ["run", "dev"]);
        instance.devProcess = devProcess;

        // ── Listen to dev server output for Vite errors ──────────────────
        devProcess.output.pipeTo(new WritableStream({
          write: (chunk: string) => {
            // 1) Detect Vite oxc parse errors: [plugin:vite:oxc] or [PARSE_ERROR]
            if (chunk.includes("[plugin:vite:oxc]") || chunk.includes("[PARSE_ERROR]")) {
              const fileMatch = chunk.match(/at\s+(?:\/[^\s:]+\/)?(\S+\.tsx?):(\d+)/);
              const errorLines = chunk.split("\n").filter((l: string) =>
                l.includes("PARSE_ERROR") || l.includes("Unexpected") || l.includes("Expected") || l.includes("vite:oxc"),
              ).join(" ").trim();

              if (fileMatch) {
                const fileName = fileMatch[1].replace(/^.*\//, "");
                const errorMsg = errorLines || chunk.slice(0, 300);
                void handleViteError(wc, fileName, errorMsg);
              }
            }

              // 2) Detect import resolution errors:
              //    "Failed to resolve import "X" from "Y.tsx""
              //    "[plugin:vite:import-analysis] Failed to resolve import"
              //    "Could not resolve "X""
              if (
                chunk.includes("Failed to resolve import") ||
                chunk.includes("Could not resolve") ||
                chunk.includes("[plugin:vite:import-analysis]")
              ) {
                // Try to extract the source file from 'from "file.tsx"'
                const fromMatch = chunk.match(/from\s+"([^"]+\.tsx?)"/);
                const resolveMatch = chunk.match(/(?:resolve import|resolve)\s+"([^"]+)"/);
                const fileName = fromMatch
                  ? fromMatch[1].replace(/^.*\//, "")
                  : null;
                const errorMsg = chunk.split("\n").filter((l: string) =>
                  l.includes("resolve") || l.includes("import") || l.includes("Cannot find"),
                ).join(" ").trim() || chunk.slice(0, 300);

                if (fileName) {
                  void handleViteError(wc, fileName, errorMsg);
                } else if (resolveMatch) {
                  // No source file found — use the first .tsx file from the chunk
                  const anyFileMatch = chunk.match(/(\S+\.tsx?)/);
                  if (anyFileMatch) {
                    void handleViteError(wc, anyFileMatch[1].replace(/^.*\//, ""), errorMsg);
                  }
                }
              }

              // 3) Detect FS mount failures from a stale cached node_modules binary.
              //    If this fires the 15s timeout is also armed; either path triggers
              //    the same cache-bust fallback.
              if (chunk.includes("[FS]") && chunk.includes("ERROR") && cacheFallbackFnRef.current) {
                cacheFallbackFnRef.current();
              }
          },
        })).catch(() => { /* stream closed */ });

        wc.on("server-ready", (_port: number, url: string) => {
          // Cancel any pending stale-cache fallback — server came up cleanly.
          if (cacheTimeoutIdRef.current !== null) {
            clearTimeout(cacheTimeoutIdRef.current);
            cacheTimeoutIdRef.current = null;
          }
          cacheFallbackFnRef.current = null;
          // Export + cache node_modules only after Vite confirms a healthy start.
          // This is the only safe point — npm install may have settled but the FS
          // can still be in a bad state until Vite resolves its module graph.
          if (pendingNmExportRef.current) {
            pendingNmExportRef.current = false;
            wc.export("node_modules", { format: "binary" })
              .then((binary) => wcCacheSetNodeModules(binary as Uint8Array))
              .catch((err) => console.warn("[wc-cache] Failed to cache node_modules:", err));
          }
          setPreviewUrl(url);
          setStatus("ready");
          // Signal readiness so callers can run their reveal sequence
          // (e.g. 400ms delay before making the iframe visible).
          // Without this, isAiCustomising never clears on new builds
          // and the iframe flashes errors while Vite is still compiling.
          onFilesWrittenRef.current?.();
          onServerReadyRef.current?.();
        });
      } else {
        // Subsequent file write: Vite is already running; wc.mount has landed
        // the new files and HMR will pick them up. Signal the caller so it can
        // reveal the preview after a short HMR propagation window.
        onFilesWrittenRef.current?.();
      }
    },
    [],
  );

  // ── Self-healing: fix Vite parse errors via AI ────────────────────────────
  const handleViteError = useCallback(
    async (wc: import("@webcontainer/api").WebContainer, fileName: string, errorMessage: string) => {
      const MAX_ATTEMPTS = 2;
      const attempts = fixAttemptsRef.current[fileName] ?? 0;
      if (attempts >= MAX_ATTEMPTS) {
        console.warn(`[self-heal] Max fix attempts reached for ${fileName}`);
        return;
      }
      fixAttemptsRef.current[fileName] = attempts + 1;

      // Read the broken file from WebContainer
      const readPaths = [
        `apps/web/src/app/generated/${fileName}`,
        `src/${fileName}`,
        fileName,
      ];
      let fileContent: string | null = null;
      for (const p of readPaths) {
        try {
          fileContent = await wc.fs.readFile(p, "utf-8");
          break;
        } catch {
          continue;
        }
      }
      if (!fileContent) {
        console.warn(`[self-heal] Could not read ${fileName} from WebContainer`);
        return;
      }

      setIsFixing(true);
      setProgressMessage("Fixing a code issue…");

      try {
        const fixedContent = await fixFile({
          buildId: projectRef.current?.id ?? "unknown",
          filePath: fileName,
          errorMessage,
          fileContent,
        });

        // Write the fixed file back to WebContainer
        const paths = [
          `apps/web/src/app/generated/${fileName}`,
          `src/${fileName}`,
        ];
        for (const p of paths) {
          try {
            await wc.fs.readFile(p, "utf-8"); // check it exists
            await wc.fs.writeFile(p, fixedContent);
            break;
          } catch {
            continue;
          }
        }
      } catch (err) {
        console.error("[self-heal] Fix failed:", err instanceof Error ? err.message : err);
      } finally {
        setIsFixing(false);
      }
    },
    [],
  );

  // ── Eager boot + npm install ──────────────────────────────────────────────
  useEffect(() => {
    if (!isWebContainerSupported()) return;

        let cancelled = false;

    async function boot() {
      try {
        setStatus("booting");
        setProgressMessage("Booting sandbox…");

        const instance = await getOrBootWebContainer();
        if (cancelled) return;

        instanceRef.current = instance;

        let usedCachedNm = false;

        if (instance.installedAt === null) {
          // ── BEO-375: try restoring node_modules from IndexedDB cache ──
          const cachedNm = await wcCacheGetNodeModules();
          if (cancelled) return;

          if (cachedNm) {
            // Cache hit: mount the binary snapshot — node_modules is instantly
            // available without running npm install.
            // IMPORTANT: export("node_modules") stores paths relative to that
            // directory, so mountPoint must be set to restore them at the right
            // location. Without it the contents land at fs root and npm can't
            // find node_modules/.bin/vite, silently killing the dev server.
            setStatus("installing");
            setProgressMessage("Restoring packages from cache…");
            await instance.wc.mount(cachedNm, { mountPoint: "node_modules" });
            if (cancelled) return;

            // BEO-383: verify the mount actually worked. [FS] ERROR invalid mount
            // point fires from the WebContainer filesystem worker directly into the
            // browser console — it NEVER reaches devProcess.output, so the
            // string-match detection on that stream can never catch it.
            // A readdir check immediately after mount is the only reliable path.
            let nmMountOk = false;
            try {
              const entries = await instance.wc.fs.readdir("node_modules");
              nmMountOk = entries.length > 0;
            } catch {
              nmMountOk = false;
            }

            if (nmMountOk) {
              instance.installedAt = Date.now();
              usedCachedNm = true;
              console.log("[wc-cache] node_modules restored from IndexedDB");
            } else {
              console.warn("[wc-cache] node_modules mount invalid — clearing cache for fresh install");
              await wcCacheDeleteNodeModules();
              // usedCachedNm stays false → falls through to fresh install below
            }
          }

          if (!usedCachedNm) {
            // Cache miss or mount verification failure — run npm install then
            // export and store the snapshot.
            await instance.wc.mount({
              "package.json": {
                file: {
                  contents: JSON.stringify(
                    {
                      name: "beomz-preview",
                      private: true,
                      type: "module",
                      scripts: { dev: "vite" },
                      dependencies: {
                        "@supabase/supabase-js": "^2.39.0",
                        clsx: "^2.0.0",
                        "framer-motion": "^11.0.0",
                        "lucide-react": "^0.400.0",
                        react: "^19.2.0",
                        "react-dom": "^19.2.0",
                        "react-icons": "^5.5.0",
                        "react-router-dom": "^7.0.0",
                        "tailwind-merge": "^2.0.0",
                      },
                      devDependencies: {
                        "@tailwindcss/vite": "^4.2.2",
                        "@types/react": "^19.2.2",
                        "@types/react-dom": "^19.2.2",
                        "@vitejs/plugin-react": "^6.0.1",
                        tailwindcss: "^4.2.2",
                        typescript: "^5.9.3",
                        vite: "^8.0.1",
                      },
                    },
                    null,
                    2,
                  ),
                },
              },
            });
            if (cancelled) return;

            setStatus("installing");
            setProgressMessage("Installing packages…");

            const install = await instance.wc.spawn("npm", ["install"]);
            const exitCode = await install.exit;
            if (cancelled) return;

            if (exitCode !== 0) {
              setStatus("error");
              setProgressMessage("Package installation failed.");
              return;
            }

            instance.installedAt = Date.now();

            // Flag that node_modules needs caching. The actual export happens
            // inside server-ready, after Vite confirms the install is healthy.
            pendingNmExportRef.current = true;
          }
        }

        // Read from live refs, NOT from the stale closure capture — this is
        // critical for the page-reload case where files arrive from the API
        // while npm install is in progress and the closure still sees null.
        const currentFiles = filesRef.current;
        const currentProject = projectRef.current;

        // BEO-202: Helper to arm the 15s stale-cache fallback after a cached
        // mount. Called once per boot if usedCachedNm is true. If server-ready
        // fires first the timeout is cancelled cleanly.
        function armCacheFallback() {
          if (!usedCachedNm) return;
          let fired = false;
          const runCacheFallback = async () => {
            if (fired || cancelled) return;
            fired = true;
            cacheFallbackFnRef.current = null;
            if (cacheTimeoutIdRef.current !== null) {
              clearTimeout(cacheTimeoutIdRef.current);
              cacheTimeoutIdRef.current = null;
            }
            console.warn("[wc-cache] Stale node_modules cache — running fresh npm install");
            await wcCacheDeleteNodeModules();
            instance.devProcess?.kill();
            viteStartedRef.current = false;
            instance.installedAt = null;
            setStatus("installing");
            setProgressMessage("Installing packages…");
            const install = await instance.wc.spawn("npm", ["install"]);
            const exitCode = await install.exit;
            if (cancelled) return;
            if (exitCode !== 0) {
              setStatus("error");
              setProgressMessage("Package installation failed.");
              return;
            }
            instance.installedAt = Date.now();
            // Flag for server-ready to export + cache after Vite confirms healthy.
            pendingNmExportRef.current = true;
            const fbFiles = filesRef.current;
            const fbProject = projectRef.current;
            if (fbFiles && fbFiles.length > 0 && fbProject?.id) {
              void startVite(instance, fbFiles, fbProject);
            }
          };
          cacheFallbackFnRef.current = runCacheFallback;
          cacheTimeoutIdRef.current = setTimeout(() => void runCacheFallback(), 15_000);
        }
        // BEO-383: expose this to the post-boot generationId effect which
        // can't call armCacheFallback() directly (defined inside boot()).
        armCacheFallbackRef.current = armCacheFallback;

        if (currentFiles && currentFiles.length > 0 && currentProject?.id) {
          void startVite(instance, currentFiles, currentProject);
          armCacheFallback();
        } else {
          // No live files yet — check if IndexedDB has a cached build for this project.
          // BEO-375: this lets the preview warm up before the API responds.
          const gId = generationIdRef.current;
          const proj = currentProject;
          if (proj?.id && gId) {
            const cached = await wcCacheGetFiles(proj.id, gId);
            if (cancelled) return;
            if (cached && cached.length > 0 && !filesRef.current?.length) {
              console.log("[wc-cache] Mounting source files from IndexedDB cache");
              void startVite(instance, cached as StudioFile[], proj);
              armCacheFallback();
              return;
            }
          }
          setStatus("idle");
          setProgressMessage("Waiting for build…");
        }
      } catch (err) {
        if (cancelled) return;
        setStatus("error");
        setProgressMessage(
          err instanceof Error ? err.message : "WebContainer failed to start.",
        );
      }
    }

    void boot();

    return () => {
      cancelled = true;
      if (cacheTimeoutIdRef.current !== null) {
        clearTimeout(cacheTimeoutIdRef.current);
        cacheTimeoutIdRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run exactly once per component mount

  // ── BEO-375: when generationId becomes known after boot finishes ──────────
  // Handle the case where the WC is already warm (installedAt set, no live files)
  // but generationId arrived after the boot effect completed.
  useEffect(() => {
    if (!generationId || !project?.id) return;

    const instance = instanceRef.current;
    if (!instance || instance.installedAt === null) return;

    // Real files from the API already landed — no need for cache.
    if (filesRef.current && filesRef.current.length > 0) return;

    void wcCacheGetFiles(project.id, generationId).then((cached) => {
      if (!cached || cached.length === 0) return;
      if (filesRef.current && filesRef.current.length > 0) return; // files arrived in meantime
      const inst = instanceRef.current;
      if (!inst) return;
      console.log("[wc-cache] Mounting source files from IndexedDB (post-boot)");
      void startVite(inst, cached as StudioFile[], project);
      // BEO-383: arm the stale-cache fallback — armCacheFallback() was only
      // called inside boot() for paths with live/cached files; this post-boot
      // path bypassed it, leaving the 15s backstop unarmed.
      armCacheFallbackRef.current?.();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generationId, project?.id]);

  // ── React to files arriving / changing ───────────────────────────────────
  useEffect(() => {
    if (!files || files.length === 0 || !project?.id) return;
    if (files === prevFilesRef.current) return;
    prevFilesRef.current = files;

    const instance = instanceRef.current;
    if (!instance || instance.installedAt === null) {
      // Boot effect hasn't finished yet — it will call startVite when done.
      return;
    }

    void startVite(instance, files, project);
  }, [files, project, project?.id, startVite]);

  return { status, previewUrl, progressMessage, isFixing };
}
