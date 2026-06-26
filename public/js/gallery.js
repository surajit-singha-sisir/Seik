/* gallery.js — advanced: bulk-select, favorites, search, QR, copy-link, EXIF panel, dayjs */
import dayjs from 'https://esm.sh/dayjs@1.11.13';
import relativeTime from 'https://esm.sh/dayjs@1.11.13/plugin/relativeTime';
dayjs.extend(relativeTime);

const LIMIT = 40;
let page = 1, totalPages = 1, activeMime = '', searchQ = '', filterFav = false;

// Bulk-select state
let selectMode = false;
const selected = new Set(); // Set<fileId>

function fmtSize(b) {
  if (!b) return '0 B';
  if (b < 1024) return `${b} B`;
  if (b < 1024**2) return `${(b/1024).toFixed(1)} KB`;
  return `${(b/1024**2).toFixed(2)} MB`;
}
function fmtDate(iso) { return dayjs(iso).fromNow(); }
function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
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

// ── Toast ─────────────────────────────────────────────────
let toastEl;
function showToast(msg, type = '') {
  if (!toastEl) { toastEl = Object.assign(document.createElement('div'), { className: 'toast' }); document.body.appendChild(toastEl); }
  toastEl.textContent = msg;
  toastEl.className = 'toast show' + (type ? ' toast-' + type : '');
  clearTimeout(toastEl._t);
  toastEl._t = setTimeout(() => toastEl.classList.remove('show'), 2600);
}

// ── Skeletons ─────────────────────────────────────────────
function renderSkeletons() {
  const g = document.getElementById('gallery');
  g.innerHTML = '';
  for (let i = 0; i < 12; i++) {
    const d = document.createElement('div');
    d.className = 'skeleton'; d.style.cssText = 'aspect-ratio:1;border-radius:10px;';
    g.appendChild(d);
  }
}

// ── Lightbox ──────────────────────────────────────────────
const lightbox = document.getElementById('lightbox');
const lbImg = document.getElementById('lb-img');
const lbMeta = document.getElementById('lb-meta');
let lbCurrentFile = null;

document.getElementById('lb-close').addEventListener('click', closeLb);
lightbox.addEventListener('click', e => { if (e.target === lightbox) closeLb(); });

function openLb(f) {
  lbCurrentFile = f;
  lbImg.src = f.imgbbUrl || f.viewerUrl;
  lbImg.alt = f.filename;
  const d = f.width && f.height ? ` · ${f.width}×${f.height}` : '';
  lbMeta.textContent = `${f.filename} · ${fmtSize(f.size)}${d} · ${fmtDate(f.createdAt)}`;

  // Wire lightbox action buttons
  document.getElementById('lb-copy').onclick = () => copyLink(f);
  document.getElementById('lb-qr').onclick = () => openQRModal(f);
  document.getElementById('lb-download').onclick = () => downloadFile(f);
  document.getElementById('lb-fav').onclick = () => toggleFav(f);
  document.getElementById('lb-info').onclick = () => openInfoPanel(f);
  lightbox.hidden = false;
  document.body.style.overflow = 'hidden';
}
function closeLb() { lightbox.hidden = true; lbImg.src = ''; document.body.style.overflow = ''; lbCurrentFile = null; }
