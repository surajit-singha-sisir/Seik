import { Router } from 'express';
import { z } from 'zod';
import { db, albums, files } from '../../database/index.js';
import { desc, eq, count } from 'drizzle-orm';

const CreateAlbum = z.object({
  name: z.string().trim().min(1, 'name is required').max(80),
  description: z.string().trim().max(300).optional().nullable(),
});
const PatchAlbum = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(300).nullable().optional(),
  pinned: z.boolean().optional(),
  favorite: z.boolean().optional(),
});

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

/** GET /api/albums/:id — album details + the files inside it */
router.get('/:id', async (req, res) => {
  try {
    const [album] = await db.select().from(albums).where(eq(albums.id, req.params.id));
    if (!album) return res.status(404).json({ error: 'Album not found.' });

    const fileRows = await db
      .select({
        id: files.id, filename: files.filename, mimeType: files.mimeType,
        size: files.size, width: files.width, height: files.height,
        thumbUrl: files.thumbUrl, imgbbUrl: files.imgbbUrl, viewerUrl: files.viewerUrl,
        favorite: files.favorite, createdAt: files.createdAt,
      })
      .from(files)
      .where(eq(files.albumId, req.params.id))
      .orderBy(desc(files.createdAt));

    res.json({ ...album, files: fileRows });
  } catch (err) {
    console.error('[albums/get]', err);
    res.status(500).json({ error: 'Failed to load album.' });
  }
});

/** POST /api/albums */
router.post('/', async (req, res) => {
  try {
    const parsed = CreateAlbum.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
    const { name, description } = parsed.data;
    const [row] = await db.insert(albums)
      .values({ name, description: description || null })
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
    const parsed = PatchAlbum.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
    const updates: Record<string, unknown> = { updatedAt: new Date(), ...parsed.data };

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
