import { db, files } from '../../database/index.js';
import { eq, and } from 'drizzle-orm';
/** Looks up an existing file by SHA-256 hash. Returns null if none found. We
 * warn the user about matches but never block the upload — see uploadService. */
export async function findDuplicate(hash) {
    const [existing] = await db
        .select({ fileId: files.id, filename: files.filename, createdAt: files.createdAt })
        .from(files)
        .where(eq(files.hash, hash))
        .limit(1);
    return existing ? { ...existing, matchedBy: 'hash' } : null;
}
/** Pre-upload check by original filename + original file size (before compression).
 * Used by the /api/uploads/check-duplicate endpoint so the client can hard-block
 * duplicates before spending any bandwidth on the upload. */
export async function findDuplicateByNameAndSize(originalFilename, size) {
    const [existing] = await db
        .select({ fileId: files.id, filename: files.filename, createdAt: files.createdAt })
        .from(files)
        .where(and(eq(files.originalFilename, originalFilename), eq(files.originalSize, size)))
        .limit(1);
    return existing ? { ...existing, matchedBy: 'name_size' } : null;
}
//# sourceMappingURL=duplicateService.js.map