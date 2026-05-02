import { createStudioDbClient, type StudioDbClient } from "@beomz-studio/studio-db";

import { apiConfig } from "../config.js";

/**
 * Default cutoff: any build still in queued/running state for more than 10 minutes
 * is considered abandoned. Most healthy builds finish in under 90 seconds.
 */
const DEFAULT_STALE_CUTOFF_MS = 10 * 60 * 1000;

interface RunStaleBuildWatchdogArgs {
  db?: StudioDbClient;
  cutoffMs?: number;
}

/**
 * Sweep stale builds at API startup based on STALE_BUILD_WATCHDOG_MODE.
 *
 * - "off" (default): no-op
 * - "dry-run": logs the rows that would be marked failed, no DB writes
 * - "on": marks stale rows failed with a clear error_log entry
 *
 * Always wrapped in try/catch - a watchdog failure must NOT block API startup.
 */
export async function runStaleBuildWatchdog(
  args: RunStaleBuildWatchdogArgs = {},
): Promise<void> {
  const mode = apiConfig.STALE_BUILD_WATCHDOG_MODE;
  if (mode === "off") {
    return;
  }

  const cutoffMs = args.cutoffMs ?? DEFAULT_STALE_CUTOFF_MS;
  const db = args.db ?? createStudioDbClient();

  try {
    const stale = await db.markStaleBuildsFailed({
      cutoffMs,
      mode: mode === "dry-run" ? "dry-run" : "apply",
    });

    if (stale.length === 0) {
      console.log("[watchdog] no stale builds found", { mode, cutoffMs });
      return;
    }

    if (mode === "dry-run") {
      console.warn("[watchdog] DRY RUN - would mark these builds failed:", {
        count: stale.length,
        ids: stale.map((row) => row.id),
        cutoffMs,
      });
      return;
    }

    console.warn("[watchdog] marked stale builds failed:", {
      count: stale.length,
      ids: stale.map((row) => row.id),
      cutoffMs,
    });
  } catch (error) {
    // Never block API startup on watchdog failure
    console.error(
      "[watchdog] failed (non-fatal):",
      error instanceof Error ? error.message : String(error),
    );
  }
}
