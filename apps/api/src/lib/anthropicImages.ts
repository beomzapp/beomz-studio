const DATA_URL_PATTERN = /^data:(image\/(?:png|jpeg|jpg|webp|gif));base64,([A-Za-z0-9+/=\s]+)$/i;

type SupportedMediaType = "image/png" | "image/jpeg" | "image/webp" | "image/gif";

export type AnthropicImageSource =
  | { type: "url"; url: string }
  | { type: "base64"; media_type: SupportedMediaType; data: string };

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

export function buildAnthropicImageBlock(imageUrl: string): {
  type: "image";
  source: AnthropicImageSource;
} {
  return {
    type: "image",
    source: buildAnthropicImageSource(imageUrl),
  };
}
