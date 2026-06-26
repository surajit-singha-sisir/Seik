import { Router } from 'express';
import { db, files, fileTags, tags } from '../../database/index.js';
import { eq, and } from 'drizzle-orm';

const router = Router();

/** PATCH /api/files/:id — update albumId / favorite / hidden / archived */
router.patch('/:id', async (req, res) => {
  try {
    const { albumId, favorite, hidden, archived } = req.body as {
      albumId?: string | null; favorite?: boolean; hidden?: boolean; archived?: boolean;
    };
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (albumId !== undefined) updates.albumId = albumId;
    if (favorite !== undefined) updates.favorite = favorite;
    if (hidden !== undefined) updates.hidden = hidden;
    if (archived !== undefined) updates.archived = archived;

    const [row] = await db.update(files).set(updates).where(eq(files.id, req.params.id)).returning();
    if (!row) return res.status(404).json({ error: 'File not found.' });
    res.json(row);
  } catch (err) {
    console.error('[files/patch]', err);
    res.status(500).json({ error: 'Failed to update file.' });
  }
});

/** DELETE /api/files/:id — delete the file record */
router.delete('/:id', async (req, res) => {
  try {
    await db.delete(files).where(eq(files.id, req.params.id));
    res.json({ ok: true });
  } catch (err) {
    console.error('[files/delete]', err);
    res.status(500).json({ error: 'Failed to delete file.' });
  }
});

/** DELETE /api/files/:id/tags/:tagId — unlink a tag from a file */
router.delete('/:id/tags/:tagId', async (req, res) => {
  try {
    await db.delete(fileTags).where(
      and(eq(fileTags.fileId, req.params.id), eq(fileTags.tagId, req.params.tagId)),
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[files/untag]', err);
    res.status(500).json({ error: 'Failed to remove tag from file.' });
  }
});

/** POST /api/files/:id/tags — attach a tag to a file (by tagId or by name) */
router.post('/:id/tags', async (req, res) => {
  try {
    const { tagId, tagName } = req.body as { tagId?: string; tagName?: string };
    let resolvedTagId = tagId;

    if (!resolvedTagId && tagName?.trim()) {
      // look up tag by name, create if missing
      const slug = tagName.trim().toLowerCase().normalize('NFKC')
        .replace(/\s+/g, '-').replace(/[^\p{L}\p{N}-]+/gu, '') || `tag-${Math.random().toString(36).slice(2, 8)}`;
      const existing = await db.select().from(tags).where(eq(tags.slug, slug));
      if (existing[0]) {
        resolvedTagId = existing[0].id;
      } else {
        const [newTag] = await db.insert(tags).values({ name: tagName.trim(), slug }).returning();
        resolvedTagId = newTag.id;
      }
    }

    if (!resolvedTagId) return res.status(400).json({ error: 'tagId or tagName required.' });

    await db.insert(fileTags).values({ fileId: req.params.id, tagId: resolvedTagId })
      .onConflictDoNothing();
    res.json({ ok: true, tagId: resolvedTagId });
  } catch (err) {
    console.error('[files/addtag]', err);
    res.status(500).json({ error: 'Failed to add tag to file.' });
  }
});

export default router;
