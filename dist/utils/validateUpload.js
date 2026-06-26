import { fileTypeFromBuffer } from 'file-type';
import path from 'node:path';
export const ALLOWED_EXTENSIONS = new Set([
    '.arw', '.avif', '.bmp', '.cr2', '.cr3', '.cur', '.cut', '.dcm', '.dds',
    '.dib', '.dng', '.emf', '.exr', '.fax', '.fig', '.fits', '.fpx', '.gbr',
    '.gd', '.gif', '.hdr', '.heic', '.heif', '.icns', '.ico', '.iff', '.ilbm',
    '.j2k', '.jpe', '.jpeg', '.jpg', '.jpf', '.jpm', '.jp2', '.jpx', '.jxl',
    '.miff', '.mng', '.mpo', '.nef', '.nrrd', '.orf', '.pbm', '.pcx', '.pdf',
    '.pgm', '.pic', '.pict', '.png', '.pnm', '.ppm', '.ps', '.psb', '.psd',
    '.qoi', '.raf', '.raw', '.rw2', '.sgi', '.sid', '.sr2', '.svg', '.tga',
    '.tif', '.tiff', '.vtf', '.webp', '.wmf', '.xbm', '.xcf', '.xpm',
]);
// Formats `file-type` cannot reliably sniff by magic bytes (vector / raw /
// legacy formats). We fall back to trusting the extension for these only.
const UNSNIFFABLE_BUT_ALLOWED = new Set([
    '.svg', '.ps', '.wmf', '.emf', '.fig', '.cut', '.gd', '.gbr', '.pic',
    '.pict', '.fpx', '.sid', '.fits', '.nrrd', '.vtf', '.mng', '.iff', '.ilbm',
]);
function isMimeAllowed(mime) {
    return (mime.startsWith('image/') ||
        mime === 'application/pdf' ||
        mime === 'application/postscript');
}
export async function validateUpload(buffer, originalFilename, claimedMimeType) {
    const extension = path.extname(originalFilename).toLowerCase();
    if (!extension || !ALLOWED_EXTENSIONS.has(extension)) {
        return { ok: false, reason: `File extension "${extension || '(none)'}" is not supported.`, extension };
    }
    if (buffer.length === 0) {
        return { ok: false, reason: 'File is empty.', extension };
    }
    const maxBytes = (Number(process.env.MAX_UPLOAD_SIZE_MB) || 32) * 1024 * 1024;
    if (buffer.length > maxBytes) {
        return { ok: false, reason: `File exceeds the ${maxBytes / 1024 / 1024}MB limit.`, extension };
    }
    const sniffed = await fileTypeFromBuffer(buffer);
    if (!sniffed && !UNSNIFFABLE_BUT_ALLOWED.has(extension)) {
        return { ok: false, reason: 'Could not verify file signature.', extension };
    }
    if (sniffed && !isMimeAllowed(sniffed.mime)) {
        return {
            ok: false,
            reason: `File content does not match a supported format (detected ${sniffed.mime}).`,
            extension,
            detectedMime: sniffed.mime,
        };
    }
    return { ok: true, extension, detectedMime: sniffed?.mime ?? claimedMimeType };
}
//# sourceMappingURL=validateUpload.js.map