export type ImageAspectRatio = "1:1" | "4:3" | "16:9";

export type ImageStyle = "product" | "editorial" | "interface" | "illustration";

export type ImageResultStatus = "queued" | "completed" | "failed";

export interface ImageRequest {
  id: string;
  projectId: string;
  prompt: string;
  negativePrompt?: string;
  style: ImageStyle;
  aspectRatio: ImageAspectRatio;
  count: number;
  referenceAssetIds?: readonly string[];
}

export interface ImageAssetResult {
  assetId: string;
  url: string;
  width?: number;
  height?: number;
  alt: string;
}

export interface ImageResult {
  requestId: string;
  provider: string;
  model: string;
  status: ImageResultStatus;
  images: readonly ImageAssetResult[];
  error?: string;
}
