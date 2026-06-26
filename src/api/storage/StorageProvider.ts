/**
 * StorageProvider — abstraction over any file storage backend.
 * Current implementation: ImgBB.
 * Future implementations: Cloudflare R2, AWS S3, Backblaze B2, Bunny, Vercel Blob.
 */

export interface UploadOptions {
  filename: string;
  buffer: Buffer;
  mimeType: string;
  expirationSeconds?: number;
}

export interface UploadResult {
  storageKey: string;
  providerId: string;
  url: string;
  viewerUrl?: string;
  thumbUrl?: string;
  mediumUrl?: string;
  deleteUrl?: string;
  size: number;
  width?: number;
  height?: number;
}

export interface FileMetadataResult {
  size: number;
  mimeType: string;
  width?: number;
  height?: number;
}

export interface StorageProvider {
  readonly name: string;
  upload(options: UploadOptions): Promise<UploadResult>;
  delete(storageKeyOrDeleteUrl: string): Promise<boolean>;
  getUrl(storageKey: string): string;
  getMetadata(storageKey: string): Promise<FileMetadataResult | null>;
}
