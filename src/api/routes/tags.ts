import { Router } from 'express';
import { db, tags, fileTags, files } from '../../database/index.js';
import { desc, eq, count } from 'drizzle-orm';

const router = Router();

/** Unicode-safe slug: keeps letters/numbers from any script, strips symbols/emoji.
 *  Falls back to a random suffix only if the name has no letters/numbers at all. */
function slugify(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .normalize('NFKC')
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}-]+/gu, '');
  return base || `tag-${Math.random().toString(36).slice(2, 8)}`;
}

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

/** GET /api/tags/:id — tag details + the files tagged with it */
router.get('/:id', async (req, res) => {
  try {
    const [tag] = await db.select().from(tags).where(eq(tags.id, req.params.id));
    if (!tag) return res.status(404).json({ error: 'Tag not found.' });

    const fileRows = await db
      .select({
        id: files.id, filename: files.filename, mimeType: files.mimeType,
        size: files.size, width: files.width, height: files.height,
        thumbUrl: files.thumbUrl, imgbbUrl: files.imgbbUrl, viewerUrl: files.viewerUrl,
        favorite: files.favorite, createdAt: files.createdAt,
        metadataJson: files.metadataJson,
      })
      .from(fileTags)
      .innerJoin(files, eq(files.id, fileTags.fileId))
      .where(eq(fileTags.tagId, req.params.id))
      .orderBy(desc(files.createdAt));

    res.json({ ...tag, files: fileRows });
  } catch (err) {
    console.error('[tags/get]', err);
    res.status(500).json({ error: 'Failed to load tag.' });
  }
});

/** POST /api/tags */
router.post('/', async (req, res) => {
  try {
    const { name } = req.body as { name?: string };
    if (!name?.trim()) return res.status(400).json({ error: 'name is required.' });
    const slug = slugify(name);
    const [row] = await db.insert(tags).values({ name: name.trim(), slug }).returning();
    res.status(201).json(row);
  } catch (err: any) {
    if (err?.code === '23505') return res.status(409).json({ error: 'Tag already exists.' });
    console.error('[tags/create]', err);
    res.status(500).json({ error: 'Failed to create tag.' });
  }
});

/** PATCH /api/tags/:id */
router.patch('/:id', async (req, res) => {
  try {
    const { name } = req.body as { name?: string };
    if (!name?.trim()) return res.status(400).json({ error: 'name is required.' });
    const slug = slugify(name);
    const [row] = await db.update(tags)
      .set({ name: name.trim(), slug })
      .where(eq(tags.id, req.params.id))
      .returning();
    if (!row) return res.status(404).json({ error: 'Tag not found.' });
    res.json(row);
  } catch (err: any) {
    if (err?.code === '23505') return res.status(409).json({ error: 'Tag name already exists.' });
    console.error('[tags/patch]', err);
    res.status(500).json({ error: 'Failed to update tag.' });
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
