import puppeteer, { type Browser } from "puppeteer-core";
import chromium from "@sparticuz/chromium-min";

const SCREENSHOT_TIMEOUT_MS = 8_000;
const SCREENSHOT_CACHE_TTL_MS = 24 * 60 * 60 * 1_000;

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

export async function screenshotUrl(url: string): Promise<string | null> {
  const cachedImage = readCachedScreenshot(url);
  if (cachedImage) {
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

    const page = await browser.newPage();
    await page.goto(url, {
      timeout: SCREENSHOT_TIMEOUT_MS,
      waitUntil: "networkidle2",
    });

    const imageBase64 = await page.screenshot({
      type: "png",
      encoding: "base64",
    });

    if (typeof imageBase64 !== "string" || imageBase64.length === 0) {
      return null;
    }

    screenshotCache.set(url, {
      imageBase64,
      timestamp: Date.now(),
    });

    return imageBase64;
  } catch {
    return null;
  } finally {
    if (browser) {
      await browser.close().catch(() => undefined);
    }
  }
}
