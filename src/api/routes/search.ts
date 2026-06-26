import { Router } from 'express';
import Fuse from 'fuse.js';
import { db, files, tags, albums } from '../../database/index.js';
import { desc } from 'drizzle-orm';

const router = Router();

/**
 * GET /api/search?q=query&type=files|tags|albums (default: all)
 * Fuzzy full-text search across files, tags, and albums.
 */
router.get('/', async (req, res) => {
  try {
    const q = ((req.query.q as string) || '').trim();
    const type = (req.query.type as string) || 'all';

    if (!q) return res.json({ files: [], tags: [], albums: [] });

    const results: Record<string, unknown[]> = { files: [], tags: [], albums: [] };

    if (type === 'all' || type === 'files') {
      const allFiles = await db
        .select({
          id: files.id, filename: files.filename, mimeType: files.mimeType,
          size: files.size, thumbUrl: files.thumbUrl, imgbbUrl: files.imgbbUrl,
          viewerUrl: files.viewerUrl, createdAt: files.createdAt,
        })
        .from(files)
        .orderBy(desc(files.createdAt))
        .limit(500);

      const fuse = new Fuse(allFiles, {
        keys: ['filename'], threshold: 0.38, includeScore: true,
      });
      results.files = fuse.search(q).slice(0, 30).map(r => r.item);
    }

    if (type === 'all' || type === 'tags') {
      const allTags = await db.select().from(tags);
      const fuse = new Fuse(allTags, { keys: ['name', 'slug'], threshold: 0.4 });
      results.tags = fuse.search(q).slice(0, 15).map(r => r.item);
    }

    if (type === 'all' || type === 'albums') {
      const allAlbums = await db.select().from(albums);
      const fuse = new Fuse(allAlbums, { keys: ['name', 'description'], threshold: 0.4 });
      results.albums = fuse.search(q).slice(0, 10).map(r => r.item);
    }

    res.json(results);
  } catch (err) {
    console.error('[search]', err);
    res.status(500).json({ error: 'Search failed.' });
  }
});

export default router;
