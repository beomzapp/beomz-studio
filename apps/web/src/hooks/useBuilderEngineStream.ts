import { useCallback } from "react";
import { isBuilderV3TerminalEvent, type BuilderV3Event } from "@beomz-studio/contracts";

import {
  getBuildStatus,
  startBuild,
  streamBuildEvents,
  NetworkDisconnectError,
  StreamHttpError,
  type BuildStatusResponse,
  type StartBuildResponse,
} from "../lib/api";
import {
  isTerminalBuildStatus,
  sliceEventsAfterEventId,
  synthesizeTraceFromBuildStatus,
} from "../lib/builder-v3/events";
import type { BuilderTransportState } from "./useBuilderSessionHealth";

function normalizeOptionalEventId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timeoutId = window.setTimeout(() => resolve(), ms);

    signal?.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timeoutId);
        resolve();
      },
      { once: true },
    );
  });
}

interface SubscribeToBuildArgs {
  buildId: string;
  signal?: AbortSignal;
  lastEventId?: string | null;
  firstEventTimeoutMs?: number;
  pollIntervalMs?: number;
  onBuildStatus?: (status: BuildStatusResponse) => void;
  onEvent?: (event: BuilderV3Event) => void;
  onTransportChange?: (transport: BuilderTransportState) => void;
  onStreamError?: (message: string) => void;
}

interface StartAndStreamBuildArgs {
  body: Parameters<typeof startBuild>[0];
  signal?: AbortSignal;
  firstEventTimeoutMs?: number;
  pollIntervalMs?: number;
  onBuildStarted?: (response: StartBuildResponse) => void;
  onBuildStatus?: (status: BuildStatusResponse) => void;
  onEvent?: (event: BuilderV3Event) => void;
  onTransportChange?: (transport: BuilderTransportState) => void;
  onStreamError?: (message: string) => void;
}

export function useBuilderEngineStream() {
  const subscribeToBuild = useCallback(async ({
    buildId,
    signal,
    lastEventId = null,
    firstEventTimeoutMs = 15_000,
    pollIntervalMs = 2_000,
    onBuildStatus,
    onEvent,
    onTransportChange,
    onStreamError,
  }: SubscribeToBuildArgs): Promise<{ lastEventId: string | null }> => {
    const normalizedInitialEventId = normalizeOptionalEventId(lastEventId);
    if (lastEventId !== normalizedInitialEventId) {
      console.warn("[subscribeToBuild] Dropping invalid lastEventId before SSE subscribe.", {
        buildId,
        rawLastEventId: lastEventId,
        rawLastEventIdType: lastEventId === null ? "null" : typeof lastEventId,
      });
    }

    let latestEventId = normalizedInitialEventId;
    let terminal = false;
    let firstEventReceived = false;
    let pollingStarted = false;
    let pollingPromise: Promise<void> | null = null;
    // BEO-348: track consecutive network failures so we can emit a
    // NetworkDisconnectError after the server has been unreachable long
    // enough to treat it as a restart (vs a transient blip).
    let consecutiveNetworkFailures = 0;
    const DISCONNECT_THRESHOLD = 6; // ~12s at 2s wait between retries

    const emitEvent = (event: BuilderV3Event) => {
      if (event.id === latestEventId) {
        return;
      }

      latestEventId = event.id;
      firstEventReceived = true;
      // Got a live event — server is reachable, reset disconnect counter.
      consecutiveNetworkFailures = 0;
      onEvent?.(event);

      if (isBuilderV3TerminalEvent(event)) {
        terminal = true;
      }
    };

    const startPolling = () => {
      if (pollingStarted) {
        return;
      }

      pollingStarted = true;
      onTransportChange?.("polling");
      pollingPromise = (async () => {
        while (!terminal && !signal?.aborted) {
          const status = await getBuildStatus(buildId);
          onBuildStatus?.(status);

          const trace = synthesizeTraceFromBuildStatus(status);
          const nextEvents = sliceEventsAfterEventId(trace.events, latestEventId);

          for (const event of nextEvents) {
            emitEvent(event);
          }

          if (isTerminalBuildStatus(status.build.status)) {
            terminal = true;
            return;
          }

          await wait(pollIntervalMs, signal);
        }
      })().catch((error: unknown) => {
        onStreamError?.(
          error instanceof Error ? error.message : "Build status polling failed.",
        );
      });
    };

    const firstEventTimeoutId = window.setTimeout(() => {
      if (!firstEventReceived && !terminal && !signal?.aborted) {
        startPolling();
      }
    }, firstEventTimeoutMs);

    while (!terminal && !signal?.aborted) {
      try {
        console.log("[subscribeToBuild] Entering SSE attempt.", {
          buildId,
          lastEventId: latestEventId,
          lastEventIdType: latestEventId === null ? "null" : typeof latestEventId,
          signalAborted: signal?.aborted ?? false,
          signalConstructor: signal?.constructor?.name ?? "none",
        });
        onTransportChange?.(firstEventReceived ? "reconnecting" : "streaming");
        await streamBuildEvents({
          buildId,
          lastEventId: latestEventId,
          onEvent: emitEvent,
          signal,
        });

        if (terminal || signal?.aborted) {
          break;
        }

        startPolling();
        await wait(2_000, signal);
      } catch (error) {
        if (signal?.aborted) {
          break;
        }

        // Non-retryable HTTP errors — break the loop immediately
        if (error instanceof StreamHttpError) {
          if (error.status === 404) {
            onStreamError?.("Build not found — it may have been interrupted. Please try again.");
            terminal = true;
            break;
          }
          if (error.status === 410) {
            // Build superseded — switch to the latest build
            const latestBuildId = error.body?.latestBuildId as string | undefined;
            if (latestBuildId) {
              console.log("[subscribeToBuild] Build superseded, switching to", latestBuildId);
              try {
                const status = await getBuildStatus(latestBuildId);
                onBuildStatus?.(status);
                const trace = synthesizeTraceFromBuildStatus(status);
                for (const evt of trace.events) emitEvent(evt);
              } catch (switchErr) {
                onStreamError?.(
                  switchErr instanceof Error ? switchErr.message : "Failed to load superseded build.",
                );
              }
            } else {
              onStreamError?.("Build was superseded by a newer build.");
            }
            terminal = true;
            break;
          }
          // 4xx client errors (other than 404/410) — don't retry
          if (error.status >= 400 && error.status < 500) {
            onStreamError?.(error.message);
            terminal = true;
            break;
          }
        }

        // 5xx / network errors — retry with polling fallback.
        // BEO-348: if the server is unreachable for long enough, bubble up
        // a NetworkDisconnectError so the caller can show the amber card.
        consecutiveNetworkFailures += 1;
        if (consecutiveNetworkFailures >= DISCONNECT_THRESHOLD) {
          console.warn("[subscribeToBuild] Network disconnect threshold exceeded", {
            consecutiveNetworkFailures,
          });
          terminal = true;
          throw new NetworkDisconnectError();
        }

        onStreamError?.(
          error instanceof Error ? error.message : "Build events stream failed.",
        );
        startPolling();
        onTransportChange?.("reconnecting");
        await wait(2_000, signal);
      }
    }

    window.clearTimeout(firstEventTimeoutId);
    await pollingPromise;
    onTransportChange?.("idle");

    return { lastEventId: latestEventId };
  }, []);

  const startAndStreamBuild = useCallback(async ({
    body,
    signal,
    firstEventTimeoutMs,
    pollIntervalMs,
    onBuildStarted,
    onBuildStatus,
    onEvent,
    onTransportChange,
    onStreamError,
  }: StartAndStreamBuildArgs) => {
    const response = await startBuild(body);
    onBuildStarted?.(response);

    // BEO-conversational: if the trace already contains a terminal event the build
    // resolved synchronously (conversational plan summary, clarifying question, etc.).
    // Replay the events directly from the initial response so pendingImplementPlanRef
    // is set immediately — no SSE round-trip needed and no risk of the connection
    // failing before the conversational_response event is processed.
    const traceEvents = response.trace.events;
    const hasTerminalEvent = traceEvents.some(e => e.type === "done" || e.type === "error");

    if (hasTerminalEvent) {
      console.log("[startAndStreamBuild] Terminal event in initial trace — replaying directly.", {
        eventCount: traceEvents.length,
        types: traceEvents.map(e => e.type),
        buildStatus: response.build.status,
      });
      for (const event of traceEvents) {
        onEvent?.(event);
      }
      return response;
    }

    await subscribeToBuild({
      buildId: response.build.id,
      firstEventTimeoutMs,
      lastEventId: response.trace.lastEventId,
      onBuildStatus,
      onEvent,
      onStreamError,
      onTransportChange,
      pollIntervalMs,
      signal,
    });

    return response;
  }, [subscribeToBuild]);

  return {
    startAndStreamBuild,
    subscribeToBuild,
  };
}
