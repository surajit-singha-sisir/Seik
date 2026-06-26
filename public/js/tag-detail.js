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

// ── State ─────────────────────────────────────────────────
let tag = null;

const detailHeader = document.getElementById('detail-header');
const galleryEl  = document.getElementById('gallery');
const emptyEl    = document.getElementById('empty');

// Modal
const modal     = document.getElementById('modal');
const editName  = document.getElementById('edit-name');
const btnSave   = document.getElementById('btn-save');

// ── Load ──────────────────────────────────────────────────
async function loadTag() {
  const res = await fetch(`/api/tags/${tagId}`);
  if (res.status === 404) {
    document.querySelector('main').innerHTML = '<p style="color:rgba(237,234,227,.4)">Tag not found. <a href="/tags.html">Back to tags</a></p>';
    return;
  }
  tag = await res.json();
  renderHeader();
  renderFiles();
}

function renderHeader() {
  detailHeader.hidden = false;
  document.getElementById('tag-name').textContent = tag.name;
  document.getElementById('tag-slug').textContent = `#${tag.slug}`;
  document.getElementById('tag-count').textContent =
    `${tag.files.length} file${tag.files.length !== 1 ? 's' : ''}`;
  document.getElementById('tag-date').textContent = `Created ${fmtDate(tag.createdAt)}`;
  document.title = `Seik — #${tag.name}`;
}

function renderFiles() {
  galleryEl.innerHTML = '';
  if (!tag.files.length) { emptyEl.hidden = false; return; }
  emptyEl.hidden = true;

  tag.files.forEach(f => galleryEl.appendChild(buildFileCard(f)));
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
  remove.className = 'g-remove'; remove.title = 'Remove this tag from the file';
  remove.innerHTML = '<i class="fa-solid fa-xmark"></i>';
  remove.addEventListener('click', e => { e.stopPropagation(); removeTagFromFile(f); });
  card.appendChild(remove);

  const info = document.createElement('div'); info.className = 'g-info';
  const favoriteIcon = f.favorite ? '<i class="fa-solid fa-heart" style="color:#f87171;font-size:.6rem;margin-left:.25rem"></i>' : '';
  info.innerHTML = `<div class="g-name">${escHtml(f.filename)}${favoriteIcon}</div><div class="g-size">${fmtSize(f.size)}</div>`;
  card.appendChild(info);

  if (isImg) card.addEventListener('click', () => openLb(f));
  else if (f.viewerUrl || f.imgbbUrl) card.addEventListener('click', () => window.open(f.viewerUrl || f.imgbbUrl, '_blank'));

  return card;
}

async function removeTagFromFile(f) {
  if (!confirm(`Remove tag "${tag.name}" from "${f.filename}"?`)) return;
  try {
    const res = await fetch(`/api/files/${f.id}/tags/${tagId}`, { method: 'DELETE' });
    if (!res.ok) { showToast('Failed to remove tag', 'fail'); return; }
    showToast('Tag removed from file');
    await loadTag();
  } catch {
    showToast('Network error', 'fail');
  }
}

// ── Tag actions ───────────────────────────────────────────
async function deleteTag() {
  if (!confirm(`Delete tag "${tag.name}"?\nThis will remove it from ${tag.files.length} file${tag.files.length !== 1 ? 's' : ''}.`)) return;
  try {
    const res = await fetch(`/api/tags/${tagId}`, { method: 'DELETE' });
    if (!res.ok) { showToast('Delete failed', 'fail'); return; }
    location.href = '/tags.html';
  } catch {
    showToast('Network error', 'fail');
  }
}

function openEdit() {
  editName.value = tag.name;
  modal.hidden = false;
  editName.focus();
}
function closeModal() { modal.hidden = true; }

btnSave.addEventListener('click', async () => {
  const name = editName.value.trim();
  if (!name) { editName.focus(); return; }
  btnSave.disabled = true;
  try {
    const res = await fetch(`/api/tags/${tagId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    if (res.status === 409) { showToast('That tag name already exists', 'warn'); return; }
    if (!res.ok) { showToast(data.error || 'Save failed', 'fail'); return; }
    closeModal();
    showToast(`Renamed to "${data.name}"`);
    await loadTag();
  } finally {
    btnSave.disabled = false;
  }
});

document.getElementById('btn-rename').addEventListener('click', openEdit);
document.getElementById('btn-delete').addEventListener('click', deleteTag);
document.getElementById('btn-cancel').addEventListener('click', closeModal);
document.getElementById('btn-modal-close').addEventListener('click', closeModal);
modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
editName.addEventListener('keydown', e => { if (e.key === 'Enter') btnSave.click(); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { if (!modal.hidden) closeModal(); else if (!lightbox.hidden) closeLb(); }
});

// ── Init ──────────────────────────────────────────────────
checkHealth();
loadTag();
