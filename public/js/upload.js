/* =========================================================
   upload.js — Seik upload page  (DB-connected settings)
   Handles: file picker · drag-drop · paste · URL · folder
   Album & tag settings are loaded from and saved to the DB.
   ========================================================= */

const COMPRESSIBLE_MIME = new Set([
  'image/jpeg','image/png','image/webp','image/avif','image/tiff',
]);

// ── DOM refs ──────────────────────────────────────────────
const dropzone    = document.getElementById('dropzone');
const fileInput   = document.getElementById('file-input');
const folderInput = document.getElementById('folder-input');
const btnBrowse   = document.getElementById('btn-browse');
const btnFolder   = document.getElementById('btn-folder');
const urlInput    = document.getElementById('url-input');
const btnUrlAdd   = document.getElementById('btn-url-add');
const queueHead   = document.getElementById('queue-head');
const queueList   = document.getElementById('queue');
const queueCount  = document.getElementById('queue-count');
const btnClearDone   = document.getElementById('btn-clear-done');
const btnUploadAll   = document.getElementById('btn-upload-all');
const itemTpl        = document.getElementById('queue-item-template');

const albumSelect    = document.getElementById('album-select');
const tagsPicker     = document.getElementById('tags-picker');
const newTagInput    = document.getElementById('new-tag-input');
const btnNewTag      = document.getElementById('btn-new-tag');
const globalQuality  = document.getElementById('global-quality');
const globalQualLabel= document.getElementById('global-quality-label');

const settingSummary    = document.getElementById('setting-summary');
const summaryAlbumRow   = document.getElementById('summary-album-row');
const summaryAlbumName  = document.getElementById('summary-album-name');
const summaryTagsRow    = document.getElementById('summary-tags-row');
const summaryTagsList   = document.getElementById('summary-tags-list');

// ── Duplicate modal refs ───────────────────────────────────
const dupBackdrop     = document.getElementById('dup-modal-backdrop');
const dupModalList    = document.getElementById('dup-modal-list');
const dupModalSubtitle= document.getElementById('dup-modal-subtitle');
const btnDupRemoveAll = document.getElementById('dup-modal-remove-all');
const btnDupCancel    = document.getElementById('dup-modal-cancel');
const btnDupUploadAll = document.getElementById('dup-modal-upload-all');

// ── State ─────────────────────────────────────────────────
const queue = [];
let nextId = 0;
let selectedTagIds = new Set();
let allTags = [];

// ── Toast ─────────────────────────────────────────────────
let toastEl;
function showToast(msg, type = '') {
  if (!toastEl) {
    toastEl = Object.assign(document.createElement('div'), { className: 'toast' });
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = msg;
  toastEl.className = 'toast show' + (type ? ' toast-' + type : '');
  clearTimeout(toastEl._t);
  toastEl._t = setTimeout(() => toastEl.classList.remove('show'), 2400);
}

// ── Helpers ───────────────────────────────────────────────
function fmtSize(bytes) {
  if (bytes < 1024)     return `${bytes} B`;
  if (bytes < 1024**2)  return `${(bytes/1024).toFixed(1)} KB`;
  return `${(bytes/1024**2).toFixed(2)} MB`;
}
function fmtPct(n) {
  if (n > 0) return `−${n}%`;
  if (n < 0) return `+${Math.abs(n)}%`;
  return '0%';
}

// ── Health check ──────────────────────────────────────────
async function checkHealth() {
  const el = document.getElementById('api-status');
  try {
    const ok = (await fetch('/api/health')).ok;
    el.querySelector('.dot').className = `dot dot-${ok ? 'ok' : 'fail'}`;
    el.childNodes[1].textContent = ok ? ' API online' : ' API error';
  } catch {
    el.querySelector('.dot').className = 'dot dot-fail';
    el.childNodes[1].textContent = ' Unreachable';
  }
}
