export async function getDeferredItems(prompt: string): Promise<string[]> {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY ?? "";
  if (!apiKey) return ["Advanced settings", "User management", "Analytics dashboard"];
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
        model: "claude-sonnet-4-6",
        max_tokens: 150,
        system: `You are a software architect. Given an app idea, identify the top 3 features that would be deferred to Phase 2 (not in the MVP). Return ONLY a valid JSON array of 3 short feature names. Example: ["User authentication", "Admin dashboard", "Email notifications"]`,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const data = await res.json();
    return JSON.parse(data.content[0].text.trim());
  } catch {
    return ["Advanced settings", "User management", "Analytics dashboard"];
  }
}
