/**
 * Module-level set of build IDs currently running in the background.
 * Used by runBuildInBackground (generate.ts) to register active builds
 * and by the SIGTERM handler (server.ts) to drain before exiting.
 */
export const activeBuilds = new Set<string>();
const activeBuildControllers = new Map<string, AbortController>();

export function registerActiveBuild(buildId: string, controller: AbortController): void {
  activeBuilds.add(buildId);
  activeBuildControllers.set(buildId, controller);
}

export function unregisterActiveBuild(buildId: string): void {
  activeBuilds.delete(buildId);
  activeBuildControllers.delete(buildId);
}

export function abortActiveBuild(buildId: string): boolean {
  const controller = activeBuildControllers.get(buildId);
  if (!controller || controller.signal.aborted) {
    return false;
  }

  controller.abort();
  return true;
}
