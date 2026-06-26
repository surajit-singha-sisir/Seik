import { Router } from 'express';
import { db, files } from '../../database/index.js';
import { desc, eq, like, sql, count } from 'drizzle-orm';

const router = Router();

/** GET /api/gallery?page=1&limit=40&mime=image&q=filename */
router.get('/', async (req, res) => {
  try {
    const page  = Math.max(1, Number(req.query.page)  || 1);
    const limit = Math.min(100, Number(req.query.limit) || 40);
    const offset = (page - 1) * limit;
    const mime  = req.query.mime as string | undefined;   // e.g. "image", "application/pdf"
    const q     = req.query.q as string | undefined;

    const where: any[] = [];
    if (mime)  where.push(like(files.mimeType, `${mime}%`));
    if (q)     where.push(like(files.filename, `%${q}%`));

    const baseQuery = db.select({
      id: files.id, filename: files.filename, mimeType: files.mimeType,
      size: files.size, width: files.width, height: files.height,
      thumbUrl: files.thumbUrl, imgbbUrl: files.imgbbUrl, viewerUrl: files.viewerUrl,
      createdAt: files.createdAt,
    }).from(files);

    const [{ total }] = await db
      .select({ total: count() })
      .from(files)
      .$dynamic()
      .where(where.length ? sql`${where.reduce((a, b) => sql`${a} AND ${b}`)}` : sql`1=1`);

    const rows = await baseQuery
      .$dynamic()
      .where(where.length ? sql`${where.reduce((a, b) => sql`${a} AND ${b}`)}` : sql`1=1`)
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
