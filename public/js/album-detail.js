/* album-detail.js — dynamic, DB-backed album page (/albums/:id) */

const albumId = location.pathname.split('/').filter(Boolean).pop();

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
let lbCurrentFile = null;
document.getElementById('lb-close').addEventListener('click', closeLb);
lightbox.addEventListener('click', e => { if (e.target === lightbox) closeLb(); });
function openLb(f) {
  lbCurrentFile = f;
  lbImg.src = f.imgbbUrl || f.viewerUrl;
  lbImg.alt = f.filename;
  const d = f.width && f.height ? ` · ${f.width}×${f.height}` : '';
  lbMeta.textContent = `${f.filename} · ${fmtSize(f.size)}${d}`;

  document.getElementById('lb-copy').onclick     = () => copyLink(f);
  document.getElementById('lb-download').onclick = () => downloadFile(f);
  document.getElementById('lb-fav').onclick      = () => toggleFav(f);
  document.getElementById('lb-qr').onclick       = () => openQRModal(f);
  document.getElementById('lb-info').onclick     = () => openInfoPanel(f);

  lightbox.hidden = false;
  document.body.style.overflow = 'hidden';
}
function closeLb() {
  lightbox.hidden = true; lbImg.src = ''; document.body.style.overflow = ''; lbCurrentFile = null;
}

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
  const qrModal   = document.getElementById('qr-modal');
  const wrap      = document.getElementById('qr-canvas-wrap');
  const link      = document.getElementById('qr-link');
  const publicUrl = f.viewerUrl || f.imgbbUrl;

  wrap.innerHTML = '';
  link.style.display = 'none';
  document.getElementById('qr-filename').textContent = f.filename;
  qrModal.hidden = false;

  if (!publicUrl) {
    wrap.innerHTML = '<span style="color:#888;font-size:.8rem">No public URL</span>';
    showToast('This file has no public URL for a QR code', 'fail');
    return;
  }

  try {
    new QRCode(wrap, {
      text: publicUrl, width: 196, height: 196,
      colorDark: '#0B0E14', colorLight: '#EDEAE3',
      correctLevel: QRCode.CorrectLevel.M,
    });
    setTimeout(() => {
      const canvas = wrap.querySelector('canvas');
      if (canvas) {
        link.href = canvas.toDataURL('image/png');
        link.download = `qr-${f.filename}.png`;
        link.style.display = '';
      }
    }, 100);
  } catch {
    wrap.innerHTML = '<span style="color:#888;font-size:.8rem">QR generation failed</span>';
    showToast('QR generation failed', 'fail');
  }
}
document.getElementById('qr-modal-close').addEventListener('click', () => {
  document.getElementById('qr-modal').hidden = true;
});
document.getElementById('qr-modal').addEventListener('click', e => {
  if (e.target === document.getElementById('qr-modal')) document.getElementById('qr-modal').hidden = true;
});

// ── Info / EXIF panel ─────────────────────────────────────
function openInfoPanel(f) {
  const panel     = document.getElementById('info-panel');
  const loadingEl = document.getElementById('info-loading');
  const contentEl = document.getElementById('info-content');

  loadingEl.hidden = false;
  contentEl.innerHTML = '';
  panel.hidden = false;

  const rows = [
    ['Filename',   escHtml(f.filename   || f.originalFilename || '—')],
    ['Type',       escHtml(f.mimeType   || '—')],
    ['Size',       fmtSize(f.size)],
    ['Dimensions', f.width && f.height ? `${f.width} × ${f.height} px` : '—'],
    ['Uploaded',   f.createdAt ? fmtDate(f.createdAt) : '—'],
    ['Favourite',  f.favorite ? '♥ Yes' : 'No'],
  ];
  if (f.metadataJson?.exif) {
    const ex = f.metadataJson.exif;
    if (ex.camera)          rows.push(['Camera',   escHtml(String(ex.camera))]);
    if (ex.lens)            rows.push(['Lens',     escHtml(String(ex.lens))]);
    if (ex.iso != null)     rows.push(['ISO',      String(ex.iso)]);
    if (ex.exposure)        rows.push(['Exposure', escHtml(String(ex.exposure))]);
    if (ex.gps?.latitude != null)
      rows.push(['GPS', `${Number(ex.gps.latitude).toFixed(5)}, ${Number(ex.gps.longitude).toFixed(5)}`]);
  }
  contentEl.innerHTML = rows.map(([k, v]) =>
    `<div class="info-row"><span class="info-key">${k}</span><span class="info-val">${v}</span></div>`
  ).join('');
  loadingEl.hidden = true;

  document.getElementById('info-copy').onclick = () => copyLink(f);
  document.getElementById('info-dl').onclick   = () => downloadFile(f);
  document.getElementById('info-qr').onclick   = () => { panel.hidden = true; openQRModal(f); };
}
document.getElementById('info-panel-close').addEventListener('click', () => {
  document.getElementById('info-panel').hidden = true;
});
document.getElementById('info-panel').addEventListener('click', e => {
  if (e.target === document.getElementById('info-panel')) document.getElementById('info-panel').hidden = true;
});

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

// ── State ─────────────────────────────────────────────────
let album = null;

const detailHeader = document.getElementById('detail-header');
const galleryEl  = document.getElementById('gallery');
const emptyEl    = document.getElementById('empty');
const btnPin     = document.getElementById('btn-pin');
const btnFav     = document.getElementById('btn-fav');

// Modal
const modal     = document.getElementById('modal');
const editName  = document.getElementById('edit-name');
const editDesc  = document.getElementById('edit-desc');
const btnSave   = document.getElementById('btn-save');

// ── Load ──────────────────────────────────────────────────
async function loadAlbum() {
  const res = await fetch(`/api/albums/${albumId}`);
  if (res.status === 404) {
    document.querySelector('main').innerHTML = '<p style="color:rgba(237,234,227,.4)">Album not found. <a href="/albums.html">Back to albums</a></p>';
    return;
  }
  album = await res.json();
  renderHeader();
  renderFiles();
}

function renderHeader() {
  detailHeader.hidden = false;
  document.getElementById('album-name').textContent = album.name;
  const descEl = document.getElementById('album-desc');
  if (album.description) { descEl.hidden = false; descEl.textContent = album.description; }
  else descEl.hidden = true;
  document.getElementById('album-count').textContent =
    `${album.files.length} file${album.files.length !== 1 ? 's' : ''}`;
  document.getElementById('album-date').textContent = `Created ${fmtDate(album.createdAt)}`;

  btnPin.classList.toggle('active-pin', !!album.pinned);
  btnPin.title = album.pinned ? 'Unpin' : 'Pin';
  btnFav.classList.toggle('active-fav', !!album.favorite);
  btnFav.querySelector('i').className = `fa-${album.favorite ? 'solid' : 'regular'} fa-heart`;
  btnFav.title = album.favorite ? 'Unfavourite' : 'Favourite';

  document.title = `Seik — ${album.name}`;
}

function renderFiles() {
  galleryEl.innerHTML = '';
  if (!album.files.length) { emptyEl.hidden = false; return; }
  emptyEl.hidden = true;

  album.files.forEach(f => galleryEl.appendChild(buildFileCard(f)));
}

function buildFileCard(f) {
  const card = document.createElement('div');
  card.className = 'g-card'; card.title = f.filename;
  const isImg = f.mimeType?.startsWith('image/');
  const thumb = f.thumbUrl || f.imgbbUrl;
  if (isImg && thumb) {
    const img = document.createElement('img');
    img.className = 'g-thumb'; img.src = thumb; img.alt = f.filename; img.loading = 'lazy';
    img.onerror = () => img.replaceWith(iconThumb(f.mimeType));
    card.appendChild(img);
  } else { card.appendChild(iconThumb(f.mimeType)); }

  const remove = document.createElement('button');
  remove.className = 'g-remove'; remove.title = 'Remove from album';
  remove.innerHTML = '<i class="fa-solid fa-xmark"></i>';
  remove.addEventListener('click', e => { e.stopPropagation(); removeFromAlbum(f); });
  card.appendChild(remove);

  const info = document.createElement('div'); info.className = 'g-info';
  const favoriteIcon = f.favorite ? '<i class="fa-solid fa-heart" style="color:#f87171;font-size:.6rem;margin-left:.25rem"></i>' : '';
  info.innerHTML = `<div class="g-name">${escHtml(f.filename)}${favoriteIcon}</div><div class="g-size">${fmtSize(f.size)}</div>`;
  card.appendChild(info);

  if (isImg) card.addEventListener('click', () => openLb(f));
  else if (f.viewerUrl || f.imgbbUrl) card.addEventListener('click', () => window.open(f.viewerUrl || f.imgbbUrl, '_blank'));

  return card;
}

async function removeFromAlbum(f) {
  if (!confirm(`Remove "${f.filename}" from this album?\nThe file itself will not be deleted.`)) return;
  try {
    const res = await fetch(`/api/files/${f.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ albumId: null }),
    });
    if (!res.ok) { showToast('Failed to remove file', 'fail'); return; }
    showToast('Removed from album');
    await loadAlbum();
  } catch {
    showToast('Network error', 'fail');
  }
}

// ── Album actions ─────────────────────────────────────────
async function toggleField(field, value) {
  try {
    const res = await fetch(`/api/albums/${albumId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    });
    if (!res.ok) { showToast('Update failed', 'fail'); return; }
    await loadAlbum();
  } catch {
    showToast('Network error', 'fail');
  }
}

async function deleteAlbum() {
  if (!confirm(`Delete album "${album.name}"?\nFiles inside will not be deleted.`)) return;
  try {
    const res = await fetch(`/api/albums/${albumId}`, { method: 'DELETE' });
    if (!res.ok) { showToast('Delete failed', 'fail'); return; }
    location.href = '/albums.html';
  } catch {
    showToast('Network error', 'fail');
  }
}

function openEdit() {
  editName.value = album.name;
  editDesc.value = album.description || '';
  modal.hidden = false;
  editName.focus();
}
function closeModal() { modal.hidden = true; }

btnSave.addEventListener('click', async () => {
  const name = editName.value.trim();
  const desc = editDesc.value.trim();
  if (!name) { editName.focus(); return; }
  btnSave.disabled = true;
  try {
    const res = await fetch(`/api/albums/${albumId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description: desc || null }),
    });
    if (!res.ok) { const d = await res.json(); showToast(d.error || 'Save failed', 'fail'); return; }
    closeModal();
    showToast('Album updated');
    await loadAlbum();
  } finally {
    btnSave.disabled = false;
  }
});

document.getElementById('btn-rename').addEventListener('click', openEdit);
document.getElementById('btn-pin').addEventListener('click', () => toggleField('pinned', !album.pinned));
document.getElementById('btn-fav').addEventListener('click', () => toggleField('favorite', !album.favorite));
document.getElementById('btn-delete').addEventListener('click', deleteAlbum);
document.getElementById('btn-cancel').addEventListener('click', closeModal);
document.getElementById('btn-modal-close').addEventListener('click', closeModal);
modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { if (!modal.hidden) closeModal(); else if (!lightbox.hidden) closeLb(); }
});

// ── Init ──────────────────────────────────────────────────
checkHealth();
loadAlbum();
