/**
 * deadImageCleanup.js
 *
 * Detects ImgBB "image not found" placeholder tiles and purges their DB records.
 *
 * ─── WHY THIS WORKS CLIENT-SIDE ONLY ────────────────────────────────────────
 *
 *   The server cannot reach i.ibb.co — the hosting network (Neon/Vercel)
 *   blocks egress to ImgBB with HTTP 403, so server-side probing always fails.
 *   The browser, however, fetches ImgBB images directly and can detect what
 *   actually loaded.
 *
 * ─── TWO DETECTION SIGNALS ───────────────────────────────────────────────────
 *
 *   SIGNAL 1 — Canvas pixel sampling (primary)
 *     ImgBB's "not found" placeholder is a solid cyan tile:
 *       rgb(0, 178, 255)  /  hex #00B2FF
 *     After each image loads we draw the center pixel to a 1×1 offscreen
 *     canvas and compare. Real photos have varied colors; the placeholder
 *     is always that distinctive cyan.
 *
 *   SIGNAL 2 — img.onerror (fallback)
 *     Catches genuine network failures (DNS error, timeout, etc.)
 *
 * ─── ON DETECTION ────────────────────────────────────────────────────────────
 *
 *   When either signal fires for an image carrying data-file-id:
 *     1. The card fades out and is removed from the DOM immediately.
 *     2. DELETE /api/cleanup/dead/:id is called to remove the DB record.
 *        The server trusts the client and deletes unconditionally — the client
 *        is the only party that can actually verify ImgBB reachability.
 *
 * ─── SETUP ───────────────────────────────────────────────────────────────────
 *
 *   Every <img> to be checked must have:   data-file-id="<uuid>"
 *   The nearest ancestor with [data-file-id] is used as the card to remove.
 *   A MutationObserver handles dynamically rendered galleries automatically.
 */

(function () {
  'use strict';

  // ── ImgBB placeholder color (rgb) ────────────────────────────────────────
  const PH_R = 0, PH_G = 178, PH_B = 255;
  // ±20 tolerance per channel covers JPEG compression artefacts on the cyan fill
  const TOLERANCE = 20;

  function channelMatch(a, b) { return Math.abs(a - b) <= TOLERANCE; }

  /**
   * Sample the center pixel of a loaded <img> and return true if it matches
   * ImgBB's cyan placeholder color.
   * @param {HTMLImageElement} img - must already be decoded (naturalWidth > 0)
   */
  function isPlaceholder(img) {
    if (!img.naturalWidth || !img.naturalHeight) return false;
    try {
      const canvas = document.createElement('canvas');
      canvas.width  = 1;
      canvas.height = 1;
      const ctx = canvas.getContext('2d');
      if (!ctx) return false;
      // Draw center pixel only — 1×1 is as fast as it gets
      ctx.drawImage(
        img,
        Math.floor(img.naturalWidth  / 2),
        Math.floor(img.naturalHeight / 2),
        1, 1,   // source size
        0, 0,   // dest position
        1, 1,   // dest size
      );
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
      return channelMatch(r, PH_R) && channelMatch(g, PH_G) && channelMatch(b, PH_B);
    } catch {
      // SecurityError: canvas tainted by cross-origin image without CORS headers.
      // We can't read pixels — treat as unknown (do nothing).
      return false;
    }
  }

  /** Remove the card from the DOM with a quick fade. */
  function removeCard(fileId) {
    // Walk up from the img to the nearest element that acts as the card
    const card =
      document.querySelector(`[data-file-id="${fileId}"]`) ||
      document.querySelector(`[data-id="${fileId}"]`);

    if (card) {
      card.style.transition = 'opacity 0.3s ease';
      card.style.opacity    = '0';
      card.style.pointerEvents = 'none';
      setTimeout(() => card.remove(), 320);
    }
  }

  /**
   * Tell the server to delete the DB record for a confirmed-dead file.
   * The server trusts this request — the client is authoritative here.
   */
  async function deleteRecord(fileId) {
    try {
      const res = await fetch(`/api/cleanup/dead/${fileId}`, { method: 'DELETE' });
      if (res.ok) {
        console.info(`[deadImageCleanup] deleted DB record for dead file: ${fileId}`);
      } else {
        console.warn(`[deadImageCleanup] server returned ${res.status} for file: ${fileId}`);
      }
    } catch (err) {
      console.warn('[deadImageCleanup] fetch error:', err);
    }
  }

  /** Called when we have confirmed an image is dead (either signal). */
  function handleDeadImage(img) {
    const fileId = img.dataset.fileId;
    if (!fileId) return;

    // Avoid double-processing
    if (img.dataset.deadHandled) return;
    img.dataset.deadHandled = '1';

    removeCard(fileId);
    deleteRecord(fileId);
  }

  /** Attach detection handlers to a single <img data-file-id> element. */
  function watchImage(img) {
    if (img.dataset.deadWatched) return;
    img.dataset.deadWatched = '1';

    // --- Signal 2: true network error ---
    img.addEventListener('error', () => handleDeadImage(img), { once: true });

    // --- Signal 1: canvas pixel check after successful load ---
    const checkPixel = () => {
      if (isPlaceholder(img)) handleDeadImage(img);
    };

    if (img.complete) {
      // Already loaded (from cache or fast connection) — check immediately
      checkPixel();
    } else {
      img.addEventListener('load', checkPixel, { once: true });
    }
  }

  /** Start watching all current and future tracked images. */
  function init() {
    document.querySelectorAll('img[data-file-id]').forEach(watchImage);

    new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          if (node.tagName === 'IMG' && node.dataset?.fileId) {
            watchImage(node);
          }
          node.querySelectorAll?.('img[data-file-id]').forEach(watchImage);
        }
      }
    }).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
