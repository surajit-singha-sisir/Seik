/**
 * cleanup.ts
 *
 * Routes that detect and remove DB records whose ImgBB source has been deleted.
 *
 * POST /api/cleanup/verify-all
 *   Scans every file record, probes ImgBB, deletes DB rows for dead files.
 *   Should be called from an admin UI, a cron job, or on-demand.
 *   Returns { removed: number, ids: string[] }
 *
 * DELETE /api/cleanup/dead/:id
 *   Immediately verify a single file by id and delete its DB record if dead.
 *   Used by the client-side onerror handler to self-report broken images.
 *   Returns { removed: boolean }
 */

import { Router } from 'express';
import { db, files } from '../../database/index.js';
import { eq, inArray } from 'drizzle-orm';
import { findDeadFileIds, isImgbbUrlAlive } from '../../utils/imgbbVerify.js';

const router = Router();

/* ── POST /api/cleanup/verify-all ────────────────────────────────────── */
router.post('/verify-all', async (_req, res) => {
  try {
    // Fetch only the columns we need — avoids pulling large metadata blobs
    const allFiles = await db
      .select({ id: files.id, imgbbUrl: files.imgbbUrl, thumbUrl: files.thumbUrl })
      .from(files);

    if (allFiles.length === 0) {
      return res.json({ removed: 0, ids: [] });
    }

    const deadIds = await findDeadFileIds(allFiles);

    if (deadIds.length > 0) {
      await db.delete(files).where(inArray(files.id, deadIds));
    }

    console.log(`[cleanup] verify-all: checked ${allFiles.length}, removed ${deadIds.length}`);
    return res.json({ removed: deadIds.length, ids: deadIds });
  } catch (err) {
    console.error('[cleanup/verify-all]', err);
    return res.status(500).json({ error: 'Cleanup scan failed.' });
  }
});

/* ── DELETE /api/cleanup/dead/:id ────────────────────────────────────── */
router.delete('/dead/:id', async (req, res) => {
  try {
    const [file] = await db
      .select({ id: files.id, imgbbUrl: files.imgbbUrl, thumbUrl: files.thumbUrl })
      .from(files)
      .where(eq(files.id, req.params.id));

    if (!file) {
      // Already gone — that's fine
      return res.json({ removed: true });
    }

    const checkUrl = file.thumbUrl || file.imgbbUrl;

    // Only delete when we can positively confirm it's dead
    if (checkUrl) {
      const alive = await isImgbbUrlAlive(checkUrl);
      if (alive) {
        return res.json({ removed: false, reason: 'File still alive on ImgBB' });
      }
    }

    await db.delete(files).where(eq(files.id, file.id));
    console.log(`[cleanup] dead-file confirmed & removed: ${file.id}`);
    return res.json({ removed: true });
  } catch (err) {
    console.error('[cleanup/dead]', err);
    return res.status(500).json({ error: 'Failed to verify/remove file.' });
  }
});

export default router;
