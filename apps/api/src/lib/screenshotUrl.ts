import puppeteer, { type Browser } from "puppeteer-core";
import chromium from "@sparticuz/chromium-min";

const SCREENSHOT_TIMEOUT_MS = 8_000;
const SCREENSHOT_API_TIMEOUT_MS = 10_000;
const SCREENSHOT_CACHE_TTL_MS = 24 * 60 * 60 * 1_000;
const FALLBACK_SCREENSHOT_API_URL = "https://shot.screenshotapi.net/screenshot";

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

function buildFallbackScreenshotUrl(url: string): string {
  const screenshotUrl = new URL(FALLBACK_SCREENSHOT_API_URL);
  screenshotUrl.searchParams.set("url", url);
  screenshotUrl.searchParams.set("width", "1280");
  screenshotUrl.searchParams.set("height", "800");
  screenshotUrl.searchParams.set("output", "image");
  screenshotUrl.searchParams.set("file_type", "png");
  return screenshotUrl.toString();
}

async function fetchScreenshotViaApi(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SCREENSHOT_API_TIMEOUT_MS);

  try {
    const response = await fetch(buildFallbackScreenshotUrl(url), {
      signal: controller.signal,
    });

    if (!response.ok) {
      console.warn("[screenshotUrl] Screenshot API request failed.", {
        status: response.status,
        statusText: response.statusText,
        url,
      });
      return null;
    }

    const imageBuffer = Buffer.from(await response.arrayBuffer());
    const imageBase64 = imageBuffer.toString("base64");
    const returnedBase64 = imageBase64.length > 0;

    console.log("[screenshotUrl] Screenshot API completed.", {
      provider: "screenshotapi.net",
      returnedBase64,
      url,
    });

    return returnedBase64 ? imageBase64 : null;
  } catch (error) {
    console.warn("[screenshotUrl] Screenshot API fallback failed.", {
      error: toErrorMessage(error),
      url,
    });
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function screenshotUrl(url: string): Promise<string | null> {
  const cachedImage = readCachedScreenshot(url);
  if (cachedImage) {
    console.log("[screenshotUrl] Returning cached screenshot.", { url });
    return cachedImage;
  }

  let browser: Browser | null = null;

  try {
    const executablePath = await chromium.executablePath();
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: {
        width: 1280,
        height: 800,
      },
      executablePath,
      headless: true,
    });
    console.log("[screenshotUrl] Chromium launched successfully.", {
      executablePath,
      url,
    });

    const page = await browser.newPage();
    await page.goto(url, {
      timeout: SCREENSHOT_TIMEOUT_MS,
      waitUntil: "networkidle2",
    });

    const imageBase64 = await page.screenshot({
      type: "png",
      encoding: "base64",
    });

    const returnedBase64 = typeof imageBase64 === "string" && imageBase64.length > 0;
    console.log("[screenshotUrl] Chromium screenshot completed.", {
      returnedBase64,
      url,
    });

    if (returnedBase64) {
      screenshotCache.set(url, {
        imageBase64,
        timestamp: Date.now(),
      });

      return imageBase64;
    }

    console.warn("[screenshotUrl] Chromium screenshot returned an empty result.", { url });
  } catch (error) {
    console.warn("[screenshotUrl] Chromium screenshot failed.", {
      error: toErrorMessage(error),
      url,
    });
  } finally {
    if (browser) {
      await browser.close().catch(() => undefined);
    }
  }

  const fallbackImage = await fetchScreenshotViaApi(url);
  if (!fallbackImage) {
    console.warn("[screenshotUrl] All screenshot strategies failed.", { url });
    return null;
  }

  screenshotCache.set(url, {
    imageBase64: fallbackImage,
    timestamp: Date.now(),
  });

  return fallbackImage;
}
