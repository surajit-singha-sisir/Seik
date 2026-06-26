import { Router } from 'express';
import { db, albums, files } from '../../database/index.js';
import { desc, eq, count, sql } from 'drizzle-orm';

const router = Router();

/** GET /api/albums */
router.get('/', async (_req, res) => {
  try {
    const rows = await db
      .select({
        id: albums.id, name: albums.name, description: albums.description,
        favorite: albums.favorite, pinned: albums.pinned, createdAt: albums.createdAt,
        fileCount: count(files.id),
      })
      .from(albums)
      .leftJoin(files, eq(files.albumId, albums.id))
      .groupBy(albums.id)
      .orderBy(desc(albums.pinned), desc(albums.createdAt));

    res.json({ albums: rows });
  } catch (err) {
    console.error('[albums]', err);
    res.status(500).json({ error: 'Failed to load albums.' });
  }
});

/** POST /api/albums */
router.post('/', async (req, res) => {
  try {
    const { name, description } = req.body as { name?: string; description?: string };
    if (!name?.trim()) return res.status(400).json({ error: 'name is required.' });
    const [row] = await db.insert(albums).values({ name: name.trim(), description: description?.trim() || null }).returning();
    res.status(201).json(row);
  } catch (err) {
    console.error('[albums/create]', err);
    res.status(500).json({ error: 'Failed to create album.' });
  }
});

/** DELETE /api/albums/:id */
router.delete('/:id', async (req, res) => {
  try {
    await db.delete(albums).where(eq(albums.id, req.params.id));
    res.json({ ok: true });
  } catch (err) {
    console.error('[albums/delete]', err);
    res.status(500).json({ error: 'Failed to delete album.' });
  }
});

export default router;
