import { useCallback, useEffect, useRef, useState } from "react";

import type { Project, StudioFile } from "@beomz-studio/contracts";

import {
  buildPreviewFileTree,
  getOrBootWebContainer,
  isWebContainerSupported,
  type WcInstance,
  type WcStatus,
} from "../lib/webcontainer";

export type { WcStatus };

export interface WcPreviewState {
  status: WcStatus;
  previewUrl: string | null;
  progressMessage: string;
}

// Eagerly kick off the WebContainer boot + npm install as soon as the hook
// mounts — this runs in parallel with the AI generation (30-60s) so by the
// time files arrive the sandbox is already warm.
export function useWebContainerPreview(
  files: readonly StudioFile[] | null | undefined,
  project: Pick<Project, "id" | "name" | "templateId"> | null | undefined,
): WcPreviewState {
  const [status, setStatus] = useState<WcStatus>("idle");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [progressMessage, setProgressMessage] = useState("Preparing…");

  const instanceRef = useRef<WcInstance | null>(null);
  const viteStartedRef = useRef(false);
  const prevFilesRef = useRef<readonly StudioFile[] | null>(null);

  // Live refs so the boot closure (which has [] deps and captures stale values)
  // can always read the most-recent files/project at any point in time.
  const filesRef = useRef(files);
  const projectRef = useRef(project);
  filesRef.current = files;
  projectRef.current = project;

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
                      "@types/react": "^19.2.2",
                      "@types/react-dom": "^19.2.2",
                      "@vitejs/plugin-react": "^6.0.1",
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

  // ── Start Vite + hot-reload when files change ─────────────────────────────
  const startVite = useCallback(
    async (
      instance: WcInstance,
      currentFiles: readonly StudioFile[],
      currentProject: Pick<Project, "id" | "name" | "templateId">,
    ) => {
      const { wc } = instance;

      // Mount the full file tree (scaffold + generated files + runtime.json).
      const tree = buildPreviewFileTree(currentFiles, currentProject);
      await wc.mount(tree);

      if (!viteStartedRef.current) {
        // First time: start the dev server.
        viteStartedRef.current = true;
        setStatus("starting");
        setProgressMessage("Starting dev server…");

        const devProcess = await wc.spawn("npm", ["run", "dev"]);
        instance.devProcess = devProcess;

        wc.on("server-ready", (_port: number, url: string) => {
          setPreviewUrl(url);
          setStatus("ready");
        });
      }
      // Subsequent calls: Vite is already running; the file writes above
      // trigger HMR automatically. No further action needed.
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

  return { status, previewUrl, progressMessage };
}
