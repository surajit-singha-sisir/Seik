/* =========================================================
   dashboard.js — Seik dashboard
   ========================================================= */

// ── Helpers ───────────────────────────────────────────────
function fmtSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  if (bytes < 1024)       return `${bytes} B`;
  if (bytes < 1024 ** 2)  return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3)  return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function fmtNum(n) {
  return Number(n).toLocaleString();
}

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Date subtitle ─────────────────────────────────────────
document.getElementById('dash-date').textContent =
  new Date().toLocaleDateString(undefined, { weekday:'long', month:'long', day:'numeric', year:'numeric' });

// ── API health indicator ──────────────────────────────────
async function checkHealth() {
  const el = document.getElementById('api-status');
  try {
    const res = await fetch('/api/health');
    const dot = el.querySelector('.dot');
    if (res.ok) {
      dot.className = 'dot dot-ok';
      el.childNodes[1].textContent = ' API online';
    } else {
      dot.className = 'dot dot-fail';
      el.childNodes[1].textContent = ' API error';
    }
  } catch {
    const dot = el.querySelector('.dot');
    dot.className = 'dot dot-fail';
    el.childNodes[1].textContent = ' Unreachable';
  }
}

// ── Skeleton placeholders ─────────────────────────────────
function renderSkeletons(gallery, count = 8) {
  gallery.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const card = document.createElement('div');
    card.className = 'skeleton';
    card.style.cssText = 'aspect-ratio:1;border-radius:10px;';
    gallery.appendChild(card);
  }
}

// ── Gallery cards ─────────────────────────────────────────
function renderGallery(files) {
  const gallery = document.getElementById('gallery');
  const emptyEl = document.getElementById('gallery-empty');
  gallery.innerHTML = '';

  if (!files || files.length === 0) {
    emptyEl.hidden = false;
    return;
  }

  emptyEl.hidden = true;
  document.getElementById('recent-count').textContent = `${files.length} most recent`;

  files.forEach(file => {
    const card = document.createElement('div');
    card.className = 'g-card';
    card.title = file.filename;

    const isImage = file.mimeType?.startsWith('image/');
    const thumbUrl = file.thumbUrl || file.imgbbUrl;

    if (isImage && thumbUrl) {
      const img = document.createElement('img');
      img.className = 'g-thumb';
      img.src = thumbUrl;
      img.alt = file.filename;
      img.loading = 'lazy';
      img.onerror = () => img.replaceWith(iconThumb(file.mimeType));
      card.appendChild(img);
    } else {
      card.appendChild(iconThumb(file.mimeType));
    }

    const info = document.createElement('div');
    info.className = 'g-info';
    info.innerHTML = `
      <div class="g-name">${file.filename}</div>
      <div class="g-size">${fmtSize(file.size)} · ${fmtDate(file.createdAt)}</div>
    `;
    card.appendChild(info);

    // Lightbox on click (images only)
    if (isImage && (file.imgbbUrl || file.viewerUrl)) {
      card.addEventListener('click', () => openLightbox(file));
    } else if (file.viewerUrl || file.imgbbUrl) {
      card.addEventListener('click', () => window.open(file.viewerUrl || file.imgbbUrl, '_blank'));
    }

    gallery.appendChild(card);
  });
}

function iconThumb(mimeType) {
  const div = document.createElement('div');
  div.className = 'g-thumb-icon';
  let icon = 'fa-file';
  if (mimeType?.includes('pdf'))   icon = 'fa-file-pdf';
  if (mimeType?.startsWith('image/')) icon = 'fa-file-image';
  div.innerHTML = `<i class="fa-solid ${icon}"></i>`;
  return div;
}

// ── Lightbox ──────────────────────────────────────────────
const lightbox = document.getElementById('lightbox');
const lbImg    = document.getElementById('lb-img');
const lbMeta   = document.getElementById('lb-meta');
const lbClose  = document.getElementById('lb-close');

function openLightbox(file) {
  lbImg.src = file.imgbbUrl || file.viewerUrl;
  lbImg.alt = file.filename;
  const dims = file.width && file.height ? ` · ${file.width}×${file.height}` : '';
  lbMeta.textContent = `${file.filename} · ${fmtSize(file.size)}${dims}`;
  lightbox.hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  lightbox.hidden = true;
  lbImg.src = '';
  document.body.style.overflow = '';
}

lbClose.addEventListener('click', closeLightbox);
lightbox.addEventListener('click', e => { if (e.target === lightbox) closeLightbox(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeLightbox(); });

// ── Stats ─────────────────────────────────────────────────
function renderStats(stats) {
  document.getElementById('stat-files').textContent  = fmtNum(stats.fileCount);
  document.getElementById('stat-size').textContent   = fmtSize(stats.totalSize);
  document.getElementById('stat-albums').textContent = fmtNum(stats.albumCount);
  document.getElementById('stat-saved').textContent  = fmtSize(stats.savedBytes);
}

// ── Bootstrap ─────────────────────────────────────────────
async function init() {
  checkHealth();

  const gallery = document.getElementById('gallery');
  renderSkeletons(gallery);

  try {
    const res  = await fetch('/api/dashboard');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    renderStats(data.stats);
    renderGallery(data.recent);
  } catch (err) {
    console.error('[dashboard]', err);
    gallery.innerHTML = '';
    const emptyEl = document.getElementById('gallery-empty');
    emptyEl.querySelector('p').textContent = 'Could not load files — is the server running?';
    emptyEl.hidden = false;
    // Zero-out stats gracefully
    ['stat-files','stat-size','stat-albums','stat-saved'].forEach(id => {
      document.getElementById(id).textContent = '—';
    });
  }
}

init();
