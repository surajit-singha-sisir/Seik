import { db, files } from '../../database/index.js';
import { eq, and } from 'drizzle-orm';

export interface DuplicateMatch {
  fileId: string;
  filename: string;
  createdAt: Date;
  matchedBy: 'hash' | 'name_size';
}

/** Looks up an existing file by SHA-256 hash. Returns null if none found. We
 * warn the user about matches but never block the upload — see uploadService. */
export async function findDuplicate(hash: string): Promise<DuplicateMatch | null> {
  const [existing] = await db
    .select({ fileId: files.id, filename: files.filename, createdAt: files.createdAt })
    .from(files)
    .where(eq(files.hash, hash))
    .limit(1);

  return existing ? { ...existing, matchedBy: 'hash' } : null;
}

/** Pre-upload check by original filename + file size.
 * Used by the /api/uploads/check-duplicate endpoint so the client can warn
 * the user before spending bandwidth on an upload. */
export async function findDuplicateByNameAndSize(
  originalFilename: string,
  size: number,
): Promise<DuplicateMatch | null> {
  const [existing] = await db
    .select({ fileId: files.id, filename: files.filename, createdAt: files.createdAt })
    .from(files)
    .where(
      and(
        eq(files.originalFilename, originalFilename),
        eq(files.size, size),
      ),
    )
    .limit(1);

  return existing ? { ...existing, matchedBy: 'name_size' } : null;
}
