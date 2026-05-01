/**
 * Module-level set of build IDs currently running in the background.
 * Used by runBuildInBackground (generate.ts) to register active builds
 * and by the SIGTERM handler (server.ts) to drain before exiting.
 */
export const activeBuilds = new Set<string>();
const activeBuildControllers = new Map<string, AbortController>();
const activeProjectBuilds = new Map<string, string>();
const activeBuildProjects = new Map<string, string>();

export function registerActiveBuild(
  buildId: string,
  projectId: string,
  controller?: AbortController,
): boolean {
  const existingBuildId = activeProjectBuilds.get(projectId);
  if (existingBuildId && existingBuildId !== buildId) {
    return false;
  }

  activeBuilds.add(buildId);
  activeProjectBuilds.set(projectId, buildId);
  activeBuildProjects.set(buildId, projectId);
  if (controller) {
    activeBuildControllers.set(buildId, controller);
  }
  return true;
}

export function unregisterActiveBuild(buildId: string): void {
  activeBuilds.delete(buildId);
  activeBuildControllers.delete(buildId);
  const projectId = activeBuildProjects.get(buildId);
  activeBuildProjects.delete(buildId);
  if (projectId && activeProjectBuilds.get(projectId) === buildId) {
    activeProjectBuilds.delete(projectId);
  }
}

export function abortActiveBuild(buildId: string, reason: unknown = "cancelled_by_user"): boolean {
  const controller = activeBuildControllers.get(buildId);
  if (!controller || controller.signal.aborted) {
    return false;
  }

  controller.abort(reason);
  return true;
}

export function findActiveBuildIdByProject(projectId: string): string | null {
  return activeProjectBuilds.get(projectId) ?? null;
}
