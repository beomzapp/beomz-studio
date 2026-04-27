import { Hono } from "hono";

const imageProxyRoute = new Hono();
const IMAGE_FETCH_HEADERS = {
  accept: "image/*,*/*;q=0.8",
  "user-agent": "BeomzStudioImageProxy/1.0",
} as const;

interface UnsplashRandomPhotoResponse {
  urls?: {
    raw?: string;
    full?: string;
    regular?: string;
  };
}

function parseSourceUnsplashSize(url: URL): { width: number; height: number } | null {
  const match = url.pathname.match(/\/(\d+)x(\d+)\/?$/);
  if (!match) {
    return null;
  }

  const width = Number.parseInt(match[1] ?? "", 10);
  const height = Number.parseInt(match[2] ?? "", 10);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }

  return { width, height };
}

function extractSourceUnsplashQuery(url: URL): string {
  return decodeURIComponent(url.search.slice(1)).trim();
}

async function resolveSourceUnsplashUrl(url: URL): Promise<URL> {
  const size = parseSourceUnsplashSize(url);
  const query = extractSourceUnsplashQuery(url) || "photo";
  const response = await fetch(`https://unsplash.com/napi/photos/random?query=${encodeURIComponent(query)}`, {
    headers: {
      accept: "application/json",
      "user-agent": IMAGE_FETCH_HEADERS["user-agent"],
    },
  });

  if (!response.ok) {
    throw new Error(`Unsplash resolver failed with ${response.status}.`);
  }

  const payload = await response.json() as UnsplashRandomPhotoResponse;
  const candidateUrl = payload.urls?.raw ?? payload.urls?.full ?? payload.urls?.regular;
  if (!candidateUrl) {
    throw new Error("Unsplash resolver did not return an image URL.");
  }

  const resolvedUrl = new URL(candidateUrl);
  if (size) {
    resolvedUrl.searchParams.set("w", String(size.width));
    resolvedUrl.searchParams.set("h", String(size.height));
    resolvedUrl.searchParams.set("fit", "crop");
    resolvedUrl.searchParams.set("crop", "entropy");
    resolvedUrl.searchParams.set("fm", "jpg");
    resolvedUrl.searchParams.set("q", "80");
  }

  return resolvedUrl;
}

async function fetchUpstreamImage(url: URL): Promise<Response> {
  const targetUrl = url.hostname === "source.unsplash.com"
    ? await resolveSourceUnsplashUrl(url)
    : url;

  return fetch(targetUrl, {
    headers: IMAGE_FETCH_HEADERS,
    redirect: "follow",
  });
}

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
    const upstreamResponse = await fetchUpstreamImage(upstreamUrl);

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
