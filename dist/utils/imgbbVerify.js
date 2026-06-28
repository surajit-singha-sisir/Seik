/**
 * imgbbVerify.ts
 *
 * Detects whether an ImgBB-hosted file has been deleted.
 *
 * THE PROBLEM:
 *   ImgBB does NOT return 404 for deleted images. Instead it serves its own
 *   cyan "image not found" placeholder at HTTP 200, so a simple HEAD/status
 *   check always reports the file as alive.
 *
 * THE SOLUTION — two-signal detection:
 *   1. Content-Length: ImgBB's placeholder is ~1,604 bytes. Any real image
 *      stored by the user will be larger. We treat content-length ≤ 2048 as
 *      "dead" when the stored file size is known to be larger.
 *   2. URL fingerprint: When ImgBB redirects a deleted image the final URL
 *      often contains "not-found", "notfound", or "no-image" path segments.
 *   3. Fallback: if content-length is missing (chunked transfer), we do a
 *      full GET and check the actual byte count of the response body.
 */
import axios from 'axios';
/** Byte-size ceiling for ImgBB's own "not found" placeholder image. */
const IMGBB_PLACEHOLDER_MAX_BYTES = 2048;
/** URL fragments that appear in ImgBB's not-found redirect targets. */
const DEAD_URL_PATTERNS = ['not-found', 'notfound', 'no-image', 'deleted'];
function looksLikeDeadUrl(url) {
    const lower = url.toLowerCase();
    return DEAD_URL_PATTERNS.some(p => lower.includes(p));
}
/**
 * Returns true when the ImgBB URL resolves to a real image.
 * Returns false when it resolves to ImgBB's placeholder (deleted file).
 *
 * @param url        - The imgbbUrl or thumbUrl stored in the DB
 * @param storedSize - The file's `size` column value (bytes). When provided,
 *                     used as an extra cross-check against content-length.
 */
export async function isImgbbUrlAlive(url, storedSize) {
    if (!url)
        return false;
    try {
        // ── Step 1: HEAD request to get headers cheaply ──────────────────────
        const head = await axios.head(url, {
            timeout: 8000,
            maxRedirects: 5,
            validateStatus: () => true,
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; ImgbbVerifyBot/1.0)',
            },
        });
        // Hard 404/410 — definitely dead
        if (head.status === 404 || head.status === 410)
            return false;
        // Check if the redirect landed on a known dead-URL pattern
        const finalUrl = head.request?.res?.responseUrl || url;
        if (looksLikeDeadUrl(finalUrl))
            return false;
        // ── Step 2: Content-Length signal ────────────────────────────────────
        const contentLength = Number(head.headers['content-length'] ?? NaN);
        if (!Number.isNaN(contentLength)) {
            // If content-length is tiny it's the placeholder, not a real image
            if (contentLength <= IMGBB_PLACEHOLDER_MAX_BYTES)
                return false;
            // If we know the original size, the response must be at least 50% of it
            // (ImgBB may serve a compressed variant, but never 1 KB for a 100 KB file)
            if (storedSize && storedSize > IMGBB_PLACEHOLDER_MAX_BYTES) {
                if (contentLength <= IMGBB_PLACEHOLDER_MAX_BYTES)
                    return false;
            }
            // Content-length looks plausible → file is alive
            return true;
        }
        // ── Step 3: No Content-Length header — do a full GET and measure ─────
        // (chunked transfers don't send content-length)
        const get = await axios.get(url, {
            timeout: 10000,
            maxRedirects: 5,
            responseType: 'arraybuffer',
            validateStatus: () => true,
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; ImgbbVerifyBot/1.0)',
            },
        });
        const finalGetUrl = get.request?.res?.responseUrl || url;
        if (looksLikeDeadUrl(finalGetUrl))
            return false;
        if (get.status === 404 || get.status === 410)
            return false;
        const bodyBytes = get.data?.byteLength ?? 0;
        return bodyBytes > IMGBB_PLACEHOLDER_MAX_BYTES;
    }
    catch {
        // Network error — can't confirm dead, treat as unknown / skip
        return true;
    }
}
/**
 * Given an array of file rows, checks each URL concurrently and returns
 * the ids of files whose ImgBB source has been deleted (serving placeholder).
 */
export async function findDeadFileIds(fileRows, concurrency = 6) {
    const dead = [];
    for (let i = 0; i < fileRows.length; i += concurrency) {
        const chunk = fileRows.slice(i, i + concurrency);
        const results = await Promise.all(chunk.map(async (f) => {
            // Prefer thumbUrl (smaller download if we reach step 3)
            const checkUrl = f.thumbUrl || f.imgbbUrl;
            if (!checkUrl)
                return f.id; // no URL stored → treat as dead
            const alive = await isImgbbUrlAlive(checkUrl, f.size);
            return alive ? null : f.id;
        }));
        for (const id of results) {
            if (id !== null)
                dead.push(id);
        }
    }
    return dead;
}
//# sourceMappingURL=imgbbVerify.js.map