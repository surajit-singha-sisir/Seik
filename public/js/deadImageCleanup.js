/**
 * deadImageCleanup.js
 *
 * Detects ImgBB "image not found" placeholder tiles and removes them.
 *
 * WHY onerror DOESN'T WORK:
 *   ImgBB serves a cyan placeholder image at HTTP 200 for deleted files.
 *   The browser loads it successfully, so onerror never fires.
 *
 * HOW WE DETECT IT — canvas pixel sampling:
 *   ImgBB's placeholder is a solid cyan (#00B2FF / rgb(0, 178, 255)) tile.
 *   After each image loads, we draw it to an offscreen canvas and sample
 *   the center pixel. If it matches the placeholder color, the file is dead.
 *   We then call DELETE /api/cleanup/dead/:id for server-side DB removal.
 *
 * SETUP:
 *   Every <img> that should be checked must carry:  data-file-id="<uuid>"
 *   The nearest ancestor with [data-file-id] is used as the card to remove.
 */

(function () {
  'use strict';

  // ImgBB placeholder color channels (rgb)
  const PH_R = 0, PH_G = 178, PH_B = 255;
  // Allow ±18 per channel to tolerate JPEG compression artefacts
  const TOLERANCE = 18;

  function channelMatch(a, b) { return Math.abs(a - b) <= TOLERANCE; }

  /**
   * Returns true when the center pixel of the image matches
   * ImgBB's "image not found" placeholder color.
   * @param {HTMLImageElement} img - must already be loaded (naturalWidth > 0)
   */
  function isPlaceholder(img) {
    try {
      const canvas = document.createElement('canvas');
      // Sample just a 1×1 slice at the center — fast and sufficient
      canvas.width = 1;
      canvas.height = 1;
      const ctx = canvas.getContext('2d');
      if (!ctx) return false;

      const sx = Math.floor(img.naturalWidth  / 2);
      const sy = Math.floor(img.naturalHeight / 2);
      ctx.drawImage(img, sx, sy, 1, 1, 0, 0, 1, 1);

      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
      return channelMatch(r, PH_R) && channelMatch(g, PH_G) && channelMatch(b, PH_B);
    } catch {
      // Canvas tainted (cross-origin without CORS) — fall back to false
      return false;
    }
  }

  /**
   * After confirming the placeholder client-side, tell the server to
   * double-check and delete the DB record.
   * @param {string} fileId
   * @param {Element} card - DOM node to remove on success
   */
  async function reportDead(fileId, card) {
    try {
      const res = await fetch(`/api/cleanup/dead/${fileId}`, { method: 'DELETE' });
      if (!res.ok) return;
      const data = await res.json();
      if (data.removed && card) {
        card.style.transition = 'opacity 0.35s';
        card.style.opacity    = '0';
        setTimeout(() => card.remove(), 360);
        console.info(`[deadImageCleanup] pruned dead file: ${fileId}`);
      }
    } catch (err) {
      console.warn('[deadImageCleanup] server check failed:', err);
    }
  }

  /**
   * Attach load + error handlers to one <img data-file-id> element.
   */
  function watchImage(img) {
    if (img.dataset.deadWatched) return;
    img.dataset.deadWatched = '1';

    const check = () => {
      if (!img.naturalWidth) return; // not yet loaded or broken
      if (!isPlaceholder(img))  return; // real image — leave it

      const fileId = img.dataset.fileId;
      if (!fileId) return;

      // Walk up to the nearest card anchor
      const card = img.closest('[data-file-id]') || img.parentElement;
      reportDead(fileId, card);
    };

    if (img.complete && img.naturalWidth > 0) {
      // Image already loaded (e.g. from cache)
      check();
    } else {
      img.addEventListener('load',  check, { once: true });
      img.addEventListener('error', () => {
        // True network error (rare with ImgBB) — also report dead
        const fileId = img.dataset.fileId;
        if (!fileId) return;
        const card = img.closest('[data-file-id]') || img.parentElement;
        reportDead(fileId, card);
      }, { once: true });
    }
  }

  /** Watch all current and future <img data-file-id> elements. */
  function observeImages() {
    document.querySelectorAll('img[data-file-id]').forEach(watchImage);

    new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (node.tagName === 'IMG' && node.dataset?.fileId) watchImage(node);
          node.querySelectorAll?.('img[data-file-id]').forEach(watchImage);
        }
      }
    }).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', observeImages);
  } else {
    observeImages();
  }
})();
