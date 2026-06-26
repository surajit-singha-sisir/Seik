import { Router } from 'express';
import { db, files } from '../../database/index.js';
import { desc, like, and, count, eq } from 'drizzle-orm';

const router = Router();

/** GET /api/gallery?page=1&limit=40&mime=image&q=filename&favorite=1 */
router.get('/', async (req, res) => {
  try {
    const page     = Math.max(1, Number(req.query.page)   || 1);
    const limit    = Math.min(100, Number(req.query.limit) || 40);
    const offset   = (page - 1) * limit;
    const mime     = (req.query.mime     as string | undefined)?.trim();
    const q        = (req.query.q        as string | undefined)?.trim();
    const favOnly  = req.query.favorite === '1';

    const conditions: any[] = [];
    if (mime)    conditions.push(like(files.mimeType, `${mime}%`));
    if (q)       conditions.push(like(files.filename, `%${q}%`));
    if (favOnly) conditions.push(eq(files.favorite, true));
    const where = conditions.length ? and(...conditions) : undefined;

    const [{ total }] = await db.select({ total: count() }).from(files).where(where);

    const rows = await db
      .select({
        id: files.id, filename: files.filename, mimeType: files.mimeType,
        size: files.size, width: files.width, height: files.height,
        thumbUrl: files.thumbUrl, imgbbUrl: files.imgbbUrl, viewerUrl: files.viewerUrl,
        favorite: files.favorite, createdAt: files.createdAt,
      })
      .from(files)
      .where(where)
      .orderBy(desc(files.createdAt))
      .limit(limit)
      .offset(offset);

    res.json({ files: rows, total: Number(total), page, limit });
  } catch (err) {
    console.error('[gallery]', err);
    res.status(500).json({ error: 'Failed to load gallery.' });
  }
});

export default router;
