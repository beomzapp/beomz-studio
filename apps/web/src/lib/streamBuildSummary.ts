/**
 * streamBuildSummary — streams a post-build AI summary from Claude Haiku.
 * Yields text deltas as an async generator for typewriter rendering.
 */
export async function* streamBuildSummary(
  userPrompt: string,
  buildInfo: string,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
  if (!apiKey) return;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      stream: true,
      system:
        "You are Beomz, a friendly app builder assistant. The user asked you to build something and you just finished building it. Write a short, conversational summary (2-3 sentences) of what you built. Mention the key features you included. End by asking what they'd like to change. Do not use markdown formatting.",
      messages: [
        {
          role: "user",
          content: `User request: "${userPrompt}"\n\nBuild result: ${buildInfo}`,
        },
      ],
    }),
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
      try {
        const parsed = JSON.parse(data);
        if (parsed.type === "content_block_delta" && parsed.delta?.text) {
          yield parsed.delta.text as string;
        }
      } catch {
        // skip malformed chunks
      }
    }
  }
}
