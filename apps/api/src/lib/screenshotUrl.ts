const SCREENSHOT_TIMEOUT_MS = 10_000;
const SCREENSHOT_CACHE_TTL_MS = 24 * 60 * 60 * 1_000;
const SCREENSHOT_API_URL = "https://shot.screenshotapi.net/screenshot";
const MICROLINK_API_URL = "https://api.microlink.io/";
const SCREENSHOT_PROVIDERS = ["screenshotapi", "microlink"] as const;

type ScreenshotProvider = (typeof SCREENSHOT_PROVIDERS)[number];

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

function readMicrolinkScreenshotUrl(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const data = (payload as { data?: unknown }).data;
  if (typeof data !== "object" || data === null) {
    return null;
  }

  const screenshot = (data as { screenshot?: unknown }).screenshot;
  if (typeof screenshot !== "object" || screenshot === null) {
    return null;
  }

  const screenshotUrl = (screenshot as { url?: unknown }).url;
  return typeof screenshotUrl === "string" && screenshotUrl.trim().length > 0
    ? screenshotUrl.trim()
    : null;
}

async function fetchScreenshotApiAsBase64(url: string): Promise<string | null> {
  const requestUrl = buildScreenshotApiUrl(url);

  try {
    const response = await fetch(requestUrl, {
      signal: AbortSignal.timeout(SCREENSHOT_TIMEOUT_MS),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      console.warn("[screenshotUrl] Provider request failed.", {
        provider: "screenshotapi",
        status: response.status,
        statusText: response.statusText,
        responseBody: errorBody.slice(0, 200),
        url,
      });
      return null;
    }

    const imageBase64 = Buffer.from(await response.arrayBuffer()).toString("base64");
    const returnedBase64 = imageBase64.length > 0;

    console.log("[screenshotUrl] Provider request completed.", {
      provider: "screenshotapi",
      returnedBase64,
      url,
    });

    return returnedBase64 ? imageBase64 : null;
  } catch (error) {
    console.warn("[screenshotUrl] Provider request threw.", {
      provider: "screenshotapi",
      error: toErrorMessage(error),
      url,
    });
    return null;
  }
}

async function fetchMicrolinkAsBase64(url: string): Promise<string | null> {
  const requestUrl = buildMicrolinkScreenshotUrl(url);

  try {
    const response = await fetch(requestUrl, {
      signal: AbortSignal.timeout(SCREENSHOT_TIMEOUT_MS),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      console.warn("[screenshotUrl] Provider request failed.", {
        provider: "microlink",
        status: response.status,
        statusText: response.statusText,
        responseBody: errorBody.slice(0, 200),
        url,
      });
      return null;
    }

    const contentType = (response.headers.get("content-type") ?? "").toLowerCase();

    if (contentType.includes("application/json")) {
      const payload = await response.json().catch(() => null);
      const screenshotAssetUrl = readMicrolinkScreenshotUrl(payload);
      if (!screenshotAssetUrl) {
        console.warn("[screenshotUrl] Microlink payload missing screenshot URL.", { url });
        return null;
      }

      const imageResponse = await fetch(screenshotAssetUrl, {
        signal: AbortSignal.timeout(SCREENSHOT_TIMEOUT_MS),
      });
      if (!imageResponse.ok) {
        const errorBody = await imageResponse.text().catch(() => "");
        console.warn("[screenshotUrl] Microlink screenshot asset request failed.", {
          status: imageResponse.status,
          statusText: imageResponse.statusText,
          responseBody: errorBody.slice(0, 200),
          screenshotAssetUrl,
          url,
        });
        return null;
      }

      const imageBase64 = Buffer.from(await imageResponse.arrayBuffer()).toString("base64");
      const returnedBase64 = imageBase64.length > 0;

      console.log("[screenshotUrl] Provider request completed.", {
        provider: "microlink",
        returnedBase64,
        url,
      });

      return returnedBase64 ? imageBase64 : null;
    }

    const imageBase64 = Buffer.from(await response.arrayBuffer()).toString("base64");
    const returnedBase64 = imageBase64.length > 0;

    console.log("[screenshotUrl] Provider request completed.", {
      provider: "microlink",
      returnedBase64,
      url,
    });

    return returnedBase64 ? imageBase64 : null;
  } catch (error) {
    console.warn("[screenshotUrl] Provider request threw.", {
      provider: "microlink",
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

  let imageBase64: string | null = null;
  for (let index = 0; index < SCREENSHOT_PROVIDERS.length; index += 1) {
    const provider = SCREENSHOT_PROVIDERS[index] as ScreenshotProvider;
    const nextProvider = SCREENSHOT_PROVIDERS[index + 1] ?? null;

    console.log("[screenshotUrl] Provider attempt starting.", {
      provider,
      url,
    });

    imageBase64 = provider === "screenshotapi"
      ? await fetchScreenshotApiAsBase64(url)
      : await fetchMicrolinkAsBase64(url);

    if (imageBase64) {
      break;
    }

    console.warn("[screenshotUrl] Provider returned no screenshot.", {
      provider,
      nextProvider,
      url,
    });
  }

  if (!imageBase64) {
    console.warn("[screenshotUrl] All screenshot providers failed.", { url });
    return null;
  }

  screenshotCache.set(url, {
    imageBase64,
    timestamp: Date.now(),
  });

  return imageBase64;
}
