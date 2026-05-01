import { apiConfig } from "../../config.js";

export const FAL_FLUX_ENDPOINT = "https://fal.run/fal-ai/flux/dev";
export const DEFAULT_FAL_IMAGE_WIDTH = 1280;
export const DEFAULT_FAL_IMAGE_HEIGHT = 720;

export interface GenerateFalFluxImageInput {
  prompt: string;
  width?: number;
  height?: number;
  abortSignal?: AbortSignal;
}

export async function generateFalFluxImageUrl(input: GenerateFalFluxImageInput): Promise<string> {
  const falKey = apiConfig.FAL_KEY?.trim();
  if (!falKey) {
    throw new Error("FAL_KEY is not configured.");
  }

  const response = await fetch(FAL_FLUX_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Key ${falKey}`,
      "Content-Type": "application/json",
      "X-Fal-Store-IO": "0",
    },
    body: JSON.stringify({
      prompt: input.prompt,
      image_size: {
        width: input.width ?? DEFAULT_FAL_IMAGE_WIDTH,
        height: input.height ?? DEFAULT_FAL_IMAGE_HEIGHT,
      },
      num_images: 1,
      enable_safety_checker: true,
      output_format: "jpeg",
    }),
    signal: input.abortSignal,
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(
      `fal.ai image request failed: ${response.status} ${response.statusText}${details ? ` - ${details.slice(0, 300)}` : ""}`,
    );
  }

  const data = await response.json() as {
    images?: Array<{ url?: unknown }>;
  };
  const imageUrl = data.images?.find((image) => typeof image.url === "string" && image.url.trim().length > 0)?.url;

  if (typeof imageUrl !== "string") {
    throw new Error("fal.ai image response did not include an image URL.");
  }

  return imageUrl.trim();
}
