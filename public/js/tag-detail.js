/* tag-detail.js — dynamic, DB-backed tag page (/tags/:id) */

const tagId = location.pathname.split('/').filter(Boolean).pop();

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
function fmtSize(b) {
  if (!b) return '0 B';
  if (b < 1024) return `${b} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 ** 2).toFixed(2)} MB`;
}

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
  if (!toastEl) {
    toastEl = Object.assign(document.createElement('div'), { className: 'toast' });
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = msg;
  toastEl.className = 'toast show' + (type ? ' toast-' + type : '');
  clearTimeout(toastEl._t);
  toastEl._t = setTimeout(() => toastEl.classList.remove('show'), 2400);
}

// ── Lightbox ──────────────────────────────────────────────
const lightbox = document.getElementById('lightbox');
const lbImg = document.getElementById('lb-img');
const lbMeta = document.getElementById('lb-meta');
document.getElementById('lb-close').addEventListener('click', closeLb);
lightbox.addEventListener('click', e => { if (e.target === lightbox) closeLb(); });
function openLb(f) {
  lbImg.src = f.imgbbUrl || f.viewerUrl;
  lbImg.alt = f.filename;
  const d = f.width && f.height ? ` · ${f.width}×${f.height}` : '';
  lbMeta.textContent = `${f.filename} · ${fmtSize(f.size)}${d}`;
  lightbox.hidden = false;
  document.body.style.overflow = 'hidden';
}
function closeLb() {
  lightbox.hidden = true; lbImg.src = ''; document.body.style.overflow = '';
}

function iconThumb(mime) {
  const d = document.createElement('div'); d.className = 'g-thumb-icon';
  let ic = 'fa-file';
  if (mime?.includes('pdf')) ic = 'fa-file-pdf';
  if (mime?.startsWith('image/')) ic = 'fa-file-image';
  d.innerHTML = `<i class="fa-solid ${ic}"></i>`; return d;
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
