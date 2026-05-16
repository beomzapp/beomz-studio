import type {
  BuilderV3Event,
  BuilderV3TraceMetadata,
  BuilderV3TranscriptEntry,
} from "@beomz-studio/contracts";

import type { BuildStatusResponse } from "../api";

export function isTerminalBuildStatus(status: BuildStatusResponse["build"]["status"]): boolean {
  return status === "completed" || status === "failed" || status === "cancelled";
}

export function sliceEventsAfterEventId(
  events: readonly BuilderV3Event[],
  lastEventId: string | null,
): readonly BuilderV3Event[] {
  if (!lastEventId) {
    return events;
  }

  const lastIndex = events.findIndex((event) => event.id === lastEventId);
  return lastIndex === -1 ? events : events.slice(lastIndex + 1);
}

export function synthesizeTraceFromBuildStatus(
  response: BuildStatusResponse,
): BuilderV3TraceMetadata {
  if (response.trace.events.length > 0) {
    return response.trace;
  }

  const operation = response.build.operationId === "projectIteration"
    ? "iteration"
    : "initial_build";
  const phase = response.build.phase ?? "queued";
  const fallbackUsed = response.build.source === "fallback";
  const previewEntryPath = response.result?.previewEntryPath ?? response.project.previewEntryPath;
  const events: BuilderV3Event[] = [
    {
      code: `status_${phase}`,
      id: `${response.build.id}:${phase}:${response.build.status}`,
      message: response.build.summary ?? `Build is ${phase}.`,
      operation,
      phase,
      timestamp: response.build.completedAt ?? response.build.startedAt,
      type: "status",
    },
  ];

  if (response.build.status === "completed") {
    events.push({
      buildId: response.build.id,
      code: "preview_ready",
      fallbackReason: null,
      fallbackUsed,
      id: `${response.build.id}:preview-ready`,
      message: "Preview is ready for the studio client.",
      operation,
      payload: {
        source: response.build.source ?? "ai",
      },
      previewEntryPath,
      projectId: response.build.projectId,
      timestamp: response.build.completedAt ?? response.build.startedAt,
      type: "preview_ready",
    });
    events.push({
      buildId: response.build.id,
      code: "build_completed",
      fallbackReason: null,
      fallbackUsed,
      id: `${response.build.id}:done`,
      message: response.build.summary ?? "Build completed.",
      operation,
      payload: {
        source: response.build.source ?? "ai",
      },
      projectId: response.build.projectId,
      timestamp: response.build.completedAt ?? response.build.startedAt,
      type: "done",
    });
  }

  if (response.build.status === "failed" || response.build.status === "cancelled") {
    events.push({
      buildId: response.build.id,
      code: "build_failed",
      id: `${response.build.id}:error`,
      message: response.build.error ?? "Build failed.",
      operation,
      payload: {
        phase,
      },
      projectId: response.build.projectId,
      timestamp: response.build.completedAt ?? response.build.startedAt,
      type: "error",
    });
  }

  return {
    events,
    lastEventId: events.at(-1)?.id ?? null,
    previewReady: response.build.status === "completed",
    fallbackReason: null,
    fallbackUsed,
  };
}

export function eventToTranscriptEntry(event: BuilderV3Event): BuilderV3TranscriptEntry | null {
  switch (event.type) {
    case "assistant_delta":
      // Raw code tokens from the Temporal worker — never show in chat
      return null;
    case "status":
      return {
        code: event.code,
        id: event.id,
        kind: "status",
        message: event.message,
        timestamp: event.timestamp,
      };
    case "tool_use_started":
    case "tool_use_progress":
      return {
        code: event.code,
        id: event.id,
        kind: "tool_use",
        message: event.message,
        payload: event.payload ?? null,
        status: "running",
        timestamp: event.timestamp,
        toolName: event.tool_name,
        toolUseId: event.tool_use_id,
      };
    case "tool_result":
      return {
        code: event.code,
        id: event.id,
        kind: "tool_result",
        message: event.message,
        payload: event.payload ?? null,
        status: event.status,
        timestamp: event.timestamp,
        toolName: event.tool_name,
        toolUseId: event.tool_use_id,
      };
    case "preview_ready":
      return {
        code: event.code,
        id: event.id,
        kind: "status",
        message: event.message,
        payload: event.payload ?? null,
        status: "success",
        timestamp: event.timestamp,
      };
    case "done":
      return {
        code: event.code,
        id: event.id,
        kind: "done",
        message: event.message,
        payload: event.payload ?? null,
        status: "success",
        timestamp: event.timestamp,
      };
    case "error":
      return {
        code: event.code,
        id: event.id,
        kind: "error",
        message: event.message,
        payload: event.payload ?? null,
        status: "error",
        timestamp: event.timestamp,
        toolName: event.tool_name,
        toolUseId: event.tool_use_id,
      };
    default:
      return null;
  }
}
