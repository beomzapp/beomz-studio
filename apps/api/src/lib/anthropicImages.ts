const DATA_URL_PATTERN = /^data:(image\/(?:png|jpeg|jpg|webp|gif));base64,([A-Za-z0-9+/=\s]+)$/i;
const REMOTE_IMAGE_FETCH_TIMEOUT_MS = 10_000;

type SupportedMediaType = "image/png" | "image/jpeg" | "image/webp" | "image/gif";

export type AnthropicImageSource =
  | { type: "url"; url: string }
  | { type: "base64"; media_type: SupportedMediaType; data: string };

interface ResolveAnthropicImageSourceOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

function normaliseMediaType(value: string): SupportedMediaType | null {
  const lower = value.trim().toLowerCase();
  if (lower === "image/jpg") {
    return "image/jpeg";
  }

  if (
    lower === "image/png"
    || lower === "image/jpeg"
    || lower === "image/webp"
    || lower === "image/gif"
  ) {
    return lower;
  }

  return null;
}

function inferMediaTypeFromUrlPath(value: string): SupportedMediaType | null {
  const lower = value.trim().toLowerCase();
  if (lower.endsWith(".png")) {
    return "image/png";
  }

  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
    return "image/jpeg";
  }

  if (lower.endsWith(".webp")) {
    return "image/webp";
  }

  if (lower.endsWith(".gif")) {
    return "image/gif";
  }

  return null;
}

export function isSupportedAnthropicImageUrl(value: string): boolean {
  const trimmed = value.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return true;
  }

  const dataUrlMatch = trimmed.match(DATA_URL_PATTERN);
  if (!dataUrlMatch) {
    return false;
  }

  return normaliseMediaType(dataUrlMatch[1] ?? "") !== null;
}

export function buildAnthropicImageSource(imageUrl: string): AnthropicImageSource {
  const trimmed = imageUrl.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return { type: "url", url: trimmed };
  }

  const dataUrlMatch = trimmed.match(DATA_URL_PATTERN);
  if (!dataUrlMatch) {
    throw new Error("Unsupported image URL format.");
  }

  const mediaType = normaliseMediaType(dataUrlMatch[1] ?? "");
  if (!mediaType) {
    throw new Error("Unsupported image media type.");
  }

  return {
    type: "base64",
    media_type: mediaType,
    data: (dataUrlMatch[2] ?? "").replace(/\s+/g, ""),
  };
}

export async function resolveAnthropicImageSource(
  imageUrl: string,
  options: ResolveAnthropicImageSourceOptions = {},
): Promise<Exclude<AnthropicImageSource, { type: "url" }>> {
  const trimmed = imageUrl.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    const source = buildAnthropicImageSource(trimmed);
    if (source.type === "url") {
      throw new Error("Expected non-URL image source.");
    }
    return source;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs ?? REMOTE_IMAGE_FETCH_TIMEOUT_MS);

  try {
    const response = await (options.fetchImpl ?? fetch)(trimmed, {
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Image fetch failed with ${response.status}`);
    }

    const contentTypeHeader = response.headers.get("content-type") ?? "";
    const mediaType = normaliseMediaType(contentTypeHeader.split(";")[0] ?? "")
      ?? inferMediaTypeFromUrlPath(new URL(trimmed).pathname);

    if (!mediaType) {
      throw new Error(`Unsupported image media type: ${contentTypeHeader || "unknown"}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    return {
      type: "base64",
      media_type: mediaType,
      data: buffer.toString("base64"),
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

export function buildAnthropicImageBlock(imageUrl: string): {
  type: "image";
  source: AnthropicImageSource;
} {
  return {
    type: "image",
    source: buildAnthropicImageSource(imageUrl),
  };
}

export async function resolveAnthropicImageBlock(
  imageUrl: string,
  options: ResolveAnthropicImageSourceOptions = {},
): Promise<{
  type: "image";
  source: Exclude<AnthropicImageSource, { type: "url" }>;
}> {
  return {
    type: "image",
    source: await resolveAnthropicImageSource(imageUrl, options),
  };
}
