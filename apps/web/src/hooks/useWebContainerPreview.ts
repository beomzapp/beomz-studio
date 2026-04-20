import { useCallback, useEffect, useRef, useState } from "react";

import type { Project, StudioFile } from "@beomz-studio/contracts";

import {
  buildPreviewFileTree,
  buildShellFileTree,
  getOrBootWebContainer,
  isWebContainerSupported,
  WORKSPACE_PACKAGE_JSON,
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

// BEO-421: Stale stub filenames that Sonnet sometimes generates when shortening
// npm package paths to local relative imports. Deleted from the WebContainer
// before each new iteration so old broken files don't shadow the new build.
const STALE_FILENAMES_TO_DELETE = [
  "serverless.tsx", "serverless.ts",
  "supabase.tsx", "supabase.ts",
  "supabase-js.tsx", "supabase-js.ts",
  "ui.tsx", "ui.ts",
  "auth.tsx", "auth.ts",
  "db.tsx", "db.ts",
  "client.tsx", "client.ts",
  "neon.tsx", "neon.ts",
  "neon-auth.tsx", "neon-auth.ts",
  "neon-js.tsx", "neon-js.ts",
];

async function deleteStaleStubFiles(
  wc: import("@webcontainer/api").WebContainer,
  generatedDir: string,
): Promise<void> {
  for (const filename of STALE_FILENAMES_TO_DELETE) {
    try {
      await wc.fs.rm(`${generatedDir}/${filename}`);
    } catch {
      // File doesn't exist — ignore
    }
  }
}

export interface WcPreviewState {
  status: WcStatus;
  previewUrl: string | null;
  progressMessage: string;
  isFixing: boolean;
  /**
   * BEO-456 follow-up: true AFTER deliverFiles() has completed its first
   * wc.mount() with the real app files. PreviewPane uses this to gate the
   * 600ms wcReadyConfirmed timer so the iframe never becomes visible while
   * Vite is still serving the blank shell.
   */
  firstFilesDelivered: boolean;
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
  /** BEO-452: Neon connection string to re-inject after every hot-swap wc.mount(). */
  neonDbUrl?: string | null,
): WcPreviewState {
  const [status, setStatus] = useState<WcStatus>("idle");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [progressMessage, setProgressMessage] = useState("Preparing…");

  const [isFixing, setIsFixing] = useState(false);
  // BEO-456 follow-up: flips to true AFTER the first deliverFiles() call has
  // completed wc.mount() with the real app files. Exposed so PreviewPane can
  // gate wcReadyConfirmed on real delivery rather than server-ready timing.
  const [firstFilesDelivered, setFirstFilesDelivered] = useState(false);

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

  // BEO-456: server-ready fired (Vite bound its dev port).
  // deliverFiles waits for this before calling wc.mount() so the HMR watcher
  // is live. If server-ready hasn't fired yet when files arrive, we set
  // pendingDeliverRef and the server-ready handler runs deliverFiles.
  const serverReadyFiredRef = useRef(false);
  const pendingDeliverRef = useRef(false);
  // First-build real files have landed in the WC filesystem — from this point
  // every subsequent files-change goes through the iteration branch (stale
  // stub cleanup + wc.mount + HMR). Keeps first-build vs iteration semantics
  // explicit without reusing viteStartedRef for two concerns.
  const firstBuildDeliveredRef = useRef(false);

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

  // BEO-452: keep neonDbUrl in a ref so startVite ([] deps) reads the live value.
  const neonDbUrlRef = useRef(neonDbUrl);
  neonDbUrlRef.current = neonDbUrl;

  // BEO-375: keep generationId in a ref for access inside stable closures.
  const generationIdRef = useRef(generationId);
  generationIdRef.current = generationId;

  // ── BEO-456: Deliver real files to the WC + signal HMR ────────────────────
  // Uses the same path the iteration hot-swap uses: wc.mount(previewFileTree)
  // at root while Vite is running. Vite's file watcher picks up the change and
  // HMR-reloads. On first build we wait for server-ready (Vite's watcher must
  // be live) + a short settle delay before mounting so the FS worker doesn't
  // race with Vite's module-graph init. Iteration calls go through the same
  // function but skip the server-ready wait (it has long since fired).
  const deliverFiles = useCallback(
    async (
      instance: WcInstance,
      currentFiles: readonly StudioFile[],
      currentProject: Pick<Project, "id" | "name" | "templateId">,
    ) => {
      const { wc } = instance;

      // If Vite hasn't finished its initial bind yet, stage the delivery for
      // the server-ready handler. We read filesRef/projectRef there so we
      // pick up the freshest values if more arrived while we were waiting.
      if (!serverReadyFiredRef.current) {
        pendingDeliverRef.current = true;
        return;
      }

      // BEO-421: delete stale stub files from the previous build before
      // mounting new ones (iterations only — first delivery has nothing to
      // clean up).
      if (firstBuildDeliveredRef.current) {
        const firstFilePath = currentFiles[0]?.path
          .replaceAll("\\", "/")
          .replace(/^\.\//, "")
          .replace(/\/+/g, "/") ?? "";
        const generatedDir = firstFilePath.includes("/")
          ? firstFilePath.slice(0, firstFilePath.lastIndexOf("/"))
          : "";
        if (generatedDir) {
          await deleteStaleStubFiles(wc, generatedDir);
        }
      }

      const tree = buildPreviewFileTree(currentFiles, currentProject, dbEnvRef.current);
      await wc.mount(tree);

      // BEO-452: Re-inject Neon env vars after every hot-swap wc.mount() so
      // they survive HMR reload. mount() does not preserve files absent from
      // the tree.
      if (neonDbUrlRef.current) {
        const envLines = [
          `VITE_DATABASE_URL=${neonDbUrlRef.current}`,
          `VITE_PROJECT_ID=${currentProject.id}`,
        ];
        await wc.fs.writeFile(".env.local", envLines.join("\n"));
      }

      // BEO-375: persist source files to IndexedDB so the next page load can
      // skip the API round-trip and mount immediately while npm install is warm.
      const gId = generationIdRef.current;
      if (gId) {
        void wcCacheSetFiles(currentProject.id, gId, currentFiles);
      }

      const wasFirstBuild = !firstBuildDeliveredRef.current;
      firstBuildDeliveredRef.current = true;
      onFilesWrittenRef.current?.();

      // BEO-456 follow-up: signal PreviewPane only AFTER the real app files
      // have actually been mounted — this is the gate for starting the 600ms
      // wcReadyConfirmed timer so the iframe never reveals the blank shell.
      // Iterations are no-ops: firstFilesDelivered stays true across the
      // component lifetime so their wcReadyConfirmed behaviour is unchanged.
      if (wasFirstBuild) {
        setFirstFilesDelivered(true);
      }
    },
    [],
  );

  // ── BEO-456: Start Vite with a BLANK shell — no scaffold UI ───────────────
  // Mounts package.json/tsconfig/vite.config/index.html/blank main.tsx, spawns
  // npm run dev, wires the output stream (Vite error → self-heal, [FS] ERROR
  // → cache bust), and installs the server-ready listener. The real app files
  // are delivered later via deliverFiles(), either from the boot() finalizer
  // or from the files-change effect.
  const startViteShell = useCallback(
    async (instance: WcInstance) => {
      const { wc } = instance;

      if (viteStartedRef.current) return;
      viteStartedRef.current = true;

      await wc.mount(buildShellFileTree());

      setStatus("starting");
      setProgressMessage("Starting dev server…");

      const devProcess = await wc.spawn("npm", ["run", "dev"]);
      instance.devProcess = devProcess;

      devProcess.output.pipeTo(new WritableStream({
        write: (chunk: string) => {
          // 1) Vite oxc parse errors
          if (chunk.includes("[plugin:vite:oxc]") || chunk.includes("[PARSE_ERROR]")) {
            const pathMatch =
              chunk.match(/\[plugin:vite:oxc\]\s+([^\s:]+\.tsx?):\d+/) ??
              chunk.match(/File:\s*([^\s:]+\.tsx?):\d+/) ??
              chunk.match(/at\s+([^\s(]+\.tsx?):\d+/) ??
              chunk.match(/([^\s:]+\.tsx?):\d+/);
            const errorLines = chunk.split("\n").filter((l: string) =>
              l.includes("PARSE_ERROR") || l.includes("Unexpected") || l.includes("Expected") || l.includes("vite:oxc"),
            ).join(" ").trim();

            if (pathMatch) {
              const filePath = pathMatch[1];
              const errorMsg = errorLines || chunk.slice(0, 300);
              void handleViteError(wc, filePath, errorMsg);
            }
          }

          // 2) Import resolution errors
          if (
            chunk.includes("Failed to resolve import") ||
            chunk.includes("Could not resolve") ||
            chunk.includes("[plugin:vite:import-analysis]")
          ) {
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
              const anyFileMatch = chunk.match(/(\S+\.tsx?)/);
              if (anyFileMatch) {
                void handleViteError(wc, anyFileMatch[1].replace(/^.*\//, ""), errorMsg);
              }
            }
          }

          // 3) Stale node_modules cache → bust.
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
        if (pendingNmExportRef.current) {
          pendingNmExportRef.current = false;
          wc.export("node_modules", { format: "binary" })
            .then((binary) => wcCacheSetNodeModules(binary as Uint8Array))
            .catch((err) => console.warn("[wc-cache] Failed to cache node_modules:", err));
        }

        setPreviewUrl(url);
        setStatus("ready");
        serverReadyFiredRef.current = true;
        // BEO-391: fire as soon as Vite binds its port (shell preview is up).
        onServerReadyRef.current?.();

        // If files are already available (either arrived during Vite boot, or
        // restored from the IndexedDB cache), deliver them now. Short delay
        // lets Vite's chokidar watcher settle so the wc.mount() doesn't race
        // the module-graph init — prior "[FS] ERROR invalid mount point"
        // failures were caused by mounting too eagerly here.
        const latestFiles = filesRef.current;
        const latestProject = projectRef.current;
        const shouldDeliverNow =
          pendingDeliverRef.current ||
          (!firstBuildDeliveredRef.current && !!latestFiles?.length && !!latestProject?.id);
        if (shouldDeliverNow && latestFiles?.length && latestProject?.id) {
          pendingDeliverRef.current = false;
          setTimeout(() => {
            void deliverFiles(instance, latestFiles, latestProject);
          }, 400);
        }
      });
    },
    // handleViteError is referenced only inside async callbacks (output stream
    // and server-ready) so closure capture resolves at invocation time; listing
    // it here would trip TDZ at render time since it's declared below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deliverFiles],
  );

  // ── Self-healing: fix Vite parse errors via AI ────────────────────────────
  const handleViteError = useCallback(
    async (wc: import("@webcontainer/api").WebContainer, filePath: string, errorMessage: string) => {
      const MAX_ATTEMPTS = 2;
      const attempts = fixAttemptsRef.current[filePath] ?? 0;
      if (attempts >= MAX_ATTEMPTS) {
        console.warn(`[self-heal] Max fix attempts reached for ${filePath}`);
        return;
      }
      fixAttemptsRef.current[filePath] = attempts + 1;

      // Normalize: WC paths are relative to root; strip any leading slash
      // that Vite may emit as an absolute path (e.g. /apps/web/src/...).
      const relativePath = filePath.startsWith("/") ? filePath.slice(1) : filePath;
      const baseName = filePath.replace(/^.*\//, "");

      // Try the full relative path first, then legacy basename-only fallbacks.
      const readPaths = [
        relativePath,
        `apps/web/src/app/generated/${baseName}`,
        `src/${baseName}`,
        baseName,
      ];
      let fileContent: string | null = null;
      let resolvedPath: string | null = null;
      for (const p of readPaths) {
        try {
          fileContent = await wc.fs.readFile(p, "utf-8");
          resolvedPath = p;
          break;
        } catch {
          continue;
        }
      }
      if (!fileContent || !resolvedPath) {
        console.warn(`[self-heal] Could not read ${filePath} from WebContainer`);
        return;
      }

      setIsFixing(true);
      setProgressMessage("Fixing a code issue…");

      try {
        const fixedContent = await fixFile({
          buildId: projectRef.current?.id ?? "unknown",
          filePath: baseName,
          errorMessage,
          fileContent,
        });

        // Write fixed content back to the exact path that was successfully read.
        await wc.fs.writeFile(resolvedPath, fixedContent);
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
                  contents: WORKSPACE_PACKAGE_JSON,
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
            serverReadyFiredRef.current = false;
            firstBuildDeliveredRef.current = false;
            pendingDeliverRef.current = false;
            // BEO-456 follow-up: keep the gate closed through the rebuild so
            // the iframe stays hidden until the real files land again.
            setFirstFilesDelivered(false);
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
            // Restart Vite from the shell; any live or cached files will be
            // delivered via the server-ready handler's pendingDeliverRef path.
            await startViteShell(instance);
            const fbFiles = filesRef.current;
            const fbProject = projectRef.current;
            if (fbFiles && fbFiles.length > 0 && fbProject?.id) {
              void deliverFiles(instance, fbFiles, fbProject);
            }
          };
          cacheFallbackFnRef.current = runCacheFallback;
          cacheTimeoutIdRef.current = setTimeout(() => void runCacheFallback(), 15_000);
        }
        // BEO-383: expose this to the post-boot generationId effect which
        // can't call armCacheFallback() directly (defined inside boot()).
        armCacheFallbackRef.current = armCacheFallback;

        // BEO-456: always start Vite with the BLANK SHELL first so the preview
        // goes blank → real app in one HMR transition — the scaffold template
        // never touches the WC filesystem. Real files are delivered next via
        // deliverFiles(); it stages via pendingDeliverRef if server-ready
        // hasn't fired yet.
        await startViteShell(instance);
        if (cancelled) return;
        armCacheFallback();

        const currentFiles = filesRef.current;
        const currentProject = projectRef.current;

        if (currentFiles && currentFiles.length > 0 && currentProject?.id) {
          void deliverFiles(instance, currentFiles, currentProject);
        } else {
          // No live files yet — check if IndexedDB has a cached build for this
          // project. BEO-375: this lets the preview warm up before the API responds.
          const gId = generationIdRef.current;
          const proj = currentProject;
          if (proj?.id && gId) {
            const cached = await wcCacheGetFiles(proj.id, gId);
            if (cancelled) return;
            if (cached && cached.length > 0 && !filesRef.current?.length) {
              console.log("[wc-cache] Delivering source files from IndexedDB cache");
              void deliverFiles(instance, cached as StudioFile[], proj);
            }
          }
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
      console.log("[wc-cache] Delivering source files from IndexedDB (post-boot)");
      void deliverFiles(inst, cached as StudioFile[], project);
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
      // Boot effect hasn't finished yet — boot() will pick up filesRef.current
      // and call deliverFiles once install + shell-Vite boot complete.
      return;
    }

    // First real-file delivery AND every iteration go through deliverFiles:
    // it uses the same wc.mount(buildPreviewFileTree(...)) path the iteration
    // hot-swap has always used. On first build serverReadyFiredRef may still
    // be false (Vite is booting the shell) — deliverFiles stages via
    // pendingDeliverRef and the server-ready handler delivers them.
    void deliverFiles(instance, files, project);
  }, [files, project, project?.id, deliverFiles]);

  return { status, previewUrl, progressMessage, isFixing, firstFilesDelivered };
}
