import { Router } from 'express';
import QRCode from 'qrcode';
import { db, files } from '../../database/index.js';
import { eq } from 'drizzle-orm';

const router = Router();

/**
 * GET /api/qr/:fileId?format=svg|png|dataurl
 * Returns a QR code for the file's public viewer URL.
 */
router.get('/:fileId', async (req, res) => {
  try {
    const [file] = await db
      .select({ viewerUrl: files.viewerUrl, imgbbUrl: files.imgbbUrl, filename: files.filename })
      .from(files)
      .where(eq(files.id, req.params.fileId));

    if (!file) return res.status(404).json({ error: 'File not found.' });

    const url = file.viewerUrl || file.imgbbUrl;
    if (!url) return res.status(400).json({ error: 'File has no public URL.' });

    const format = (req.query.format as string) || 'svg';
    const opts = { margin: 1, color: { dark: '#0B0E14', light: '#EDEAE3' } };

    if (format === 'png') {
      const buf = await QRCode.toBuffer(url, { ...opts, type: 'png', width: 300 });
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Content-Disposition', `inline; filename="qr-${file.filename}.png"`);
      return res.send(buf);
    }

    if (format === 'dataurl') {
      const dataUrl = await QRCode.toDataURL(url, { ...opts, width: 300 });
      return res.json({ dataUrl, url });
    }

    // Default: SVG string
    const svg = await QRCode.toString(url, { ...opts, type: 'svg' });
    res.setHeader('Content-Type', 'image/svg+xml');
    res.send(svg);
  } catch (err) {
    console.error('[qr]', err);
    res.status(500).json({ error: 'Failed to generate QR code.' });
  }
});

export default router;
