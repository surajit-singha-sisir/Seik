import axios from 'axios';
import { processUpload } from '../services/uploadService.js';
import { compressImage } from '../services/compressionService.js';
import { validateUpload } from '../../utils/validateUpload.js';
import { UploadError } from '../../utils/errors.js';
import { db, fileTags, tags } from '../../database/index.js';
import { inArray } from 'drizzle-orm';
import { findDuplicateByNameAndSize } from '../services/duplicateService.js';
const MAX_BYTES = (Number(process.env.MAX_UPLOAD_SIZE_MB) || 32) * 1024 * 1024;
function handleUploadError(err, res) {
    if (err instanceof UploadError) {
        return res.status(422).json({ error: err.message, code: err.code });
    }
    console.error('[upload] unexpected error:', err);
    res.status(500).json({ error: 'Upload failed unexpectedly.' });
}
/** Parse tag IDs from the request body (JSON array or comma-separated string) */
function parseTagIds(raw) {
    if (!raw)
        return [];
    if (Array.isArray(raw))
        return raw.filter(Boolean);
    if (typeof raw === 'string') {
        try {
            return JSON.parse(raw);
        }
        catch {
            return raw.split(',').map(s => s.trim()).filter(Boolean);
        }
    }
    return [];
}
/** Parse + clamp an expiration value (seconds) to ImgBB's allowed range (60s–180d) */
function parseExpiresIn(raw) {
    if (raw === undefined || raw === null || raw === '')
        return undefined;
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0)
        return undefined;
    return Math.min(15552000, Math.max(60, Math.round(n)));
}
/** After inserting a file, attach tag join-rows */
async function attachTags(fileId, tagIds) {
    if (!tagIds.length)
        return;
    // Verify the tag IDs actually exist to avoid FK errors
    const existing = await db.select({ id: tags.id }).from(tags).where(inArray(tags.id, tagIds));
    const validIds = existing.map(t => t.id);
    if (!validIds.length)
        return;
    await db.insert(fileTags).values(validIds.map(tagId => ({ fileId, tagId }))).onConflictDoNothing();
}
export async function uploadFile(req, res) {
    try {
        if (!req.file)
            return res.status(400).json({ error: 'No file provided.' });
        const tagIds = parseTagIds(req.body.tagIds);
        const result = await processUpload({
            buffer: req.file.buffer,
            originalFilename: req.file.originalname,
            claimedMimeType: req.file.mimetype,
            quality: req.body.quality ? Number(req.body.quality) : undefined,
            albumId: req.body.albumId || null,
            expiresInSeconds: parseExpiresIn(req.body.expiresIn),
        });
        await attachTags(result.file.id, tagIds);
        res.status(201).json(result);
    }
    catch (err) {
        handleUploadError(err, res);
    }
}
export async function previewCompression(req, res) {
    try {
        if (!req.file)
            return res.status(400).json({ error: 'No file provided.' });
        const quality = Math.min(100, Math.max(1, Math.round(req.body.quality ? Number(req.body.quality) : 85)));
        const validation = await validateUpload(req.file.buffer, req.file.originalname, req.file.mimetype);
        if (!validation.ok)
            return res.status(422).json({ error: validation.reason });
        const mimeType = validation.detectedMime || req.file.mimetype;
        const { buffer: out, compressed } = await compressImage(req.file.buffer, mimeType, quality);
        res.json({
            originalSize: req.file.buffer.length,
            compressedSize: out.length,
            quality,
            compressed,
            reductionPercent: req.file.buffer.length > 0
                ? Math.round((1 - out.length / req.file.buffer.length) * 100)
                : 0,
        });
    }
    catch (err) {
        console.error('[preview] error:', err);
        res.status(500).json({ error: 'Preview failed.' });
    }
}
export async function uploadFromUrl(req, res) {
    try {
        const { url, quality, albumId, tagIds: rawTagIds, expiresIn } = req.body;
        if (!url)
            return res.status(400).json({ error: 'url is required.' });
        const tagIds = parseTagIds(rawTagIds);
        let parsed;
        try {
            parsed = new URL(url);
        }
        catch {
            return res.status(400).json({ error: 'That is not a valid URL.' });
        }
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            return res.status(400).json({ error: 'Only http(s) URLs are supported.' });
        }
        const response = await axios.get(url, {
            responseType: 'arraybuffer', maxContentLength: MAX_BYTES, timeout: 20_000,
        });
        const buffer = Buffer.from(response.data);
        const filename = decodeURIComponent(parsed.pathname.split('/').pop() || 'download');
        const claimedMimeType = response.headers['content-type']?.split(';')[0] || 'application/octet-stream';
        const result = await processUpload({
            buffer, originalFilename: filename, claimedMimeType,
            quality: quality ? Number(quality) : undefined,
            albumId: albumId || null,
            expiresInSeconds: parseExpiresIn(expiresIn),
        });
        await attachTags(result.file.id, tagIds);
        res.status(201).json(result);
    }
    catch (err) {
        handleUploadError(err, res);
    }
}
/** Pre-upload duplicate check — called by the client before spending bandwidth.
 * Checks by original filename + declared file size (fast, no file buffer needed). */
export async function checkDuplicate(req, res) {
    try {
        const { filename, size } = req.body;
        if (!filename || size === undefined || size === null) {
            return res.status(400).json({ error: 'filename and size are required.' });
        }
        const n = Number(size);
        if (!Number.isFinite(n) || n < 0) {
            return res.status(400).json({ error: 'size must be a non-negative number.' });
        }
        const duplicate = await findDuplicateByNameAndSize(filename, n);
        res.json({ duplicate: duplicate ?? null });
    }
    catch (err) {
        console.error('[check-duplicate] error:', err);
        res.status(500).json({ error: 'Duplicate check failed.' });
    }
}
//# sourceMappingURL=uploadController.js.map