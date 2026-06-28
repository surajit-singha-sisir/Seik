/**
 * cleanup.ts
 *
 * API routes for removing stale ImgBB file records from the DB.
 *
 * WHY SERVER-SIDE PROBING IS REMOVED:
 *   The server's egress network cannot reach i.ibb.co (blocked by the
 *   Neon/Vercel allowlist). Detection happens entirely in the browser via
 *   deadImageCleanup.js, which can reach ImgBB just fine.
 *
 * DELETE /api/cleanup/dead/:id
 *   Client has confirmed this file is dead (placeholder detected or onerror).
 *   Deletes the DB record unconditionally and returns { removed: true }.
 *
 * DELETE /api/cleanup/dead  (body: { ids: string[] })
 *   Batch version — client reports multiple dead ids at once.
 *   Returns { removed: number, ids: string[] }
 *
 * GET /api/cleanup/status
 *   Returns a summary of records removed in this server session.
 */
import { Router } from 'express';
import { db, files } from '../../database/index.js';
import { eq, inArray } from 'drizzle-orm';
const router = Router();
// Running total for this server session
let sessionRemoved = 0;
const sessionIds = [];
/* ── DELETE /api/cleanup/dead/:id  (single) ──────────────────────────── */
router.delete('/dead/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await db.delete(files).where(eq(files.id, id));
        sessionRemoved++;
        sessionIds.push(id);
        console.log(`[cleanup] removed dead file record: ${id} (session total: ${sessionRemoved})`);
        return res.json({ removed: true, id });
    }
    catch (err) {
        console.error('[cleanup/dead]', err);
        return res.status(500).json({ error: 'Failed to remove file record.' });
    }
});
/* ── DELETE /api/cleanup/dead  (batch) ───────────────────────────────── */
router.delete('/dead', async (req, res) => {
    const ids = req.body?.ids ?? [];
    if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: '`ids` array is required.' });
    }
    try {
        await db.delete(files).where(inArray(files.id, ids));
        sessionRemoved += ids.length;
        sessionIds.push(...ids);
        console.log(`[cleanup] batch removed ${ids.length} dead file records (session total: ${sessionRemoved})`);
        return res.json({ removed: ids.length, ids });
    }
    catch (err) {
        console.error('[cleanup/dead batch]', err);
        return res.status(500).json({ error: 'Failed to remove file records.' });
    }
});
/* ── GET /api/cleanup/status ─────────────────────────────────────────── */
router.get('/status', (_req, res) => {
    res.json({ sessionRemoved, ids: sessionIds });
});
export default router;
//# sourceMappingURL=cleanup.js.map