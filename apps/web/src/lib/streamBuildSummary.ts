/**
 * streamBuildSummary — streams a post-build AI summary via the API server.
 * The API key stays on the server; no VITE_ANTHROPIC_API_KEY needed.
 * Yields text deltas as an async generator for typewriter rendering.
 */
import { getAccessToken, getApiBaseUrl } from "./api";

export async function* streamBuildSummary(
  userPrompt: string,
  buildInfo: string,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  let token: string;
  try {
    token = await getAccessToken();
  } catch {
    return;
  }

  const res = await fetch(`${getApiBaseUrl()}/builds/summary`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ userPrompt, buildInfo }),
    signal,
  });

  if (!res.ok || !res.body) return;

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (data === "[DONE]") return;
      yield data;
    }
  }
}
