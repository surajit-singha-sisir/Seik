import { Router } from 'express';
import { db, albums, files } from '../../database/index.js';
import { desc, eq, count } from 'drizzle-orm';

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
    const [row] = await db.insert(albums)
      .values({ name: name.trim(), description: description?.trim() || null })
      .returning();
    res.status(201).json(row);
  } catch (err) {
    console.error('[albums/create]', err);
    res.status(500).json({ error: 'Failed to create album.' });
  }
});

/** PATCH /api/albums/:id */
router.patch('/:id', async (req, res) => {
  try {
    const { name, description, pinned, favorite } = req.body as {
      name?: string; description?: string; pinned?: boolean; favorite?: boolean;
    };
    const updates: Record<string, unknown> = {
      updatedAt: new Date(),
    };
    if (name !== undefined) updates.name = name.trim();
    if (description !== undefined) updates.description = description?.trim() || null;
    if (pinned !== undefined) updates.pinned = pinned;
    if (favorite !== undefined) updates.favorite = favorite;

    const [row] = await db.update(albums)
      .set(updates)
      .where(eq(albums.id, req.params.id))
      .returning();

    if (!row) return res.status(404).json({ error: 'Album not found.' });
    res.json(row);
  } catch (err) {
    console.error('[albums/patch]', err);
    res.status(500).json({ error: 'Failed to update album.' });
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
