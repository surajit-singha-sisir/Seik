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

// ── Favorite toggle ───────────────────────────────────────
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
    // Refresh gallery card in background
    const card = document.querySelector(`.g-card[data-id="${f.id}"]`);
    if (card) card.classList.toggle('g-fav', newVal);
  } catch { showToast('Network error', 'fail'); }
}

// ── QR modal ──────────────────────────────────────────────
function openQRModal(f) {
  const modal = document.getElementById('qr-modal');
  const img = document.getElementById('qr-img');
  const link = document.getElementById('qr-link');
  img.src = `/api/qr/${f.id}?format=svg`;
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
async function openInfoPanel(f) {
  const panel = document.getElementById('info-panel');
  document.getElementById('info-loading').hidden = false;
  document.getElementById('info-content').innerHTML = '';
  panel.hidden = false;

  try {
    const res = await fetch(`/api/files/${f.id}`);
    const data = await res.json();
    document.getElementById('info-loading').hidden = true;

    const rows = [
      ['Filename', escHtml(data.filename)],
      ['Type', data.mimeType],
      ['Size', fmtSize(data.size)],
      ['Dimensions', data.width && data.height ? `${data.width} × ${data.height} px` : '—'],
      ['Album', data.album ? `<a href="/albums/${data.album.id}">${escHtml(data.album.name)}</a>` : '—'],
      ['Tags', data.tags?.length ? data.tags.map(t => `<a href="/tags/${t.id}" class="info-tag">#${escHtml(t.name)}</a>`).join(' ') : '—'],
      ['Uploaded', dayjs(data.createdAt).format('MMM D, YYYY h:mm A')],
      ['Favourite', data.favorite ? 'Yes' : 'No'],
    ];

    if (data.metadataJson?.exif) {
      const e = data.metadataJson.exif;
      if (e.camera) rows.push(['Camera', escHtml(e.camera)]);
      if (e.lens) rows.push(['Lens', escHtml(e.lens)]);
      if (e.iso) rows.push(['ISO', e.iso]);
      if (e.exposure) rows.push(['Exposure', e.exposure]);
      if (e.gps?.latitude) rows.push(['GPS', `${e.gps.latitude.toFixed(5)}, ${e.gps.longitude.toFixed(5)}`]);
    }

    document.getElementById('info-content').innerHTML = rows.map(([k, v]) =>
      `<div class="info-row"><span class="info-key">${k}</span><span class="info-val">${v}</span></div>`
    ).join('');

    // Copy & download buttons in panel
    document.getElementById('info-copy').onclick = () => copyLink(f);
    document.getElementById('info-dl').onclick = () => downloadFile(f);
    document.getElementById('info-qr').onclick = () => { panel.hidden = true; openQRModal(f); };
  } catch {
    document.getElementById('info-loading').hidden = true;
    document.getElementById('info-content').innerHTML = '<p style="color:var(--fail);padding:.5rem">Failed to load details.</p>';
  }
}
document.getElementById('info-panel-close').addEventListener('click', () => {
  document.getElementById('info-panel').hidden = true;
});
// ── Icon thumb ────────────────────────────────────────────
function iconThumb(mime) {
  const d = document.createElement('div'); d.className = 'g-thumb-icon';
  let ic = 'fa-file';
  if (mime?.includes('pdf')) ic = 'fa-file-pdf';
  if (mime?.startsWith('image/')) ic = 'fa-file-image';
  d.innerHTML = `<i class="fa-solid ${ic}"></i>`; return d;
}

// ── Load gallery ──────────────────────────────────────────
async function loadGallery(resetPage = true) {
  if (resetPage) { page = 1; }
  renderSkeletons();

  const params = new URLSearchParams({ page, limit: LIMIT });
  if (activeMime) params.set('mime', activeMime);
  if (searchQ)    params.set('q', searchQ);
  if (filterFav)  params.set('favorite', '1');

  const res = await fetch(`/api/gallery?${params}`);
  const data = await res.json();

  const files = data.files || [];
  const total = Number(data.total) || 0;
  totalPages = Math.ceil(total / LIMIT) || 1;

  document.getElementById('gallery-count').textContent =
    `${total} file${total !== 1 ? 's' : ''}` + (totalPages > 1 ? ` · page ${page}/${totalPages}` : '');

  const g = document.getElementById('gallery');
  g.innerHTML = '';

  if (!files.length) {
    document.getElementById('gallery-empty').hidden = false;
    document.getElementById('pagination').hidden = true;
    return;
  }
  document.getElementById('gallery-empty').hidden = true;

  files.forEach(f => g.appendChild(buildCard(f)));
  renderPagination();
  updateBulkBar();
}

function buildCard(f) {
  const card = document.createElement('div');
  card.className = 'g-card' + (f.favorite ? ' g-fav' : '') + (selected.has(f.id) ? ' g-selected' : '');
  card.dataset.id = f.id;

  const isImg = f.mimeType?.startsWith('image/');
  const thumb = f.thumbUrl || f.imgbbUrl;
  if (isImg && thumb) {
    const img = document.createElement('img');
    img.className = 'g-thumb'; img.src = thumb; img.alt = f.filename; img.loading = 'lazy';
    img.onerror = () => img.replaceWith(iconThumb(f.mimeType));
    card.appendChild(img);
  } else {
    card.appendChild(iconThumb(f.mimeType));
  }

  // Select checkbox (shown in select mode)
  const cb = document.createElement('div');
  cb.className = 'g-select-check';
  cb.innerHTML = '<i class="fa-solid fa-check"></i>';
  card.appendChild(cb);

  // Fav indicator
  if (f.favorite) {
    const fv = document.createElement('div');
    fv.className = 'g-fav-badge'; fv.innerHTML = '<i class="fa-solid fa-heart"></i>';
    card.appendChild(fv);
  }

  const info = document.createElement('div'); info.className = 'g-info';
  info.innerHTML = `<div class="g-name" title="${escHtml(f.filename)}">${escHtml(f.filename)}</div>
    <div class="g-size">${fmtSize(f.size)} · ${fmtDate(f.createdAt)}</div>`;
  card.appendChild(info);

  card.addEventListener('click', (e) => {
    if (selectMode) {
      e.stopPropagation();
      if (selected.has(f.id)) { selected.delete(f.id); card.classList.remove('g-selected'); }
      else { selected.add(f.id); card.classList.add('g-selected'); }
      updateBulkBar();
      return;
    }
    if (isImg) openLb(f);
    else if (f.viewerUrl || f.imgbbUrl) window.open(f.viewerUrl || f.imgbbUrl, '_blank');
  });

  return card;
}
// ── Pagination ────────────────────────────────────────────
function renderPagination() {
  const el = document.getElementById('pagination');
  if (totalPages <= 1) { el.hidden = true; return; }
  el.hidden = false;
  document.getElementById('page-prev').disabled = page <= 1;
  document.getElementById('page-next').disabled = page >= totalPages;
  document.getElementById('page-info').textContent = `${page} / ${totalPages}`;
}
document.getElementById('page-prev').addEventListener('click', () => { if (page > 1) { page--; loadGallery(false); } });
document.getElementById('page-next').addEventListener('click', () => { if (page < totalPages) { page++; loadGallery(false); } });

// ── Filter bar ────────────────────────────────────────────
document.querySelectorAll('[data-mime]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-mime]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeMime = btn.dataset.mime;
    loadGallery();
  });
});

document.getElementById('filter-fav').addEventListener('click', function() {
  filterFav = !filterFav;
  this.classList.toggle('active', filterFav);
  loadGallery();
});

// ── Search ────────────────────────────────────────────────
let searchTimer;
document.getElementById('gallery-search').addEventListener('input', function() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { searchQ = this.value.trim(); loadGallery(); }, 320);
});

// ── Bulk select mode ──────────────────────────────────────
function updateBulkBar() {
  const bar = document.getElementById('bulk-bar');
  const count = selected.size;
  document.getElementById('bulk-count').textContent =
    `${count} file${count !== 1 ? 's' : ''} selected`;
  bar.hidden = !selectMode;
  document.getElementById('btn-select').classList.toggle('active-pin', selectMode);
}

document.getElementById('btn-select').addEventListener('click', () => {
  selectMode = !selectMode;
  selected.clear();
  document.querySelectorAll('.g-card').forEach(c => c.classList.remove('g-selected'));
  document.getElementById('gallery').classList.toggle('select-mode', selectMode);
  updateBulkBar();
});

document.getElementById('bulk-cancel').addEventListener('click', () => {
  selectMode = false; selected.clear();
  document.querySelectorAll('.g-card').forEach(c => c.classList.remove('g-selected'));
  document.getElementById('gallery').classList.remove('select-mode');
  updateBulkBar();
});

document.getElementById('bulk-delete').addEventListener('click', async () => {
  if (!selected.size) return;
  if (!confirm(`Delete ${selected.size} file${selected.size !== 1 ? 's' : ''}? This cannot be undone.`)) return;
  let ok = 0, fail = 0;
  for (const id of selected) {
    const res = await fetch(`/api/files/${id}`, { method: 'DELETE' });
    if (res.ok) ok++; else fail++;
  }
  showToast(`Deleted ${ok} file${ok !== 1 ? 's' : ''}` + (fail ? `, ${fail} failed` : ''), fail ? 'warn' : '');
  selectMode = false; selected.clear();
  document.getElementById('gallery').classList.remove('select-mode');
  loadGallery();
});

document.getElementById('bulk-fav').addEventListener('click', async () => {
  if (!selected.size) return;
  for (const id of selected) {
    await fetch(`/api/files/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ favorite: true }),
    });
  }
  showToast(`Favourited ${selected.size} file${selected.size !== 1 ? 's' : ''}`);
  selectMode = false; selected.clear();
  document.getElementById('gallery').classList.remove('select-mode');
  loadGallery();
});

// Album picker for bulk move
document.getElementById('bulk-move').addEventListener('click', async () => {
  if (!selected.size) return;
  const res = await fetch('/api/albums');
  const data = await res.json();
  const albumList = data.albums || [];
  if (!albumList.length) { showToast('No albums yet — create one first', 'warn'); return; }

  const modal = document.getElementById('album-pick-modal');
  const list = document.getElementById('album-pick-list');
  list.innerHTML = albumList.map(a =>
    `<button class="album-pick-btn" data-id="${a.id}">${escHtml(a.name)} (${a.fileCount})</button>`
  ).join('');
  list.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', async () => {
      modal.hidden = true;
      const albumId = btn.dataset.id;
      for (const id of selected) {
        await fetch(`/api/files/${id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ albumId }),
        });
      }
      showToast(`Moved ${selected.size} file${selected.size !== 1 ? 's' : ''} to album`);
      selectMode = false; selected.clear();
      document.getElementById('gallery').classList.remove('select-mode');
      loadGallery();
    });
  });
  modal.hidden = false;
});
document.getElementById('album-pick-close').addEventListener('click', () => {
  document.getElementById('album-pick-modal').hidden = true;
});

// ── Init ──────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (!document.getElementById('lightbox').hidden) closeLb();
    else if (!document.getElementById('qr-modal').hidden) document.getElementById('qr-modal').hidden = true;
    else if (!document.getElementById('info-panel').hidden) document.getElementById('info-panel').hidden = true;
    else if (!document.getElementById('album-pick-modal').hidden) document.getElementById('album-pick-modal').hidden = true;
  }
});
checkHealth();
loadGallery();
