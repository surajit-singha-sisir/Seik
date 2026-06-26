import sharp from 'sharp';

export interface CompressionResult {
  buffer: Buffer;
  compressed: boolean;
}

const COMPRESSIBLE = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/tiff',
]);

/**
 * Re-encodes an image at the given quality (1-100). Quality only meaningfully
 * affects lossy formats; PNG uses it as a proxy for compression effort.
 * Non-image / non-photographic formats (PDF, SVG, GIF, RAW, etc.) pass through
 * untouched — recompressing them would either do nothing or corrupt them.
 */
export async function compressImage(
  buffer: Buffer,
  mimeType: string,
  quality: number,
): Promise<CompressionResult> {
  if (!COMPRESSIBLE.has(mimeType)) {
    return { buffer, compressed: false };
  }

  const q = Math.min(100, Math.max(1, Math.round(quality)));
  const image = sharp(buffer, { animated: false });

  try {
    let pipeline: sharp.Sharp;
    switch (mimeType) {
      case 'image/jpeg':
        pipeline = image.jpeg({ quality: q, mozjpeg: true });
        break;
      case 'image/webp':
        pipeline = image.webp({ quality: q });
        break;
      case 'image/avif':
        pipeline = image.avif({ quality: q });
        break;
      case 'image/tiff':
        pipeline = image.tiff({ quality: q });
        break;
      case 'image/png':
        pipeline = image.png({ quality: q, compressionLevel: 9 });
        break;
      default:
        return { buffer, compressed: false };
    }

    const out = await pipeline.toBuffer();
    // Guard against re-encoding producing a larger file than the original (can
    // happen on tiny/synthetic test images where JPEG/PNG header overhead
    // outweighs any savings). Real photos at typical resolutions will shrink.
    if (out.length >= buffer.length) {
      console.warn(
        `[compression] re-encoded output (${out.length}B) was not smaller than original (${buffer.length}B) ` +
        `at quality=${q} for ${mimeType}; keeping original.`,
      );
      return { buffer, compressed: false };
    }
    return { buffer: out, compressed: true };
  } catch {
    // If libvips can't decode it for some reason, fail safe and keep the original.
    return { buffer, compressed: false };
  }
}
