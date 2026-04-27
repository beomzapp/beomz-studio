import { Hono } from "hono";

const imageProxyRoute = new Hono();

imageProxyRoute.get("/image", async (c) => {
  const rawUrl = c.req.query("url")?.trim();

  if (!rawUrl) {
    return c.json({ error: "Missing url query parameter." }, 400);
  }

  let upstreamUrl: URL;
  try {
    upstreamUrl = new URL(rawUrl);
  } catch {
    return c.json({ error: "Invalid image URL." }, 400);
  }

  if (upstreamUrl.protocol !== "http:" && upstreamUrl.protocol !== "https:") {
    return c.json({ error: "Image URL must use http or https." }, 400);
  }

  try {
    const upstreamResponse = await fetch(upstreamUrl, {
      headers: {
        accept: "image/*,*/*;q=0.8",
        "user-agent": "BeomzStudioImageProxy/1.0",
      },
      redirect: "follow",
    });

    if (!upstreamResponse.ok) {
      return c.json({
        error: `Upstream image request failed with ${upstreamResponse.status}.`,
      }, 502);
    }

    const contentType = upstreamResponse.headers.get("content-type") ?? "application/octet-stream";
    const cacheControl = upstreamResponse.headers.get("cache-control");
    const contentLength = upstreamResponse.headers.get("content-length");

    return new Response(upstreamResponse.body, {
      headers: {
        "access-control-allow-origin": "*",
        ...(cacheControl ? { "cache-control": cacheControl } : {}),
        ...(contentLength ? { "content-length": contentLength } : {}),
        "content-type": contentType,
        "cross-origin-resource-policy": "cross-origin",
      },
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
    });
  } catch (error) {
    return c.json({
      error: error instanceof Error ? error.message : "Image proxy failed.",
    }, 502);
  }
});

export default imageProxyRoute;
