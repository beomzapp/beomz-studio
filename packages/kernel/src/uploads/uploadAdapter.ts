import type { Asset } from "@beomz-studio/contracts";

export interface UploadIntent {
  assetKey: string;
  uploadUrl: string;
  headers: Readonly<Record<string, string>>;
  expiresAt: string;
}

export interface UploadCompletion {
  asset: Asset;
  publicUrl?: string;
}

export interface UploadAdapter {
  createUpload(input: {
    projectId: string;
    filename: string;
    contentType: string;
    sizeBytes: number;
  }): Promise<UploadIntent>;
  completeUpload(input: {
    assetKey: string;
    projectId: string;
    filename: string;
    contentType: string;
  }): Promise<UploadCompletion>;
}

export function defineUploadAdapter(adapter: UploadAdapter): UploadAdapter {
  return adapter;
}
