/**
 * useSSEBuildStream — BEO-715 Track A · 2a
 *
 * Owns the AbortController for an in-flight build's SSE subscription.
 * Wraps an existing `subscribe` callback (typically
 * `useBuildChat.subscribeToExistingBuild`) so the underlying stream layer
 * (`lib/api.ts::streamBuildEvents` + `useBuilderEngineStream.ts`) is NOT
 * re-implemented here.
 *
 * ### Lifecycle contract
 * - `buildId` becomes non-null      → fresh AbortController, `subscribe(buildId, lastEventId, signal)` invoked exactly once.
 * - `buildId` changes value         → previous controller aborted, new one created (auto-stops a stale resume when a new build takes over).
 * - `buildId` becomes null          → previous controller aborted (caller-driven stop, e.g. timeout, user clicks Stop).
 * - True unmount                    → previous controller aborted.
 * - Parent re-render with same      → NO-OP. Stable values are kept in refs.
 *   buildId
 *
 * ### Why this exists (audit findings)
 * Before this hook, `ProjectPage`'s resume effect manually created an
 * `AbortController` inside an async IIFE and called `subscribeToExistingBuild`
 * on it. Two problems showed up in production:
 *   1. The dep array used to include `build`, which made `setBuild()` inside
 *      the IIFE abort the controller mid-flight (BEO-691). Already patched.
 *   2. A new send during a still-streaming resume created a SECOND controller
 *      in `useBuildChat::abortRef`; the resume controller stayed live and
 *      the user briefly held two SSE connections. (R1 in audit.)
 *
 * This hook's controller is keyed on `buildId`, so when the caller flips
 * `buildId` to a new value (or null) the previous controller aborts before
 * the new one starts — single-owner per active build.
 */
import { useEffect, useRef, useState } from "react";

export type SSEBuildStreamStatus = "idle" | "streaming" | "closed" | "error";

export interface UseSSEBuildStreamOptions {
  /** Build to subscribe to. Pass null when no build is in flight. */
  buildId: string | null;
  /** Last event id seen — passed to `subscribe` once on start. */
  lastEventId: string | null;
  /**
   * The subscription function. Typically
   * `useBuildChat.subscribeToExistingBuild`. Called once per `buildId`
   * change with a fresh `AbortSignal`. The hook does not interpret the
   * promise's resolution beyond status reporting.
   */
  subscribe: (
    buildId: string,
    lastEventId: string | null,
    signal: AbortSignal,
  ) => Promise<void>;
}

export interface UseSSEBuildStreamResult {
  /** "streaming" while the subscribe promise is pending. */
  status: SSEBuildStreamStatus;
  /** `status === "streaming"`. */
  isConnected: boolean;
  /** Last non-abort error message from the subscribe promise. */
  error: string | null;
}

/**
 * @see {@link UseSSEBuildStreamOptions} for the contract.
 */
export function useSSEBuildStream(
  options: UseSSEBuildStreamOptions,
): UseSSEBuildStreamResult {
  const { buildId } = options;
  const [status, setStatus] = useState<SSEBuildStreamStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  // Refs hold values that should NOT trigger a re-subscribe on change.
  // Only buildId drives the lifecycle (see effect deps below).
  const subscribeRef = useRef(options.subscribe);
  subscribeRef.current = options.subscribe;
  const lastEventIdRef = useRef(options.lastEventId);
  lastEventIdRef.current = options.lastEventId;

  useEffect(() => {
    if (!buildId) {
      setStatus("idle");
      setError(null);
      return;
    }

    const controller = new AbortController();
    let cancelled = false;
    setStatus("streaming");
    setError(null);

    void subscribeRef.current(buildId, lastEventIdRef.current, controller.signal)
      .then(() => {
        if (cancelled) return;
        setStatus("closed");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const name = err instanceof Error ? err.name : "";
        if (name === "AbortError" || controller.signal.aborted) {
          setStatus("closed");
          return;
        }
        const message = err instanceof Error ? err.message : String(err);
        setStatus("error");
        setError(message);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
    // BEO-715: intentionally omitted: [subscribe, lastEventId] —
    // both are read via refs so the lifecycle is keyed solely on buildId.
    // Including them would cause spurious re-subscribes on parent re-renders
    // (the original audit-reported bug from BEO-691).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildId]);

  return {
    status,
    isConnected: status === "streaming",
    error,
  };
}
