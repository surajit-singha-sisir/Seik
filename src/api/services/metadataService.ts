import sharp from 'sharp';
import ExifReader from 'exifreader';

export interface ExtractedMetadata {
  width?: number;
  height?: number;
  format?: string;
  exif?: {
    camera?: string;
    lens?: string;
    iso?: string;
    exposure?: string;
    colorProfile?: string;
    bitDepth?: string;
    gps?: { latitude?: number; longitude?: number };
  };
}

function pickTag(section: Record<string, any> | undefined, key: string) {
  return section?.[key]?.description ?? section?.[key]?.value ?? undefined;
}

export async function extractMetadata(buffer: Buffer, mimeType: string): Promise<ExtractedMetadata> {
  if (!mimeType.startsWith('image/')) return {};

  const meta: ExtractedMetadata = {};

  try {
    const info = await sharp(buffer).metadata();
    meta.width = info.width;
    meta.height = info.height;
    meta.format = info.format;
  } catch {
    // Format unsupported by libvips (some raw/legacy formats) — skip silently.
  }

  try {
    const tags = ExifReader.load(buffer, { expanded: true }) as any;
    const exif = tags.exif || {};
    const gps = tags.gps;
    meta.exif = {
      camera: pickTag(exif, 'Model'),
      lens: pickTag(exif, 'LensModel'),
      iso: pickTag(exif, 'ISOSpeedRatings'),
      exposure: pickTag(exif, 'ExposureTime'),
      colorProfile: pickTag(exif, 'ColorSpace'),
      bitDepth: pickTag(exif, 'BitsPerSample'),
      gps: gps?.Latitude != null ? { latitude: gps.Latitude, longitude: gps.Longitude } : undefined,
    };
  } catch {
    // No EXIF segment present (e.g. PNG/WebP/GIF) — fine, not every image has one.
  }

  return meta;
}
