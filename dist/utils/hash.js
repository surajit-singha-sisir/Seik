import { createHash } from 'node:crypto';
/** SHA-256 hash of a file buffer, used for duplicate detection. */
export function computeHash(buffer) {
    return createHash('sha256').update(buffer).digest('hex');
}
//# sourceMappingURL=hash.js.map