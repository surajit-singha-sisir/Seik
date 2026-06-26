import { Router } from 'express';
import { db, files, fileTags, tags, albums } from '../../database/index.js';
import { eq, and } from 'drizzle-orm';
import { getStorageProvider } from '../storage/index.js';

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

/** DELETE /api/files/:id — delete from ImgBB (best-effort) then remove the record */
router.delete('/:id', async (req, res) => {
  try {
    const [file] = await db.select().from(files).where(eq(files.id, req.params.id));
    if (!file) return res.status(404).json({ error: 'File not found.' });

    let remoteDeleted = false;
    if (file.deleteUrl) {
      try {
        const provider = getStorageProvider(file.storageProvider);
        remoteDeleted = await provider.delete(file.deleteUrl);
      } catch (providerErr) {
        console.error('[files/delete] remote delete failed', providerErr);
      }
    }

    await db.delete(files).where(eq(files.id, req.params.id));
    res.json({ ok: true, remoteDeleted });
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
    await db.insert(fileTags).values({ fileId: req.params.id, tagId: resolvedTagId }).onConflictDoNothing();
    res.json({ ok: true, tagId: resolvedTagId });
  } catch (err) {
    console.error('[files/addtag]', err);
    res.status(500).json({ error: 'Failed to add tag to file.' });
  }
});

/** GET /api/files/:id — full file detail with tags, album, EXIF */
router.get('/:id', async (req, res) => {
  try {
    const [file] = await db.select().from(files).where(eq(files.id, req.params.id));
    if (!file) return res.status(404).json({ error: 'File not found.' });

    // Fetch tags for this file
    const fileTags_ = await db
      .select({ id: tags.id, name: tags.name, slug: tags.slug })
      .from(fileTags)
      .innerJoin(tags, eq(tags.id, fileTags.tagId))
      .where(eq(fileTags.fileId, req.params.id));

    // Fetch album name if set
    let album: { id: string; name: string } | null = null;
    if (file.albumId) {
      const [a] = await db.select({ id: albums.id, name: albums.name }).from(albums).where(eq(albums.id, file.albumId));
      album = a ?? null;
    }

    res.json({ ...file, tags: fileTags_, album });
  } catch (err) {
    console.error('[files/get]', err);
    res.status(500).json({ error: 'Failed to load file.' });
  }
});

export default router;
