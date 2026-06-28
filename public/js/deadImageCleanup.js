/**
 * deadImageCleanup.js
 *
 * Drop this script in any page that renders ImgBB images.
 * It watches for <img> onerror events (broken images) and silently
 * calls DELETE /api/cleanup/dead/:id to verify + purge the DB record.
 * If the server confirms the file is truly gone, the card is removed
 * from the DOM so the user never sees a broken tile.
 *
 * Usage:  import './deadImageCleanup.js'   (or include via <script>)
 * Every <img> that should participate must carry:
 *   data-file-id="<uuid>"   ← the DB file id
 */

(function () {
  'use strict';

  /**
   * Attach a one-time onerror handler to an <img> element.
   * @param {HTMLImageElement} img
   */
  function watchImage(img) {
    if (img.dataset.deadWatched) return;
    img.dataset.deadWatched = '1';

    img.addEventListener('error', async function onImgError() {
      img.removeEventListener('error', onImgError);

      const fileId = img.dataset.fileId;
      if (!fileId) return;

      try {
        const res = await fetch(`/api/cleanup/dead/${fileId}`, { method: 'DELETE' });
        if (!res.ok) return;
        const data = await res.json();

        if (data.removed) {
          // Walk up to the nearest card/list-item ancestor and remove it
          const card = img.closest('[data-file-id], .g-card, .file-card, li');
          if (card) {
            card.style.transition = 'opacity 0.3s';
            card.style.opacity = '0';
            setTimeout(() => card.remove(), 320);
          } else {
            img.remove();
          }
          console.info(`[deadImageCleanup] removed dead file: ${fileId}`);
        }
      } catch (err) {
        // Network error — don't crash, just log
        console.warn('[deadImageCleanup] could not verify dead image:', err);
      }
    });
  }

  /**
   * Observe the document for newly inserted <img data-file-id> elements
   * so dynamically rendered galleries are covered automatically.
   */
  function observeImages() {
    // Watch all existing images
    document.querySelectorAll('img[data-file-id]').forEach(watchImage);

    // Watch future images via MutationObserver
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== 1) continue; // Element nodes only
          if (node.tagName === 'IMG' && node.dataset.fileId) {
            watchImage(node);
          }
          node.querySelectorAll?.('img[data-file-id]').forEach(watchImage);
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', observeImages);
  } else {
    observeImages();
  }
})();
