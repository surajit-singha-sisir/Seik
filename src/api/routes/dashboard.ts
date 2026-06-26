import { Router } from 'express';
import { db, files, albums, uploadHistory } from '../../database/index.js';
import { sql, desc, count, sum } from 'drizzle-orm';

const router = Router();

/** GET /api/dashboard
 *  Returns stats + recent files for the dashboard page. */
router.get('/', async (_req, res) => {
  try {
    // Total files & total stored bytes
    const [totals] = await db
      .select({ fileCount: count(), totalSize: sum(files.size) })
      .from(files);

    // Album count
    const [albumTotals] = await db
      .select({ albumCount: count() })
      .from(albums);

    // Bytes saved (original - compressed across all uploads)
    const [savings] = await db
      .select({
        savedBytes: sql<number>`coalesce(sum(original_size - compressed_size),0)`,
      })
      .from(uploadHistory);

    // 20 most recent files
    const recent = await db
      .select({
        id: files.id,
        filename: files.filename,
        mimeType: files.mimeType,
        size: files.size,
        width: files.width,
        height: files.height,
        thumbUrl: files.thumbUrl,
        imgbbUrl: files.imgbbUrl,
        viewerUrl: files.viewerUrl,
        createdAt: files.createdAt,
        favorite: files.favorite,
        hidden: files.hidden,
        archived: files.archived,
        metadataJson: files.metadataJson,
        albumId: files.albumId,
      })
      .from(files)
      .orderBy(desc(files.createdAt))
      .limit(20);

    res.json({
      stats: {
        fileCount:   Number(totals?.fileCount  ?? 0),
        totalSize:   Number(totals?.totalSize  ?? 0),
        albumCount:  Number(albumTotals?.albumCount ?? 0),
        savedBytes:  Number(savings?.savedBytes ?? 0),
      },
      recent,
    });
  } catch (err) {
    console.error('[dashboard]', err);
    res.status(500).json({ error: 'Failed to load dashboard data.' });
  }
});

export default router;
