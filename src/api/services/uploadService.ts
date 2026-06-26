import path from 'node:path';
import { db, files, uploadHistory } from '../../database/index.js';
import { getStorageProvider } from '../storage/index.js';
import { computeHash } from '../../utils/hash.js';
import { validateUpload } from '../../utils/validateUpload.js';
import { UploadError } from '../../utils/errors.js';
import { extractMetadata } from './metadataService.js';
import { compressImage } from './compressionService.js';

export interface UploadInput {
  buffer: Buffer;
  originalFilename: string;
  claimedMimeType: string;
  quality?: number;
  albumId?: string | null;
  expiresInSeconds?: number;
}

export interface UploadOutcome {
  file: typeof files.$inferSelect;
  compression: {
    originalSize: number;
    compressedSize: number;
    quality: number;
    reductionPercent: number;
    compressed: boolean;
  };
}

export async function processUpload(input: UploadInput): Promise<UploadOutcome> {
  const validation = await validateUpload(input.buffer, input.originalFilename, input.claimedMimeType);
  if (!validation.ok) {
    throw new UploadError(validation.reason!, 'VALIDATION_FAILED');
  }

  const hash = computeHash(input.buffer);

  const mimeType = validation.detectedMime || input.claimedMimeType;
  const metadata = await extractMetadata(input.buffer, mimeType);

  const quality = Math.min(100, Math.max(1, Math.round(
    input.quality ?? (Number(process.env.DEFAULT_COMPRESSION_QUALITY) || 85),
  )));
  const { buffer: outBuffer, compressed } = await compressImage(input.buffer, mimeType, quality);

  const provider = getStorageProvider();
  const startedAt = Date.now();
  const result = await provider.upload({
    filename: input.originalFilename,
    buffer: outBuffer,
    mimeType,
    expirationSeconds: input.expiresInSeconds,
  });
  const uploadDuration = Date.now() - startedAt;

  const [fileRow] = await db
    .insert(files)
    .values({
      albumId: input.albumId ?? null,
      filename: path.basename(input.originalFilename),
      originalFilename: input.originalFilename,
      mimeType,
      extension: validation.extension,
      size: result.size ?? outBuffer.length,
      originalSize: input.buffer.length,
      width: result.width ?? metadata.width,
      height: result.height ?? metadata.height,
      hash,
      storageProvider: provider.name,
      storageKey: result.storageKey,
      imgbbId: result.providerId,
      imgbbUrl: result.url,
      viewerUrl: result.viewerUrl,
      thumbUrl: result.thumbUrl,
      mediumUrl: result.mediumUrl,
      deleteUrl: result.deleteUrl,
      metadataJson: metadata,
      expiresAt: input.expiresInSeconds ? new Date(Date.now() + input.expiresInSeconds * 1000) : null,
    })
    .returning();

  await db.insert(uploadHistory).values({
    fileId: fileRow.id,
    compressionQuality: quality,
    originalSize: input.buffer.length,
    compressedSize: outBuffer.length,
    uploadDuration,
  });

  return {
    file: fileRow,
    compression: {
      originalSize: input.buffer.length,
      compressedSize: outBuffer.length,
      quality,
      reductionPercent: input.buffer.length > 0
        ? Math.round((1 - outBuffer.length / input.buffer.length) * 100)
        : 0,
      compressed,
    },
  };
}
