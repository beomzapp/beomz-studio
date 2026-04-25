import { setTimeout as delay } from "node:timers/promises";

import { isBuilderV3TerminalEvent } from "@beomz-studio/contracts";
import { getTemplateDefinitionSafe } from "@beomz-studio/templates";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";

import { loadOrgContext } from "../../middleware/loadOrgContext.js";
import { verifyPlatformJwt } from "../../middleware/verifyPlatformJwt.js";
import type { OrgContext } from "../../types.js";
import { abortActiveBuild } from "../../lib/activeBuilds.js";
import { readBuildMetadata, readBuildTraceMetadata } from "./shared.js";

const buildsEventsRoute = new Hono();
const BUILD_EVENT_POLL_INTERVAL_MS = 250;
const BUILD_EVENT_START_RETRY_ATTEMPTS = 10;
const BUILD_EVENT_START_RETRY_INTERVAL_MS = 500;
const BUILD_EVENT_KEEPALIVE_INTERVAL_MS = 5_000;
const TERMINAL_EVENT_RETRY_LIMIT = 2;

function sliceEventsAfterEventId<T extends { id: string }>(
  events: readonly T[],
  lastEventId: string | null,
): readonly T[] {
  if (!lastEventId) {
    return events;
  }

  const lastIndex = events.findIndex((event) => event.id === lastEventId);
  return lastIndex === -1 ? events : events.slice(lastIndex + 1);
}

function isSyntheticTerminalEventId(buildId: string, eventId: string | null): boolean {
  return eventId === `${buildId}:done`
    || eventId === `${buildId}:error`
    || eventId === `${buildId}:server-restarting`;
}

function buildTerminalSafetyEvent(
  row: {
    completed_at: string | null;
    error: string | null;
    id: string;
    metadata: Record<string, unknown>;
    preview_entry_path: string | null;
    project_id: string;
    started_at: string;
    status: string;
    summary: string | null;
    template_id: string;
  },
) {
  const metadata = readBuildMetadata(row.metadata);
  const fallbackReason = metadata.fallbackReason ?? null;
  const fallbackUsed = metadata.resultSource === "fallback";
  const timestamp = row.completed_at ?? row.started_at;

  if (row.status === "failed" || row.status === "cancelled") {
    // BEO-318: Use server_restarting code when the build was interrupted by a
    // server shutdown. The frontend CC handler checks this code to keep the
    // WebContainer overlay up instead of dropping it.
    const isServerRestart = row.error === "Server restarted during build";
    return {
      buildId: row.id,
      code: isServerRestart ? "server_restarting" : "build_failed",
      id: isServerRestart ? `${row.id}:server-restarting` : `${row.id}:error`,
      message: isServerRestart
        ? "Server is restarting. Your build will resume shortly."
        : (row.error ?? "Build failed."),
      operation: "initial_build" as const,
      payload: {
        phase: metadata.phase ?? null,
      },
      projectId: row.project_id,
      timestamp,
      type: "error" as const,
    };
  }

  return {
    buildId: row.id,
    code: "build_completed",
    fallbackReason,
    fallbackUsed,
    id: `${row.id}:done`,
    message: row.summary ?? "Build completed.",
    operation: "initial_build" as const,
    payload: {
      previewEntryPath:
        row.preview_entry_path ?? getTemplateDefinitionSafe(row.template_id).previewEntryPath,
      source: metadata.resultSource ?? "ai",
    },
    projectId: row.project_id,
    timestamp,
    type: "done" as const,
  };
}

async function findGenerationByIdWithRetry(
  db: OrgContext["db"],
  buildId: string,
  signal: AbortSignal,
) {
  const lookupGeneration = async () => {
    try {
      return await db.findGenerationById(buildId);
    } catch {
      // The workflow can start before the generation row becomes visible.
      return null;
    }
  };

  const initialGenerationRow = await lookupGeneration();
  if (initialGenerationRow) {
    return initialGenerationRow;
  }

  for (let attempt = 0; attempt < BUILD_EVENT_START_RETRY_ATTEMPTS; attempt += 1) {
    const didWait = await delay(BUILD_EVENT_START_RETRY_INTERVAL_MS, undefined, {
      signal,
    })
      .then(() => true)
      .catch(() => false);

    if (!didWait) {
      break;
    }

    const generationRow = await lookupGeneration();
    if (generationRow) {
      return generationRow;
    }
  }

  return null;
}

buildsEventsRoute.get("/", verifyPlatformJwt, loadOrgContext, async (c) => {
  const orgContext = c.get("orgContext") as OrgContext;
  const buildId = c.req.param("id");

  if (!buildId) {
    return c.json({ error: "Build id is required." }, 400);
  }

  const generationRow = await findGenerationByIdWithRetry(
    orgContext.db,
    buildId,
    c.req.raw.signal,
  );
  if (!generationRow) {
    try {
      const superseding = await orgContext.db.findLatestCompletedGenerationForProject(buildId);
      if (superseding && superseding.id !== buildId) {
        return c.json({ error: "build_superseded", latestBuildId: superseding.id }, 410);
      }
    } catch {
      // ignore — fall through to 404
    }
    return c.json({ error: "Build not found." }, 404);
  }

  const projectRow = await orgContext.db.findProjectById(generationRow.project_id);
  if (!projectRow || projectRow.org_id !== orgContext.org.id) {
    return c.json({ error: "Build not found." }, 404);
  }

  c.req.raw.signal.addEventListener("abort", () => {
    if (abortActiveBuild(buildId)) {
      console.log("[builds/events] client disconnected — aborting active build", { buildId });
    }
  }, { once: true });

  const requestedLastEventId = c.req.header("last-event-id") ?? c.req.query("lastEventId") ?? null;

  return streamSSE(c, async (sse) => {
    let lastSentEventId = requestedLastEventId;
    let streamOpen = true;
    let completedPollsWithoutTerminal = 0;
    let lastStreamWriteAt = Date.now();

    // Independent keepalive: send an SSE comment every 20s to prevent
    // nginx from closing the connection during long Sonnet builds.
    const pingInterval = setInterval(async () => {
      if (!streamOpen || c.req.raw.signal.aborted) return;
      try {
        await sse.write(": ping\n\n");
      } catch {
        streamOpen = false;
      }
    }, 20_000);

    const clearPingInterval = () => clearInterval(pingInterval);

    const writeEvent = async (event: { data: string; event: string; id: string }) => {
      if (!streamOpen || c.req.raw.signal.aborted) {
        return false;
      }

      try {
        await sse.writeSSE(event);
        lastStreamWriteAt = Date.now();
        return true;
      } catch {
        streamOpen = false;
        return false;
      }
    };

    const writeKeepalive = async () => {
      if (!streamOpen || c.req.raw.signal.aborted) {
        return false;
      }

      try {
        await sse.write(": keepalive\n\n");
        lastStreamWriteAt = Date.now();
        return true;
      } catch {
        streamOpen = false;
        return false;
      }
    };

    const waitForNextPoll = async () => {
      if (Date.now() - lastStreamWriteAt >= BUILD_EVENT_KEEPALIVE_INTERVAL_MS) {
        const didWriteKeepalive = await writeKeepalive();
        if (!didWriteKeepalive) {
          return false;
        }
      }

      return delay(BUILD_EVENT_POLL_INTERVAL_MS, undefined, {
        signal: c.req.raw.signal,
      })
        .then(() => true)
        .catch(() => false);
    };

    while (!c.req.raw.signal.aborted && streamOpen) {
      let currentGenerationRow: Awaited<ReturnType<typeof orgContext.db.findGenerationById>>;
      let currentProjectRow: Awaited<ReturnType<typeof orgContext.db.findProjectById>>;

      try {
        currentGenerationRow = await orgContext.db.findGenerationById(buildId);
        if (!currentGenerationRow) {
          break;
        }
        currentProjectRow = await orgContext.db.findProjectById(currentGenerationRow.project_id);
      } catch {
        // Supabase transient error — skip this poll tick and try again.
        const shouldContinue = await waitForNextPoll();
        if (!shouldContinue) {
          clearPingInterval();
          return;
        }
        continue;
      }

      if (!currentProjectRow || currentProjectRow.org_id !== orgContext.org.id) {
        break;
      }

      const trace = readBuildTraceMetadata(currentGenerationRow);
      const nextEvents = sliceEventsAfterEventId(trace.events, lastSentEventId);

      for (const event of nextEvents) {
        const didWrite = await writeEvent({
          data: JSON.stringify(event),
          event: event.type,
          id: event.id,
        });
        if (!didWrite) {
          clearPingInterval();
          return;
        }
        lastSentEventId = event.id;

        if (isBuilderV3TerminalEvent(event)) {
          clearPingInterval();
          return;
        }
      }

      const terminalEventAlreadySeen =
        isSyntheticTerminalEventId(buildId, lastSentEventId)
        || trace.events.some(
          (event) => event.id === lastSentEventId && isBuilderV3TerminalEvent(event),
        );

      if (
        currentGenerationRow.status === "completed"
        || currentGenerationRow.status === "failed"
        || currentGenerationRow.status === "cancelled"
      ) {
        if (terminalEventAlreadySeen) {
          clearPingInterval();
          return;
        }

        completedPollsWithoutTerminal += 1;
        if (completedPollsWithoutTerminal <= TERMINAL_EVENT_RETRY_LIMIT) {
          const shouldContinue = await waitForNextPoll();
          if (!shouldContinue) {
            clearPingInterval();
            return;
          }
          continue;
        }

        const safetyEvent = buildTerminalSafetyEvent({
          completed_at: currentGenerationRow.completed_at,
          error: currentGenerationRow.error,
          id: currentGenerationRow.id,
          metadata:
            typeof currentGenerationRow.metadata === "object" && currentGenerationRow.metadata !== null
              ? currentGenerationRow.metadata as Record<string, unknown>
              : {},
          preview_entry_path: currentGenerationRow.preview_entry_path,
          project_id: currentGenerationRow.project_id,
          started_at: currentGenerationRow.started_at,
          status: currentGenerationRow.status,
          summary: currentGenerationRow.summary,
          template_id: currentGenerationRow.template_id,
        });
        const didWrite = await writeEvent({
          data: JSON.stringify(safetyEvent),
          event: safetyEvent.type,
          id: safetyEvent.id,
        });
        if (!didWrite) {
          clearPingInterval();
          return;
        }
        clearPingInterval();
        return;
      }

      completedPollsWithoutTerminal = 0;
      const shouldContinue = await waitForNextPoll();
      if (!shouldContinue) {
        clearPingInterval();
        return;
      }
    }
    clearPingInterval();
  });
});

export default buildsEventsRoute;
