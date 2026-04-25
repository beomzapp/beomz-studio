import { randomUUID } from "node:crypto";

import sharp from "sharp";

import {
  buildAssetProxyUrl,
  createStudioStorageClient,
} from "./studioAssetProxy.js";

export const PROJECT_ASSETS_BUCKET = "project-assets";
export const STUDIO_SERVICE_ROLE_ENV_VAR = "STUDIO_SUPABASE_SERVICE_ROLE_KEY";
export const PROJECT_ASSET_UPLOAD_MEDIA_TYPE = "image/jpeg";
export const PROJECT_ASSET_TARGET_BYTES = 150 * 1024;
const PROJECT_ASSET_MAX_DIMENSION = 800;
const PROJECT_ASSET_JPEG_QUALITY = 80;

const PROJECT_ASSET_ALLOWED_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;

type AllowedProjectAssetMimeType = (typeof PROJECT_ASSET_ALLOWED_MIME_TYPES)[number];

let ensureBucketPromise: Promise<void> | null = null;

function createStorageClient() {
  return createStudioStorageClient();
}

function isMissingBucketError(message: string): boolean {
  return /not found|does not exist|404|bucket/i.test(message);
}

function formatKilobytes(bytes: number): string {
  const kilobytes = bytes / 1024;
  return kilobytes >= 100 ? kilobytes.toFixed(0) : kilobytes.toFixed(1).replace(/\.0$/, "");
}

function normaliseMediaType(value: string): AllowedProjectAssetMimeType {
  const lower = value.trim().toLowerCase();
  if (lower === "image/jpg") {
    return "image/jpeg";
  }

  if (PROJECT_ASSET_ALLOWED_MIME_TYPES.includes(lower as AllowedProjectAssetMimeType)) {
    return lower as AllowedProjectAssetMimeType;
  }

  throw new Error(`Unsupported project asset media type: ${value}`);
}

export function projectAssetExtensionForMediaType(mediaType: string): string {
  switch (normaliseMediaType(mediaType)) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
  }
}

export function createProjectAssetPath(
  projectId: string,
  mediaType: string,
  assetId = randomUUID(),
): string {
  const extension = projectAssetExtensionForMediaType(mediaType);
  return `${projectId}/${assetId}.${extension}`;
}

export function buildProjectAssetPublicUrl(path: string): string {
  return buildAssetProxyUrl(PROJECT_ASSETS_BUCKET, path);
}

export async function compressProjectAssetImage(bytes: Buffer): Promise<Buffer> {
  return sharp(bytes, { animated: true, failOn: "none" })
    .rotate()
    .resize({
      width: PROJECT_ASSET_MAX_DIMENSION,
      height: PROJECT_ASSET_MAX_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({
      quality: PROJECT_ASSET_JPEG_QUALITY,
      mozjpeg: true,
    })
    .toBuffer();
}

export async function ensureProjectAssetsBucket(): Promise<void> {
  if (ensureBucketPromise) {
    return ensureBucketPromise;
  }

  ensureBucketPromise = (async () => {
    const client = createStorageClient();
    const desiredConfig = {
      public: true,
    };

    const updateResult = await client.storage.updateBucket(PROJECT_ASSETS_BUCKET, desiredConfig);
    if (!updateResult.error) {
      return;
    }

    if (!isMissingBucketError(updateResult.error.message)) {
      console.error("[uploadProjectAsset] failed to update bucket:", updateResult.error);
      throw new Error(updateResult.error.message);
    }

    const createResult = await client.storage.createBucket(PROJECT_ASSETS_BUCKET, desiredConfig);
    if (createResult.error && !/already exists|duplicate/i.test(createResult.error.message)) {
      console.error("[uploadProjectAsset] failed to create bucket:", createResult.error);
      throw new Error(createResult.error.message);
    }
  })().catch((error) => {
    ensureBucketPromise = null;
    console.error("[uploadProjectAsset] ensure bucket failed:", error);
    throw error;
  });

  return ensureBucketPromise;
}

export async function uploadProjectAsset(
  projectId: string,
  base64: string,
  mediaType: string,
): Promise<string> {
  console.log("[uploadProjectAsset] starting upload for project:", projectId);
  console.log(
    "[uploadProjectAsset] using key:",
    process.env[STUDIO_SERVICE_ROLE_ENV_VAR] ? "set" : "MISSING",
  );

  try {
    normaliseMediaType(mediaType);
    const bytes = Buffer.from(base64.replace(/\s+/g, ""), "base64");
    const compressedBytes = await compressProjectAssetImage(bytes);
    const path = createProjectAssetPath(projectId, PROJECT_ASSET_UPLOAD_MEDIA_TYPE);

    console.log(
      `[image] compressed: ${formatKilobytes(bytes.length)}KB → ${formatKilobytes(compressedBytes.length)}KB`,
    );

    if (compressedBytes.length > PROJECT_ASSET_TARGET_BYTES) {
      console.warn(
        `[image] compressed asset still above target: ${formatKilobytes(compressedBytes.length)}KB (target 150KB)`,
      );
    }

    await ensureProjectAssetsBucket();

    const client = createStorageClient();
    const uploadResult = await client.storage
      .from(PROJECT_ASSETS_BUCKET)
      .upload(path, compressedBytes, {
        cacheControl: "3600",
        contentType: PROJECT_ASSET_UPLOAD_MEDIA_TYPE,
        upsert: false,
      });

    if (uploadResult.error) {
      console.error("[uploadProjectAsset] upload failed:", uploadResult.error);
      throw new Error(uploadResult.error.message);
    }

    const url = buildProjectAssetPublicUrl(path);
    console.log("[uploadProjectAsset] result URL:", url);
    return url;
  } catch (error) {
    console.error("[uploadProjectAsset] upload failed with error:", error);
    throw error;
  }
}
