import { useCallback } from "react";
import { isBuilderV3TerminalEvent, type BuilderV3Event } from "@beomz-studio/contracts";

import {
  getBuildStatus,
  startBuild,
  streamBuildEvents,
  type BuildStatusResponse,
  type StartBuildResponse,
} from "../lib/api";
import {
  isTerminalBuildStatus,
  sliceEventsAfterEventId,
  synthesizeTraceFromBuildStatus,
} from "../lib/builder-v3/events";
import type { BuilderTransportState } from "./useBuilderSessionHealth";

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
    let latestEventId = lastEventId;
    let terminal = false;
    let firstEventReceived = false;
    let pollingStarted = false;
    let pollingPromise: Promise<void> | null = null;

    const emitEvent = (event: BuilderV3Event) => {
      if (event.id === latestEventId) {
        return;
      }

      latestEventId = event.id;
      firstEventReceived = true;
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
