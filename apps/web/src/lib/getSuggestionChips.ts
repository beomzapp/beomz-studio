/**
 * getSuggestionChips — calls Haiku to generate 3 contextual follow-on
 * suggestions after a build completes.
 */
export async function getSuggestionChips(prompt: string): Promise<string[]> {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY ?? "";
  if (!apiKey) return [];
  try {
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
        max_tokens: 120,
        system:
          "You help users iterate on apps they just built. Given the user's original prompt, suggest 3 short follow-on actions they might want next (e.g. add a feature, change styling, add a page). Each suggestion must be under 8 words. Return ONLY a valid JSON array of 3 strings, no markdown.",
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const data = await res.json();
    const parsed: unknown = JSON.parse(data.content[0].text.trim());
    if (Array.isArray(parsed) && parsed.length >= 3) {
      return parsed.slice(0, 3).map(String);
    }
    return [];
  } catch {
    return [];
  }
}
