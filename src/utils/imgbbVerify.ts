/**
 * imgbbVerify.ts
 *
 * Utilities for verifying whether ImgBB-hosted files still exist.
 * ImgBB has no official API to check existence; we do a lightweight
 * HEAD request against the stored image URL and treat a non-2xx /
 * network-error response as "deleted from source".
 */

import axios from 'axios';

/**
 * Returns true when the URL is reachable and returns a 2xx status.
 * Any other outcome (4xx, 5xx, redirect-to-error, network error) → false.
 */
export async function isImgbbUrlAlive(url: string): Promise<boolean> {
  if (!url) return false;
  try {
    const res = await axios.head(url, {
      timeout: 6000,
      maxRedirects: 4,
      // treat anything below 500 as a valid response so we can inspect the status
      validateStatus: () => true,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ImgbbVerifyBot/1.0)',
      },
    });
    // ImgBB returns 200 for live images, 404 / 302-to-error for deleted ones
    return res.status >= 200 && res.status < 400;
  } catch {
    return false;
  }
}

/**
 * Given an array of file rows (must include at least `id`, `imgbbUrl`, `thumbUrl`),
 * checks each URL and returns the ids of files whose source has been deleted.
 *
 * Uses the thumb URL when available (smaller, faster) and falls back to the
 * full imgbbUrl.
 */
export async function findDeadFileIds(
  fileRows: Array<{ id: string; imgbbUrl: string | null; thumbUrl: string | null }>,
  concurrency = 8,
): Promise<string[]> {
  const dead: string[] = [];

  // Process in chunks to cap outbound connections
  for (let i = 0; i < fileRows.length; i += concurrency) {
    const chunk = fileRows.slice(i, i + concurrency);
    const results = await Promise.all(
      chunk.map(async (f) => {
        const checkUrl = f.thumbUrl || f.imgbbUrl;
        if (!checkUrl) return f.id; // no URL stored → treat as dead
        const alive = await isImgbbUrlAlive(checkUrl);
        return alive ? null : f.id;
      }),
    );
    for (const id of results) {
      if (id !== null) dead.push(id);
    }
  }

  return dead;
}
