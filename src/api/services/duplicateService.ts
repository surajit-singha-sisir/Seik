import { db, files } from '../../database/index.js';
import { eq } from 'drizzle-orm';

export interface DuplicateMatch {
  fileId: string;
  filename: string;
  createdAt: Date;
}

/** Looks up an existing file by hash. Returns null if none found. We warn the
 * user about matches but never block the upload — see uploadService. */
export async function findDuplicate(hash: string): Promise<DuplicateMatch | null> {
  const [existing] = await db
    .select({ fileId: files.id, filename: files.filename, createdAt: files.createdAt })
    .from(files)
    .where(eq(files.hash, hash))
    .limit(1);

  return existing ?? null;
}
