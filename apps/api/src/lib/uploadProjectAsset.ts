import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

export const PROJECT_ASSETS_BUCKET = "project-assets";
export const STUDIO_PUBLIC_BASE_URL = "https://srflynvdrsdazxvcxmzb.supabase.co";
export const STUDIO_SERVICE_ROLE_ENV_VAR = "STUDIO_SUPABASE_SERVICE_ROLE_KEY";

const PROJECT_ASSET_ALLOWED_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;

type AllowedProjectAssetMimeType = (typeof PROJECT_ASSET_ALLOWED_MIME_TYPES)[number];

let ensureBucketPromise: Promise<void> | null = null;

function getStudioSupabaseUrl(): string {
  return STUDIO_PUBLIC_BASE_URL;
}

function getStudioServiceRoleKey(): string {
  const key = process.env.STUDIO_SUPABASE_SERVICE_ROLE_KEY;

  if (!key) {
    throw new Error(`${STUDIO_SERVICE_ROLE_ENV_VAR} is not configured`);
  }

  return key;
}

function createStorageClient() {
  return createClient(
    getStudioSupabaseUrl(),
    getStudioServiceRoleKey(),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}

function isMissingBucketError(message: string): boolean {
  return /not found|does not exist|404|bucket/i.test(message);
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
  return `${STUDIO_PUBLIC_BASE_URL}/storage/v1/object/public/${PROJECT_ASSETS_BUCKET}/${path}`;
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
    process.env.STUDIO_SUPABASE_SERVICE_ROLE_KEY ? "set" : "MISSING",
  );

  try {
    const normalisedMediaType = normaliseMediaType(mediaType);
    const path = createProjectAssetPath(projectId, normalisedMediaType);
    const bytes = Buffer.from(base64.replace(/\s+/g, ""), "base64");

    await ensureProjectAssetsBucket();

    const client = createStorageClient();
    const uploadResult = await client.storage
      .from(PROJECT_ASSETS_BUCKET)
      .upload(path, bytes, {
        cacheControl: "3600",
        contentType: normalisedMediaType,
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
