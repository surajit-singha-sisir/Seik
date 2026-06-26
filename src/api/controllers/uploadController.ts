import type { Request, Response } from 'express';
import axios from 'axios';
import { processUpload } from '../services/uploadService.js';
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
