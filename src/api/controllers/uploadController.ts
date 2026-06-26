import type { Request, Response } from 'express';
import axios from 'axios';
import { processUpload } from '../services/uploadService.js';
import { compressImage } from '../services/compressionService.js';
import { validateUpload } from '../../utils/validateUpload.js';
import { UploadError } from '../../utils/errors.js';

const MAX_BYTES = (Number(process.env.MAX_UPLOAD_SIZE_MB) || 32) * 1024 * 1024;

function handleUploadError(err: unknown, res: Response) {
  if (err instanceof UploadError) {
    return res.status(422).json({ error: err.message, code: err.code });
  }
  console.error('[upload] unexpected error:', err);
  res.status(500).json({ error: 'Upload failed unexpectedly.' });
}

/** Handles file picker, drag & drop, folder upload, and clipboard paste —
 * they all arrive here as a single multipart file, the method only differs
 * client-side in how the File object was obtained. */
export async function uploadFile(req: Request, res: Response) {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file provided.' });

    const result = await processUpload({
      buffer: req.file.buffer,
      originalFilename: req.file.originalname,
      claimedMimeType: req.file.mimetype,
      quality: req.body.quality ? Number(req.body.quality) : undefined,
      albumId: req.body.albumId || null,
    });

    res.status(201).json(result);
  } catch (err) {
    handleUploadError(err, res);
  }
}

/** Preview endpoint — accepts a staged multipart file + quality value, runs
 * compression, and returns the projected size WITHOUT persisting anything.
 * The client calls this on each slider change to show live size estimates. */
export async function previewCompression(req: Request, res: Response) {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file provided.' });

    const quality = Math.min(100, Math.max(1, Math.round(
      req.body.quality ? Number(req.body.quality) : 85,
    )));

    const validation = await validateUpload(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
    );
    if (!validation.ok) {
      return res.status(422).json({ error: validation.reason });
    }

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
  } catch (err) {
    console.error('[preview] error:', err);
    res.status(500).json({ error: 'Preview failed.' });
  }
}

/** URL upload — fetches the remote file server-side, then runs it through
 * the exact same validation/compression/storage pipeline as a direct upload. */
export async function uploadFromUrl(req: Request, res: Response) {
  try {
    const { url, quality, albumId } = req.body as { url?: string; quality?: string; albumId?: string };
    if (!url) return res.status(400).json({ error: 'url is required.' });

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return res.status(400).json({ error: 'That is not a valid URL.' });
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return res.status(400).json({ error: 'Only http(s) URLs are supported.' });
    }

    const response = await axios.get<ArrayBuffer>(url, {
      responseType: 'arraybuffer',
      maxContentLength: MAX_BYTES,
      timeout: 20_000,
    });

    const buffer = Buffer.from(response.data);
    const filename = decodeURIComponent(parsed.pathname.split('/').pop() || 'download');
    const claimedMimeType = (response.headers['content-type'] as string)?.split(';')[0] || 'application/octet-stream';

    const result = await processUpload({
      buffer,
      originalFilename: filename,
      claimedMimeType,
      quality: quality ? Number(quality) : undefined,
      albumId: albumId || null,
    });

    res.status(201).json(result);
  } catch (err) {
    handleUploadError(err, res);
  }
}
