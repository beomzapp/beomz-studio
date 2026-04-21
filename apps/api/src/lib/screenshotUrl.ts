const SCREENSHOT_TIMEOUT_MS = 10_000;
const SCREENSHOT_CACHE_TTL_MS = 24 * 60 * 60 * 1_000;
const SCREENSHOT_API_URL = "https://shot.screenshotapi.net/screenshot";
const MICROLINK_API_URL = "https://api.microlink.io/";

interface CachedScreenshot {
  imageBase64: string;
  timestamp: number;
}

const screenshotCache = new Map<string, CachedScreenshot>();

function readCachedScreenshot(url: string): string | null {
  const cached = screenshotCache.get(url);
  if (!cached) {
    return null;
  }

  if (Date.now() - cached.timestamp > SCREENSHOT_CACHE_TTL_MS) {
    screenshotCache.delete(url);
    return null;
  }

  return cached.imageBase64;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function buildScreenshotApiUrl(url: string): string {
  const screenshotUrl = new URL(SCREENSHOT_API_URL);
  screenshotUrl.searchParams.set("token", "");
  screenshotUrl.searchParams.set("url", url);
  screenshotUrl.searchParams.set("width", "1280");
  screenshotUrl.searchParams.set("height", "800");
  screenshotUrl.searchParams.set("output", "image");
  screenshotUrl.searchParams.set("file_type", "png");
  screenshotUrl.searchParams.set("wait_for_event", "load");
  return screenshotUrl.toString();
}

function buildMicrolinkScreenshotUrl(url: string): string {
  const screenshotUrl = new URL(MICROLINK_API_URL);
  screenshotUrl.searchParams.set("url", url);
  screenshotUrl.searchParams.set("screenshot", "true");
  screenshotUrl.searchParams.set("meta", "false");
  screenshotUrl.searchParams.set("embed", "screenshot.url");
  return screenshotUrl.toString();
}

async function fetchScreenshotAsBase64(url: string, provider: "screenshotapi" | "microlink"): Promise<string | null> {
  const requestUrl = provider === "screenshotapi"
    ? buildScreenshotApiUrl(url)
    : buildMicrolinkScreenshotUrl(url);

  try {
    const response = await fetch(requestUrl, {
      signal: AbortSignal.timeout(SCREENSHOT_TIMEOUT_MS),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      console.warn("[screenshotUrl] Screenshot API request failed.", {
        provider,
        status: response.status,
        statusText: response.statusText,
        responseBody: errorBody.slice(0, 200),
        url,
      });
      return null;
    }

    const imageBase64 = Buffer.from(await response.arrayBuffer()).toString("base64");
    const returnedBase64 = imageBase64.length > 0;

    console.log("[screenshotUrl] Screenshot API completed.", {
      provider,
      returnedBase64,
      url,
    });

    return returnedBase64 ? imageBase64 : null;
  } catch (error) {
    console.warn("[screenshotUrl] Screenshot API failed.", {
      provider,
      error: toErrorMessage(error),
      url,
    });
    return null;
  }
}

export async function screenshotUrl(url: string): Promise<string | null> {
  console.log("[screenshotUrl] called for:", url);

  const cachedImage = readCachedScreenshot(url);
  if (cachedImage) {
    console.log("[screenshotUrl] Returning cached screenshot.", { url });
    return cachedImage;
  }

  const imageBase64 = await fetchScreenshotAsBase64(url, "screenshotapi")
    ?? await fetchScreenshotAsBase64(url, "microlink");

  if (!imageBase64) {
    return null;
  }

  screenshotCache.set(url, {
    imageBase64,
    timestamp: Date.now(),
  });

  return imageBase64;
}
