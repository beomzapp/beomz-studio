import { randomUUID } from "node:crypto";
import { extname } from "node:path";

import {
  buildAssetProxyUrl,
  createStudioStorageClient,
} from "./proxy.js";

export const CHAT_IMAGES_BUCKET = "chat-images";
export const CHAT_IMAGE_MAX_BYTES = 20 * 1024 * 1024;
export const CHAT_IMAGE_ALLOWED_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;

type AllowedChatImageMimeType = (typeof CHAT_IMAGE_ALLOWED_MIME_TYPES)[number];

interface UploadChatImageInput {
  bytes: ArrayBuffer;
  contentType: AllowedChatImageMimeType;
  fileName: string;
  projectId: string;
  sessionId?: string;
  timestamp?: number;
}

let ensureBucketPromise: Promise<void> | null = null;

function createStorageClient() {
  return createStudioStorageClient();
}

function isMissingBucketError(message: string): boolean {
  return /not found|does not exist|404|bucket/i.test(message);
}

function normaliseExtension(fileName: string, contentType: AllowedChatImageMimeType): string {
  const fromName = extname(fileName).trim().toLowerCase();
  if (fromName === ".png" || fromName === ".jpg" || fromName === ".jpeg" || fromName === ".webp" || fromName === ".gif") {
    return fromName === ".jpeg" ? ".jpg" : fromName;
  }

  switch (contentType) {
    case "image/png":
      return ".png";
    case "image/jpeg":
      return ".jpg";
    case "image/webp":
      return ".webp";
    case "image/gif":
      return ".gif";
    default:
      return ".bin";
  }
}

export function isAllowedChatImageMimeType(value: string): value is AllowedChatImageMimeType {
  return CHAT_IMAGE_ALLOWED_MIME_TYPES.includes(value as AllowedChatImageMimeType);
}

export function createChatImagePath(input: {
  contentType: AllowedChatImageMimeType;
  fileName: string;
  projectId: string;
  sessionId?: string;
  timestamp?: number;
}): string {
  const sessionId = input.sessionId?.trim() || randomUUID();
  const timestamp = input.timestamp ?? Date.now();
  const extension = normaliseExtension(input.fileName, input.contentType);
  return `${input.projectId}/${sessionId}/${timestamp}${extension}`;
}

export function buildChatImageProxyUrl(path: string): string {
  return buildAssetProxyUrl(CHAT_IMAGES_BUCKET, path);
}

export async function ensureChatImagesBucket(): Promise<void> {
  if (ensureBucketPromise) {
    return ensureBucketPromise;
  }

  ensureBucketPromise = (async () => {
    const client = createStorageClient();
    const desiredConfig = {
      public: false,
      fileSizeLimit: `${CHAT_IMAGE_MAX_BYTES}`,
      allowedMimeTypes: [...CHAT_IMAGE_ALLOWED_MIME_TYPES],
    };

    const updateResult = await client.storage.updateBucket(CHAT_IMAGES_BUCKET, desiredConfig);
    if (!updateResult.error) {
      return;
    }

    if (!isMissingBucketError(updateResult.error.message)) {
      throw new Error(updateResult.error.message);
    }

    const createResult = await client.storage.createBucket(CHAT_IMAGES_BUCKET, desiredConfig);
    if (
      createResult.error
      && !/already exists|duplicate/i.test(createResult.error.message)
    ) {
      throw new Error(createResult.error.message);
    }
  })().catch((error) => {
    ensureBucketPromise = null;
    throw error;
  });

  return ensureBucketPromise;
}

export async function uploadChatImage(input: UploadChatImageInput): Promise<{ path: string; url: string }> {
  await ensureChatImagesBucket();

  const client = createStorageClient();
  const path = createChatImagePath({
    contentType: input.contentType,
    fileName: input.fileName,
    projectId: input.projectId,
    sessionId: input.sessionId,
    timestamp: input.timestamp,
  });

  const uploadResult = await client.storage
    .from(CHAT_IMAGES_BUCKET)
    .upload(path, input.bytes, {
      cacheControl: "3600",
      contentType: input.contentType,
      upsert: false,
    });

  if (uploadResult.error) {
    throw new Error(uploadResult.error.message);
  }

  return {
    path,
    url: buildChatImageProxyUrl(path),
  };
}
