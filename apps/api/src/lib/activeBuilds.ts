/**
 * Module-level set of build IDs currently running in the background.
 * Used by runBuildInBackground (generate.ts) to register active builds
 * and by the SIGTERM handler (server.ts) to drain before exiting.
 */
export const activeBuilds = new Set<string>();
