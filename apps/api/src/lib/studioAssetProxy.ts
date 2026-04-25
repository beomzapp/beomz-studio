import { createClient } from "@supabase/supabase-js";

import { apiConfig } from "../config.js";

export const STUDIO_ASSET_PROXY_BASE_URL = "https://beomz.ai/api/assets/image";
export const STUDIO_PROXYABLE_BUCKETS = [
  "chat-images",
  "project-assets",
] as const;

export type StudioProxyableBucket = (typeof STUDIO_PROXYABLE_BUCKETS)[number];

export function isStudioProxyableBucket(value: string): value is StudioProxyableBucket {
  return STUDIO_PROXYABLE_BUCKETS.includes(value as StudioProxyableBucket);
}

export function buildStudioAssetProxyUrl(
  bucket: StudioProxyableBucket,
  path: string,
): string {
  const params = new URLSearchParams({ bucket, path });
  return `${STUDIO_ASSET_PROXY_BASE_URL}?${params.toString()}`;
}

export function createStudioStorageClient() {
  return createClient(
    apiConfig.STUDIO_SUPABASE_URL,
    apiConfig.STUDIO_SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}

export async function downloadStudioAsset(
  bucket: StudioProxyableBucket,
  path: string,
): Promise<{ body: ArrayBuffer; contentType: string }> {
  const client = createStudioStorageClient();
  const result = await client.storage.from(bucket).download(path);

  if (result.error || !result.data) {
    throw new Error(result.error?.message ?? "Asset download failed.");
  }

  return {
    body: await result.data.arrayBuffer(),
    contentType: result.data.type || "application/octet-stream",
  };
}
