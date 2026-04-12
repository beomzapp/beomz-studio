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
): WcPreviewState {
  const [status, setStatus] = useState<WcStatus>("idle");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [progressMessage, setProgressMessage] = useState("Preparing…");

  const [isFixing, setIsFixing] = useState(false);

  const instanceRef = useRef<WcInstance | null>(null);
  const viteStartedRef = useRef(false);
  const prevFilesRef = useRef<readonly StudioFile[] | null>(null);
  const fixAttemptsRef = useRef<Record<string, number>>({});

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

  // Keep the latest dbEnv in a ref so startVite can always use the current value.
  const dbEnvRef = useRef(dbEnv);
  dbEnvRef.current = dbEnv;

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

        // Mount a minimal package.json so npm install can run immediately
        // without waiting for the full AI-generated file set.
        if (instance.installedAt === null) {
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
        }

        // Read from live refs, NOT from the stale closure capture — this is
        // critical for the page-reload case where files arrive from the API
        // while npm install is in progress and the closure still sees null.
        const currentFiles = filesRef.current;
        const currentProject = projectRef.current;
        if (currentFiles && currentFiles.length > 0 && currentProject?.id) {
          void startVite(instance, currentFiles, currentProject);
        } else {
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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run exactly once per component mount

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

  // ── Start Vite + hot-reload when files change ─────────────────────────────
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

      if (!viteStartedRef.current) {
        // First time: start the dev server.
        viteStartedRef.current = true;
        setStatus("starting");
        setProgressMessage("Starting dev server…");

        const devProcess = await wc.spawn("npm", ["run", "dev"]);
        instance.devProcess = devProcess;

        // ── Listen to dev server output for Vite parse errors ──────────────
        devProcess.output.pipeTo(new WritableStream({
          write: (chunk: string) => {
            // Detect Vite oxc parse errors: [plugin:vite:oxc] or [PARSE_ERROR]
            if (chunk.includes("[plugin:vite:oxc]") || chunk.includes("[PARSE_ERROR]")) {
              // Extract file path and error message from output like:
              // [plugin:vite:oxc] ... at /path/to/file.tsx:123:45
              // or: Unexpected token at SomePage.tsx:42:10
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
          },
        })).catch(() => { /* stream closed */ });

        wc.on("server-ready", (_port: number, url: string) => {
          setPreviewUrl(url);
          setStatus("ready");
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
