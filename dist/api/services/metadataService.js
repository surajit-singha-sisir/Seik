import sharp from 'sharp';
import ExifReader from 'exifreader';
function pickTag(section, key) {
    return section?.[key]?.description ?? section?.[key]?.value ?? undefined;
}
export async function extractMetadata(buffer, mimeType) {
    if (!mimeType.startsWith('image/'))
        return {};
    const meta = {};
    try {
        const info = await sharp(buffer).metadata();
        meta.width = info.width;
        meta.height = info.height;
        meta.format = info.format;
    }
    catch {
        // Format unsupported by libvips (some raw/legacy formats) — skip silently.
    }
    try {
        const tags = ExifReader.load(buffer, { expanded: true });
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
    }
    catch {
        // No EXIF segment present (e.g. PNG/WebP/GIF) — fine, not every image has one.
    }
    return meta;
}
//# sourceMappingURL=metadataService.js.map