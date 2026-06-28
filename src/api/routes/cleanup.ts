/**
 * cleanup.ts
 *
 * Routes that detect and remove DB records whose ImgBB source has been deleted.
 *
 * POST /api/cleanup/verify-all
 *   Scans every file record, probes ImgBB (with placeholder detection),
 *   deletes DB rows for dead files.
 *   Returns { checked, removed, ids }
 *
 * DELETE /api/cleanup/dead/:id
 *   Verify a single file and delete its DB record if dead.
 *   Used by the client-side canvas checker to confirm server-side.
 *   Returns { removed: boolean }
 *
 * GET /api/cleanup/status
 *   Returns last scan summary without running a scan.
 */

import { Router } from 'express';
import { db, files } from '../../database/index.js';
import { eq, inArray } from 'drizzle-orm';
import { findDeadFileIds, isImgbbUrlAlive } from '../../utils/imgbbVerify.js';

const router = Router();

// Simple in-memory record of the last scan (survives for the process lifetime)
let lastScan: { at: string; checked: number; removed: number; ids: string[] } | null = null;

/* ── POST /api/cleanup/verify-all ────────────────────────────────────── */
router.post('/verify-all', async (_req, res) => {
  try {
    const allFiles = await db
      .select({
        id:       files.id,
        imgbbUrl: files.imgbbUrl,
        thumbUrl: files.thumbUrl,
        size:     files.size,
      })
      .from(files);

    if (allFiles.length === 0) {
      lastScan = { at: new Date().toISOString(), checked: 0, removed: 0, ids: [] };
      return res.json(lastScan);
    }

    const deadIds = await findDeadFileIds(allFiles);

    if (deadIds.length > 0) {
      await db.delete(files).where(inArray(files.id, deadIds));
    }

    lastScan = {
      at:      new Date().toISOString(),
      checked: allFiles.length,
      removed: deadIds.length,
      ids:     deadIds,
    };

    console.log(`[cleanup] verify-all: checked ${allFiles.length}, removed ${deadIds.length}`);
    return res.json(lastScan);
  } catch (err) {
    console.error('[cleanup/verify-all]', err);
    return res.status(500).json({ error: 'Cleanup scan failed.' });
  }
});

/* ── GET /api/cleanup/status ─────────────────────────────────────────── */
router.get('/status', (_req, res) => {
  res.json(lastScan ?? { at: null, checked: 0, removed: 0, ids: [] });
});

/* ── DELETE /api/cleanup/dead/:id ────────────────────────────────────── */
router.delete('/dead/:id', async (req, res) => {
  try {
    const [file] = await db
      .select({
        id:       files.id,
        imgbbUrl: files.imgbbUrl,
        thumbUrl: files.thumbUrl,
        size:     files.size,
      })
      .from(files)
      .where(eq(files.id, req.params.id));

    if (!file) {
      return res.json({ removed: true }); // already gone
    }

    const checkUrl = file.thumbUrl || file.imgbbUrl;
    if (!checkUrl) {
      // No URL at all — definitely stale, remove it
      await db.delete(files).where(eq(files.id, file.id));
      return res.json({ removed: true });
    }

    const alive = await isImgbbUrlAlive(checkUrl, file.size);
    if (alive) {
      return res.json({ removed: false, reason: 'File still alive on ImgBB' });
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
