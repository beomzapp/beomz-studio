import type {
  ClarifyResponse,
  GetLatestActivePlanSessionResponse,
  GetPlanSessionResponse,
  PlanGenerateRequest,
  PlanResponse,
} from "@beomz-studio/contracts";

import {
  createPlanSession,
  getAccessToken,
  getApiBaseUrl,
  getLatestActivePlanSession,
  getPlanSession,
  updatePlanSession,
} from "./api";

function decodeJsonStringFragment(value: string): string {
  return value
    .replace(/\\n/g, "\n")
    .replace(/\\"/g, "\"")
    .replace(/\\\\/g, "\\");
}

function extractStringFieldFromPartialJson(
  buffer: string,
  field: "intro" | "summary",
): string {
  const match = buffer.match(
    new RegExp(`"${field}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)`),
  );
  return match ? decodeJsonStringFragment(match[1]) : "";
}

export function extractIntroFromPartialJson(buffer: string): string {
  return extractStringFieldFromPartialJson(buffer, "intro");
}

export function extractSummaryFromPartialJson(buffer: string): string {
  return extractStringFieldFromPartialJson(buffer, "summary");
}

export function tryParseComplete<T>(buffer: string): T | null {
  try {
    return JSON.parse(buffer) as T;
  } catch {
    return null;
  }
}

async function streamPlanJson<T>(input: {
  body: unknown;
  onToken: (text: string) => void;
  path: "/plan/clarify" | "/plan/generate";
  partialExtractor: (buffer: string) => string;
}): Promise<T> {
  const accessToken = await getAccessToken();
  const response = await fetch(`${getApiBaseUrl()}${input.path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(input.body),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null) as
      | { error?: string }
      | null;
    throw new Error(errorBody?.error ?? `Request failed with ${response.status}.`);
  }

  if (!response.body) {
    throw new Error("Streaming response body missing.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let chunkBuffer = "";
  let eventData = "";
  let jsonBuffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    chunkBuffer += decoder.decode(value, { stream: true });
    const lines = chunkBuffer.split("\n");
    chunkBuffer = lines.pop() ?? "";

    for (const rawLine of lines) {
      const line = rawLine.replace(/\r$/, "");
      if (line.startsWith("data: ")) {
        eventData += line.slice(6);
        continue;
      }

      if (line === "") {
        if (eventData === "[DONE]") {
          eventData = "";
          continue;
        }

        if (eventData.length > 0) {
          jsonBuffer += eventData;
          input.onToken(input.partialExtractor(jsonBuffer));
        }

        eventData = "";
      }
    }
  }

  if (eventData.length > 0 && eventData !== "[DONE]") {
    jsonBuffer += eventData;
    input.onToken(input.partialExtractor(jsonBuffer));
  }

  const parsed = tryParseComplete<T>(jsonBuffer);
  if (!parsed) {
    throw new Error("Failed to parse streamed planning response.");
  }

  return parsed;
}

export async function streamPlanClarify(
  prompt: string,
  onToken: (text: string) => void,
): Promise<ClarifyResponse> {
  return streamPlanJson<ClarifyResponse>({
    body: { prompt },
    onToken,
    partialExtractor: extractIntroFromPartialJson,
    path: "/plan/clarify",
  });
}

export async function streamPlanGenerate(
  prompt: string,
  answers: PlanGenerateRequest["answers"],
  onToken: (text: string) => void,
): Promise<PlanResponse> {
  return streamPlanJson<PlanResponse>({
    body: { answers, prompt },
    onToken,
    partialExtractor: extractSummaryFromPartialJson,
    path: "/plan/generate",
  });
}

export {
  createPlanSession,
  getLatestActivePlanSession,
  getPlanSession,
  updatePlanSession,
};

export type {
  GetLatestActivePlanSessionResponse,
  GetPlanSessionResponse,
};
