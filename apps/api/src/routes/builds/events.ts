import { setTimeout as delay } from "node:timers/promises";

import { isBuilderV3TerminalEvent } from "@beomz-studio/contracts";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";

import { loadOrgContext } from "../../middleware/loadOrgContext.js";
import { verifyPlatformJwt } from "../../middleware/verifyPlatformJwt.js";
import type { OrgContext } from "../../types.js";
import { readBuildTraceMetadata } from "./shared.js";

const buildsEventsRoute = new Hono();
const BUILD_EVENT_POLL_INTERVAL_MS = 250;

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

buildsEventsRoute.get("/", verifyPlatformJwt, loadOrgContext, async (c) => {
  const orgContext = c.get("orgContext") as OrgContext;
  const buildId = c.req.param("id");

  if (!buildId) {
    return c.json({ error: "Build id is required." }, 400);
  }

  const generationRow = await orgContext.db.findGenerationById(buildId);
  if (!generationRow) {
    return c.json({ error: "Build not found." }, 404);
  }

  const projectRow = await orgContext.db.findProjectById(generationRow.project_id);
  if (!projectRow || projectRow.org_id !== orgContext.org.id) {
    return c.json({ error: "Build not found." }, 404);
  }

  const requestedLastEventId = c.req.header("last-event-id") ?? c.req.query("lastEventId") ?? null;

  return streamSSE(c, async (sse) => {
    let lastSentEventId = requestedLastEventId;
    let streamOpen = true;

    const writeEvent = async (event: { data: string; event: string; id: string }) => {
      if (!streamOpen || c.req.raw.signal.aborted) {
        return false;
      }

      try {
        await sse.writeSSE(event);
        return true;
      } catch {
        streamOpen = false;
        return false;
      }
    };

    while (!c.req.raw.signal.aborted && streamOpen) {
      const currentGenerationRow = await orgContext.db.findGenerationById(buildId);
      if (!currentGenerationRow) {
        break;
      }

      const currentProjectRow = await orgContext.db.findProjectById(currentGenerationRow.project_id);
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
          return;
        }
        lastSentEventId = event.id;

        if (isBuilderV3TerminalEvent(event)) {
          return;
        }
      }

      if (currentGenerationRow.status === "completed" || currentGenerationRow.status === "failed") {
        return;
      }

      await delay(BUILD_EVENT_POLL_INTERVAL_MS, undefined, {
        signal: c.req.raw.signal,
      }).catch(() => undefined);
    }
  });
});

export default buildsEventsRoute;
