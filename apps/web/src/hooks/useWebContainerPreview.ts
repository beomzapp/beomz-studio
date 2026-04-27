import { useCallback, useEffect, useRef, useState } from "react";

import type { Project, StudioFile } from "@beomz-studio/contracts";
import { normalizeGeneratedPath } from "@beomz-studio/contracts";

import {
  buildPreviewFileTree,
  buildRuntimeJson,
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
  wcCacheDeleteFiles,
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

// BEO-586: write a single file to the WC filesystem, ensuring its parent
// directory chain exists. WebContainer's fs.writeFile does NOT auto-create
// intermediate directories, so a recursive mkdir is required for any file
// whose parent dir hasn't been touched yet by an earlier mount.
async function writeFileEnsuringDir(
  wc: import("@webcontainer/api").WebContainer,
  path: string,
  contents: string,
): Promise<void> {
  const slash = path.lastIndexOf("/");
  if (slash > 0) {
    const dir = path.slice(0, slash);
    try {
      await wc.fs.mkdir(dir, { recursive: true });
    } catch {
      // Directory exists or is a non-fatal race — writeFile below will
      // surface any real error.
    }
  }
  await wc.fs.writeFile(path, contents);
}

// BEO-586: hot-patch the WebContainer FS for an iteration. Writes only the
// files whose content changed vs. the previous snapshot, removes files that
// are no longer present, and refreshes the runtime.json route manifest. The
// dev server keeps running and Vite HMR picks up the changes in place.
//
// Returns the count of files written, deleted, and the runtime-manifest write
// for diagnostics. The caller is responsible for updating the snapshot map.
async function hotPatchFiles(
  wc: import("@webcontainer/api").WebContainer,
  currentFiles: readonly StudioFile[],
  currentProject: Pick<Project, "id" | "name" | "templateId">,
  previousSnapshot: ReadonlyMap<string, string>,
): Promise<{ written: number; deleted: number }> {
  const nextPaths = new Set<string>();
  const writes: Promise<void>[] = [];

  for (const file of currentFiles) {
    const path = normalizeGeneratedPath(file.path);
    nextPaths.add(path);
    if (previousSnapshot.get(path) !== file.content) {
      writes.push(writeFileEnsuringDir(wc, path, file.content));
    }
  }

  // Remove files that were in the previous snapshot but are no longer
  // present — keeps the running tree in sync so deleted files don't
  // shadow newly added ones via Vite's module cache.
  const deletions: Promise<void>[] = [];
  for (const path of previousSnapshot.keys()) {
    if (!nextPaths.has(path)) {
      deletions.push(wc.fs.rm(path).catch(() => { /* already gone */ }));
    }
  }

  // Always rewrite runtime.json — the route manifest depends on the current
  // file set, and a cached stale manifest would cause Vite to render the old
  // entry component until the next full reload.
  writes.push(
    writeFileEnsuringDir(
      wc,
      "apps/web/src/.beomz/runtime.json",
      buildRuntimeJson(currentFiles, currentProject),
    ),
  );

  await Promise.all([...writes, ...deletions]);

  return {
    written: writes.length,
    deleted: deletions.length,
  };
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
  /**
   * BEO-651: true from the moment hotPatchFiles() starts writing iteration
   * files until a 2.5 s settle window expires. PreviewPane uses this to keep
   * the loading overlay up while Vite recompiles the changed modules, preventing
   * the MIME-type errors that occur when the iframe reloads before Vite is ready.
   */
  isHotPatching: boolean;
}

// BEO-482 Fix 2: known scaffold content signatures.
// Any IndexedDB cache entry containing these strings was written during a
// pre-BEO-474 build (before the scaffold guard existed). Discard immediately
// so stale "Product Catalog" templates never ghost over a new build.
const SCAFFOLD_CONTENT_SIGNATURES = [
  "Product Catalog",
  "ProductCatalog",
  "product-catalog",
];

function isScaffoldContaminated(files: readonly unknown[]): boolean {
  return files.some((file) => {
    if (!file || typeof file !== "object") return false;
    const content = (file as Record<string, unknown>).content;
    return (
      typeof content === "string" &&
      SCAFFOLD_CONTENT_SIGNATURES.some((sig) => content.includes(sig))
    );
  });
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
  /**
   * BEO-456 final: `true` while the build pipeline is still running (API may be
   * streaming scaffold/preview files that are NOT the final AI output). When
   * true, first-build `deliverFiles()` defers the wc.mount — the scaffold is
   * allowed in memory (for mergeFiles/code view) but must never touch the WC
   * filesystem. Iterations ignore this flag (firstBuildDeliveredRef gate).
   */
  isBuildInProgress?: boolean,
): WcPreviewState {
  const [status, setStatus] = useState<WcStatus>("idle");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [progressMessage, setProgressMessage] = useState("Preparing…");

  const [isFixing, setIsFixing] = useState(false);
  // BEO-456 follow-up: flips to true AFTER the first deliverFiles() call has
  // completed wc.mount() with the real app files. Exposed so PreviewPane can
  // gate wcReadyConfirmed on real delivery rather than server-ready timing.
  const [firstFilesDelivered, setFirstFilesDelivered] = useState(false);
  // BEO-651: true while an iteration's hotPatchFiles() is running and during
  // the subsequent 2.5 s Vite module-rebuild settle window. PreviewPane gates
  // the iframe reveal on this so the preview never shows MIME-type errors.
  const [isHotPatching, setIsHotPatching] = useState(false);

  const instanceRef = useRef<WcInstance | null>(null);
  const viteStartedRef = useRef(false);
  const prevFilesRef = useRef<readonly StudioFile[] | null>(null);
  const fixAttemptsRef = useRef<Record<string, number>>({});

  // BEO-651: timer ref for the hot-patch settle window (cleared between iterations
  // and on unmount so stale timers never flip isHotPatching at the wrong moment).
  const hotPatchSettleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  // every subsequent files-change goes through the iteration branch
  // (per-file wc.fs.writeFile() so Vite HMR updates in-place — BEO-586).
  const firstBuildDeliveredRef = useRef(false);
  // BEO-586: snapshot of the last-delivered file set keyed by normalised path.
  // Used to compute the diff between current and previously-mounted files so
  // each iteration only writes the files that actually changed — Vite's
  // chokidar watcher then fires HMR for those modules without touching the
  // rest of the tree (no full container restart, no iframe reload).
  const lastDeliveredFilesRef = useRef<Map<string, string>>(new Map());

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

  // BEO-456 final: live ref of isBuildInProgress so stable closures
  // (deliverFiles, server-ready handler, files-change effect) can read the
  // latest value without being re-created.
  const isBuildInProgressRef = useRef(isBuildInProgress);
  isBuildInProgressRef.current = isBuildInProgress;

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

      // BEO-482 NUCLEAR: Hard scaffold eviction — the absolute last line of
      // defence. Scaffold files (e.g. Product Catalog) MUST NEVER reach
      // wc.mount() under ANY circumstance, regardless of isBuildInProgress
      // timing or any other upstream guard. This catches the race where
      // preview_ready's getBuildStatus resolves AFTER done has set
      // isBuilding=false, which would otherwise slip past the isBuildInProgress
      // ref and deliver scaffold via the files-change effect.
      if (isScaffoldContaminated(currentFiles)) {
        console.warn("[BEO-482] NUCLEAR: scaffold files blocked from wc.mount() — discarding");
        return;
      }

      // BEO-474: Universal scaffold guard — applies to BOTH first builds AND
      // iterations. The API streams a prebuilt template (e.g. Product Catalog)
      // as an early buildResult.files for EVERY build before AI finishes
      // generating the real app. If mounted now, Vite/HMR would swap the
      // running preview to the scaffold template for the entire generation
      // duration. Block ALL deliveries while a build pipeline is in flight;
      // the real files arrive via files-change effect when isBuildInProgress
      // transitions to false (done SSE → getBuildStatus → setBuildResult).
      //
      // BEO-456 regression: the old guard was
      //   `!firstBuildDeliveredRef.current && isBuildInProgressRef.current`
      // which intentionally skipped the block for iterations. That was safe
      // when iterations never received scaffold payloads, but the API now
      // sends scaffold for every build, causing the template to flash in HMR.
      if (isBuildInProgressRef.current) {
        pendingDeliverRef.current = true;
        return;
      }

      // If Vite hasn't finished its initial bind yet, stage the delivery for
      // the server-ready handler. We read filesRef/projectRef there so we
      // pick up the freshest values if more arrived while we were waiting.
      if (!serverReadyFiredRef.current) {
        pendingDeliverRef.current = true;
        return;
      }

      const wasFirstBuild = !firstBuildDeliveredRef.current;

      if (wasFirstBuild) {
        // First delivery — mount the full file tree so Vite picks up the
        // workspace package.json / tsconfig / vite.config / shell entry plus
        // the generated files in one pass. The container is still booting
        // its module graph; per-file writes here would fight with Vite's
        // initial dep optimisation.
        const tree = buildPreviewFileTree(currentFiles, currentProject, dbEnvRef.current);
        await wc.mount(tree);
      } else {
        // BEO-586 hot-patch: iteration — container is already running and
        // Vite HMR is live. Write only the files that actually changed
        // (vs. the lastDelivered snapshot) directly to the FS via
        // wc.fs.writeFile(). chokidar fires HMR for those modules in place,
        // so the iframe stays mounted, no reload, no flash, no state loss.

        // BEO-651: signal hot-patch start so PreviewPane keeps the loading
        // overlay up during file writes + Vite module-rebuild settle period.
        setIsHotPatching(true);
        if (hotPatchSettleTimerRef.current) {
          clearTimeout(hotPatchSettleTimerRef.current);
          hotPatchSettleTimerRef.current = null;
        }

        // BEO-421: delete stale stub files from the previous build first.
        const firstFilePath = currentFiles[0]?.path
          ? normalizeGeneratedPath(currentFiles[0].path)
          : "";
        const generatedDir = firstFilePath.includes("/")
          ? firstFilePath.slice(0, firstFilePath.lastIndexOf("/"))
          : "";
        if (generatedDir) {
          await deleteStaleStubFiles(wc, generatedDir);
        }

        const stats = await hotPatchFiles(
          wc,
          currentFiles,
          currentProject,
          lastDeliveredFilesRef.current,
        );
        console.log(
          `[BEO-586] Hot-patched WC: wrote ${stats.written} file(s), removed ${stats.deleted} — Vite HMR will update preview in-place`,
        );

        // BEO-651: start settle window AFTER writes complete.
        // Vite chokidar detects the changes and may trigger a full-page reload
        // (especially for runtime.json which has no HMR boundary). The 2.5 s
        // window gives Vite time to recompile all changed modules before the
        // PreviewPane overlay is lifted — preventing the MIME-type errors that
        // occur when the iframe reloads against a still-building dev server.
        hotPatchSettleTimerRef.current = setTimeout(() => {
          setIsHotPatching(false);
          hotPatchSettleTimerRef.current = null;
        }, 2500);
      }

      // BEO-452: Re-inject Neon env vars after every delivery so they
      // survive across iterations. wc.mount() does not preserve files
      // absent from the tree, and the hot-patch path skips infra files
      // unless they changed — so we always rewrite .env.local explicitly.
      if (neonDbUrlRef.current) {
        const envLines = [
          `VITE_DATABASE_URL=${neonDbUrlRef.current}`,
          `VITE_PROJECT_ID=${currentProject.id}`,
        ];
        await wc.fs.writeFile(".env.local", envLines.join("\n"));
      }

      // Update the last-delivered snapshot AFTER both first-build mount and
      // iteration hot-patch so the next iteration computes its diff against
      // what is actually on disk right now.
      const nextSnapshot = new Map<string, string>();
      for (const file of currentFiles) {
        nextSnapshot.set(normalizeGeneratedPath(file.path), file.content);
      }
      lastDeliveredFilesRef.current = nextSnapshot;

      // BEO-375: persist source files to IndexedDB so the next page load can
      // skip the API round-trip and mount immediately while npm install is warm.
      // BEO-482 NUCLEAR: never cache scaffold-contaminated files — belt and
      // suspenders so the cache can never be written with scaffold content even
      // if a future code path bypasses the isScaffoldContaminated guard above.
      const gId = generationIdRef.current;
      if (gId && !isScaffoldContaminated(currentFiles)) {
        void wcCacheSetFiles(currentProject.id, gId, currentFiles);
      }

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
            // BEO-586: stale node_modules forces a fresh install + first-mount
            // path. Drop the snapshot so the next delivery is treated as a
            // first build (full wc.mount), not an iteration hot-patch.
            lastDeliveredFilesRef.current = new Map();
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

        // BEO-456 / BEO-474: always start Vite with the BLANK SHELL first so
        // the preview goes blank → real app in one HMR transition — the scaffold
        // template never touches the WC filesystem. Real files are delivered
        // later via deliverFiles(); it stages via pendingDeliverRef if
        // server-ready hasn't fired yet or if isBuildInProgress is true.
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
              // BEO-482 Fix 1: skip cache restore if a build is already running.
              // The real files will be delivered by the files-change effect once
              // isBuildInProgress transitions to false (done SSE).
              if (isBuildInProgressRef.current) {
                console.log("[wc-cache] Skipping boot cache restore — build in progress");
              // BEO-482 Fix 2: discard poisoned scaffold entries written before
              // the BEO-474 guard existed (e.g. cached "Product Catalog" templates).
              } else if (isScaffoldContaminated(cached)) {
                console.warn("[wc-cache] Discarding scaffold-contaminated cache entry");
                void wcCacheDeleteFiles(proj.id, gId);
              } else {
                console.log("[wc-cache] Delivering source files from IndexedDB cache");
                void deliverFiles(instance, cached as StudioFile[], proj);
              }
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
      // BEO-651: clean up hot-patch settle timer on unmount
      if (hotPatchSettleTimerRef.current !== null) {
        clearTimeout(hotPatchSettleTimerRef.current);
        hotPatchSettleTimerRef.current = null;
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
      // BEO-482 Fix 1: skip cache restore if a build is in progress.
      if (isBuildInProgressRef.current) {
        console.log("[wc-cache] Skipping post-boot cache restore — build in progress");
        return;
      }
      // BEO-482 Fix 2: discard poisoned scaffold entries.
      if (isScaffoldContaminated(cached)) {
        console.warn("[wc-cache] Discarding scaffold-contaminated cache entry (post-boot)");
        void wcCacheDeleteFiles(project.id, generationId);
        return;
      }
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
    // BEO-456 final: deliverFiles also defers first delivery while the build
    // pipeline is still running (isBuildInProgress) so scaffold/prebuilt
    // template files never reach the WC filesystem.
    void deliverFiles(instance, files, project);
  }, [files, project, project?.id, deliverFiles]);

  return { status, previewUrl, progressMessage, isFixing, firstFilesDelivered, isHotPatching };
}
