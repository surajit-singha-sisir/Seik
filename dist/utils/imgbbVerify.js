/**
 * imgbbVerify.ts
 *
 * Server-side utilities for detecting dead ImgBB file records.
 *
 * IMPORTANT — WHY SERVER-SIDE HTTP PROBING DOES NOT WORK:
 *   The server environment (Neon/Vercel network) has an egress allowlist that
 *   blocks outbound requests to i.ibb.co with HTTP 403. Every URL — live or
 *   dead — is unreachable from the server. We therefore do NOT attempt any
 *   HTTP probing here.
 *
 * DETECTION STRATEGY:
 *   Detection is done entirely client-side (see deadImageCleanup.js):
 *     1. Canvas pixel sampling — ImgBB's "not found" placeholder is a
 *        solid cyan tile (rgb ~0, 178, 255). Real images have varied pixels.
 *     2. img.onerror — catches true network failures.
 *   When either signal fires, the client calls DELETE /api/cleanup/dead/:id
 *   which deletes the DB record unconditionally (client is trusted because it
 *   is the only party that can actually reach ImgBB).
 *
 * This file is kept for shared type definitions and the DB-layer helper used
 * by the cleanup route.
 */
import { db, files } from '../database/index.js';
import { inArray } from 'drizzle-orm';
/**
 * Delete a batch of file records from the DB by their ids.
 * Called by the cleanup route after the client has confirmed files are dead.
 */
export async function deleteFileRecords(ids) {
    if (ids.length === 0)
        return 0;
    await db.delete(files).where(inArray(files.id, ids));
    return ids.length;
}
//# sourceMappingURL=imgbbVerify.js.map