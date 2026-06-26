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

// ── Toast ─────────────────────────────────────────────────
let toastEl;
function showToast(msg, type = '') {
  if (!toastEl) { toastEl = Object.assign(document.createElement('div'), { className: 'toast' }); document.body.appendChild(toastEl); }
  toastEl.textContent = msg;
  toastEl.className = 'toast show' + (type ? ' toast-' + type : '');
  clearTimeout(toastEl._t);
  toastEl._t = setTimeout(() => toastEl.classList.remove('show'), 2400);
}

// ── Lightbox ──────────────────────────────────────────────
const lightbox = document.getElementById('lightbox');
const lbImg    = document.getElementById('lb-img');
const lbMeta   = document.getElementById('lb-meta');
const lbClose  = document.getElementById('lb-close');
let lbCurrentFile = null;

function openLightbox(file) {
  lbCurrentFile = file;
  lbImg.src = file.imgbbUrl || file.viewerUrl;
  lbImg.alt = file.filename;
  const dims = file.width && file.height ? ` · ${file.width}×${file.height}` : '';
  lbMeta.textContent = `${file.filename} · ${fmtSize(file.size)}${dims}`;

  document.getElementById('lb-copy').onclick     = () => copyLink(file);
  document.getElementById('lb-download').onclick = () => downloadFile(file);
  document.getElementById('lb-fav').onclick      = () => toggleFav(file);
  document.getElementById('lb-qr').onclick       = () => openQRModal(file);
  document.getElementById('lb-info').onclick     = () => openInfoPanel(file);

  lightbox.hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  lightbox.hidden = true;
  lbImg.src = '';
  document.body.style.overflow = '';
  lbCurrentFile = null;
}

lbClose.addEventListener('click', closeLightbox);
lightbox.addEventListener('click', e => { if (e.target === lightbox) closeLightbox(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeLightbox(); });

// ── Copy link ─────────────────────────────────────────────
async function copyLink(f) {
  const url = f.viewerUrl || f.imgbbUrl;
  if (!url) { showToast('No public URL', 'fail'); return; }
  try { await navigator.clipboard.writeText(url); showToast('Link copied!'); }
  catch { showToast('Copy failed', 'fail'); }
}

// ── Download ──────────────────────────────────────────────
function downloadFile(f) {
  const url = f.imgbbUrl || f.viewerUrl;
  if (!url) { showToast('No downloadable URL', 'fail'); return; }
  const a = document.createElement('a');
  a.href = url; a.download = f.filename; a.target = '_blank';
  document.body.appendChild(a); a.click(); a.remove();
}

// ── Favourite toggle ──────────────────────────────────────
async function toggleFav(f) {
  const newVal = !f.favorite;
  try {
    const res = await fetch(`/api/files/${f.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ favorite: newVal }),
    });
    if (!res.ok) { showToast('Update failed', 'fail'); return; }
    f.favorite = newVal;
    const btn = document.getElementById('lb-fav');
    btn.querySelector('i').className = `fa-${newVal ? 'solid' : 'regular'} fa-heart`;
    btn.classList.toggle('active-fav', newVal);
    showToast(newVal ? 'Added to favourites' : 'Removed from favourites');
  } catch { showToast('Network error', 'fail'); }
}

// ── QR modal ──────────────────────────────────────────────
function openQRModal(f) {
  const modal = document.getElementById('qr-modal');
  const img   = document.getElementById('qr-img');
  const link  = document.getElementById('qr-link');
  img.src  = `/api/qr/${f.id}?format=svg`;
  img.style.width = '220px'; img.style.borderRadius = '10px';
  link.href = `/api/qr/${f.id}?format=png`;
  link.textContent = 'Download PNG';
  document.getElementById('qr-filename').textContent = f.filename;
  modal.hidden = false;
}
document.getElementById('qr-modal-close').addEventListener('click', () => {
  document.getElementById('qr-modal').hidden = true;
});
document.getElementById('qr-modal').addEventListener('click', e => {
  if (e.target === document.getElementById('qr-modal')) document.getElementById('qr-modal').hidden = true;
});

// ── Info / EXIF panel ─────────────────────────────────────
function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
async function openInfoPanel(f) {
  const panel = document.getElementById('info-panel');
  document.getElementById('info-loading').hidden = false;
  document.getElementById('info-content').innerHTML = '';
  panel.hidden = false;
  try {
    const res  = await fetch(`/api/files/${f.id}`);
    const data = await res.json();
    document.getElementById('info-loading').hidden = true;
    const rows = [
      ['Filename', escHtml(data.filename)],
      ['Type',     data.mimeType],
      ['Size',     fmtSize(data.size)],
      ['Dimensions', data.width && data.height ? `${data.width} × ${data.height} px` : '—'],
      ['Uploaded', new Date(data.createdAt).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric',hour:'2-digit',minute:'2-digit'})],
      ['Favourite', data.favorite ? 'Yes' : 'No'],
    ];
    if (data.metadataJson?.exif) {
      const ex = data.metadataJson.exif;
      if (ex.camera)   rows.push(['Camera', escHtml(ex.camera)]);
      if (ex.lens)     rows.push(['Lens', escHtml(ex.lens)]);
      if (ex.iso)      rows.push(['ISO', ex.iso]);
      if (ex.exposure) rows.push(['Exposure', ex.exposure]);
      if (ex.gps?.latitude) rows.push(['GPS', `${ex.gps.latitude.toFixed(5)}, ${ex.gps.longitude.toFixed(5)}`]);
    }
    document.getElementById('info-content').innerHTML = rows.map(([k,v]) =>
      `<div class="info-row"><span class="info-key">${k}</span><span class="info-val">${v}</span></div>`
    ).join('');
    document.getElementById('info-copy').onclick = () => copyLink(f);
    document.getElementById('info-dl').onclick   = () => downloadFile(f);
    document.getElementById('info-qr').onclick   = () => { panel.hidden = true; openQRModal(f); };
  } catch {
    document.getElementById('info-loading').hidden = true;
    document.getElementById('info-content').innerHTML = '<p style="color:var(--fail);padding:.5rem">Failed to load details.</p>';
  }
}
document.getElementById('info-panel-close').addEventListener('click', () => {
  document.getElementById('info-panel').hidden = true;
});
document.getElementById('info-panel').addEventListener('click', e => {
  if (e.target === document.getElementById('info-panel')) document.getElementById('info-panel').hidden = true;
});

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
