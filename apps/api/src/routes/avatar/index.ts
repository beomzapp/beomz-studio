import { Hono } from "hono";

const avatarRoute = new Hono();

avatarRoute.get("/", async (c) => {
  const url = c.req.query("url");

  if (!url) {
    return c.json({ error: "url parameter is required" }, 400);
  }

  // Only allow Google avatar URLs for security
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return c.json({ error: "Invalid URL" }, 400);
  }

  if (!parsed.hostname.endsWith("googleusercontent.com")) {
    return c.json({ error: "Only Google avatar URLs are allowed" }, 403);
  }

  try {
    const response = await fetch(url, {
      headers: { "user-agent": "Beomz-Avatar-Proxy/1.0" },
    });

    if (!response.ok) {
      return c.json({ error: "Failed to fetch avatar" }, 502);
    }

    const contentType = response.headers.get("content-type") || "image/jpeg";
    const body = await response.arrayBuffer();

    return new Response(body, {
      headers: {
        "content-type": contentType,
        "cache-control": "public, max-age=86400",
        "cross-origin-resource-policy": "cross-origin",
      },
    });
  } catch {
    return c.json({ error: "Avatar proxy failed" }, 502);
  }
});

export default avatarRoute;
