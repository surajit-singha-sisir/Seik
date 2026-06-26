import { Router } from 'express';
import { db, tags, fileTags, files } from '../../database/index.js';
import { desc, eq, count } from 'drizzle-orm';

const router = Router();

/** GET /api/tags */
router.get('/', async (_req, res) => {
  try {
    const rows = await db
      .select({
        id: tags.id, name: tags.name, slug: tags.slug, createdAt: tags.createdAt,
        fileCount: count(fileTags.fileId),
      })
      .from(tags)
      .leftJoin(fileTags, eq(fileTags.tagId, tags.id))
      .groupBy(tags.id)
      .orderBy(desc(count(fileTags.fileId)));

    res.json({ tags: rows });
  } catch (err) {
    console.error('[tags]', err);
    res.status(500).json({ error: 'Failed to load tags.' });
  }
});

/** POST /api/tags */
router.post('/', async (req, res) => {
  try {
    const { name } = req.body as { name?: string };
    if (!name?.trim()) return res.status(400).json({ error: 'name is required.' });
    const slug = name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const [row] = await db.insert(tags).values({ name: name.trim(), slug }).returning();
    res.status(201).json(row);
  } catch (err: any) {
    if (err?.code === '23505') return res.status(409).json({ error: 'Tag already exists.' });
    console.error('[tags/create]', err);
    res.status(500).json({ error: 'Failed to create tag.' });
  }
});

/** DELETE /api/tags/:id */
router.delete('/:id', async (req, res) => {
  try {
    await db.delete(tags).where(eq(tags.id, req.params.id));
    res.json({ ok: true });
  } catch (err) {
    console.error('[tags/delete]', err);
    res.status(500).json({ error: 'Failed to delete tag.' });
  }
});

export default router;
