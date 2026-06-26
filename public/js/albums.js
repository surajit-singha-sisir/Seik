/* =========================================================
   albums.js — Full CRUD: create · rename · pin · favourite · delete
   All changes immediately persisted to DB via the REST API.
   ========================================================= */

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

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { month:'short', day:'numeric', year:'numeric' });
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

// ── State ─────────────────────────────────────────────────
let allAlbums = [];
let editingId = null;   // null = create mode, string = edit mode

const grid      = document.getElementById('albums-grid');
const emptyEl   = document.getElementById('albums-empty');
const modal     = document.getElementById('modal');
const modalTitle= document.getElementById('modal-title');
const nameInput = document.getElementById('album-name');
const descInput = document.getElementById('album-desc');
const btnSave   = document.getElementById('btn-save');
const searchInput = document.getElementById('albums-search');
const filterHint  = document.getElementById('filter-hint');

// ── Load & render ─────────────────────────────────────────
async function loadAlbums() {
  grid.innerHTML = `<div class="skeleton" style="height:140px;border-radius:14px"></div>
    <div class="skeleton" style="height:140px;border-radius:14px"></div>
    <div class="skeleton" style="height:140px;border-radius:14px"></div>`;

  const res  = await fetch('/api/albums');
  const data = await res.json();
  allAlbums = data.albums || [];
  renderAlbums(searchInput.value.trim().toLowerCase());
}

function renderAlbums(filter = '') {
  const filtered = filter
    ? allAlbums.filter(a => a.name.toLowerCase().includes(filter) || (a.description||'').toLowerCase().includes(filter))
    : allAlbums;

  const total = allAlbums.length;
  document.getElementById('total-label').textContent =
    `${total} album${total !== 1 ? 's' : ''}` + (filter ? ` · showing ${filtered.length}` : '');
  filterHint.textContent = filter && filtered.length === 0 ? 'No matches' : '';

  grid.innerHTML = '';

  if (!filtered.length && !filter) { emptyEl.hidden = false; return; }
  emptyEl.hidden = true;

  // Pinned first, then rest
  const pinned  = filtered.filter(a => a.pinned);
  const rest    = filtered.filter(a => !a.pinned);

  if (pinned.length && rest.length) {
    appendSectionLabel('Pinned');
  }
  pinned.forEach(a => grid.appendChild(buildCard(a)));

  if (pinned.length && rest.length) {
    appendSectionLabel('All albums');
  }
  rest.forEach(a => grid.appendChild(buildCard(a)));
}

function appendSectionLabel(text) {
  const lbl = document.createElement('div');
  lbl.className = 'pinned-section-label';
  lbl.style.gridColumn = '1 / -1';
  lbl.textContent = text;
  grid.appendChild(lbl);
}

function buildCard(a) {
  const card = document.createElement('div');
  card.className = 'album-card' + (a.pinned ? ' pinned' : '');
  card.dataset.id = a.id;

  card.innerHTML = `
    <div class="album-cover">
      <i class="fa-solid fa-folder-open album-cover-icon"></i>
      <div class="album-badges">
        ${a.pinned   ? '<span class="album-badge badge-pin" title="Pinned"><i class="fa-solid fa-thumbtack"></i></span>' : ''}
        ${a.favorite ? '<span class="album-badge badge-fav" title="Favourite"><i class="fa-solid fa-heart"></i></span>' : ''}
      </div>
    </div>
    <div class="album-body">
      <div class="album-name" title="${escHtml(a.name)}">${escHtml(a.name)}</div>
      ${a.description ? `<div class="album-desc" title="${escHtml(a.description)}">${escHtml(a.description)}</div>` : ''}
      <div class="album-meta">
        <span><i class="fa-solid fa-image" style="margin-right:.3rem;opacity:.5"></i>${a.fileCount} file${a.fileCount !== 1 ? 's' : ''}</span>
        <span>${fmtDate(a.createdAt)}</span>
      </div>
    </div>
    <div class="album-actions">
      <button class="icon-btn edit-btn" title="Rename album" data-action="edit">
        <i class="fa-solid fa-pen"></i>
      </button>
      <button class="icon-btn pin-btn ${a.pinned ? 'active-pin' : ''}" title="${a.pinned ? 'Unpin' : 'Pin album'}" data-action="pin">
        <i class="fa-solid fa-thumbtack"></i>
      </button>
      <button class="icon-btn fav-btn ${a.favorite ? 'active-fav' : ''}" title="${a.favorite ? 'Unfavourite' : 'Add to favourites'}" data-action="fav">
        <i class="fa-${a.favorite ? 'solid' : 'regular'} fa-heart"></i>
      </button>
      <button class="icon-btn del-btn" title="Delete album" data-action="delete" style="margin-left:auto">
        <i class="fa-solid fa-trash"></i>
      </button>
    </div>
  `;

  // Action delegation
  card.querySelector('[data-action="edit"]').addEventListener('click', () => openEdit(a));
  card.querySelector('[data-action="pin"]').addEventListener('click', () => toggleField(a.id, 'pinned', !a.pinned));
  card.querySelector('[data-action="fav"]').addEventListener('click', () => toggleField(a.id, 'favorite', !a.favorite));
  card.querySelector('[data-action="delete"]').addEventListener('click', () => deleteAlbum(a));

  return card;
}

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Toggle pin / favourite ────────────────────────────────
async function toggleField(id, field, value) {
  try {
    const res = await fetch(`/api/albums/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    });
    if (!res.ok) { showToast('Update failed', 'fail'); return; }
    await loadAlbums();
  } catch {
    showToast('Network error', 'fail');
  }
}

// ── Delete ────────────────────────────────────────────────
async function deleteAlbum(a) {
  if (!confirm(`Delete album "${a.name}"?\nFiles inside will not be deleted.`)) return;
  try {
    const res = await fetch(`/api/albums/${a.id}`, { method: 'DELETE' });
    if (!res.ok) { showToast('Delete failed', 'fail'); return; }
    showToast(`Album "${a.name}" deleted`);
    await loadAlbums();
  } catch {
    showToast('Network error', 'fail');
  }
}

// ── Modal: create ─────────────────────────────────────────
function openCreate() {
  editingId = null;
  modalTitle.textContent = 'New album';
  btnSave.textContent = 'Create';
  nameInput.value = '';
  descInput.value = '';
  modal.hidden = false;
  nameInput.focus();
}

// ── Modal: edit (rename + description) ───────────────────
function openEdit(a) {
  editingId = a.id;
  modalTitle.textContent = 'Edit album';
  btnSave.textContent = 'Save';
  nameInput.value = a.name;
  descInput.value = a.description || '';
  modal.hidden = false;
  nameInput.focus();
}

function closeModal() {
  modal.hidden = true;
  editingId = null;
}

// ── Save (create or patch) ────────────────────────────────
btnSave.addEventListener('click', async () => {
  const name = nameInput.value.trim();
  const desc = descInput.value.trim();
  if (!name) { nameInput.focus(); return; }

  btnSave.disabled = true;
  try {
    let res;
    if (editingId) {
      res = await fetch(`/api/albums/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description: desc || undefined }),
      });
    } else {
      res = await fetch('/api/albums', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description: desc || undefined }),
      });
    }
    if (!res.ok) {
      const d = await res.json();
      showToast(d.error || 'Save failed', 'fail');
      return;
    }
    closeModal();
    showToast(editingId ? `Album renamed to "${name}"` : `Album "${name}" created`);
    await loadAlbums();
  } finally {
    btnSave.disabled = false;
  }
});

// ── Wire UI ───────────────────────────────────────────────
document.getElementById('btn-new-album').addEventListener('click', openCreate);
document.getElementById('empty-cta').addEventListener('click', e => { e.preventDefault(); openCreate(); });
document.getElementById('btn-cancel').addEventListener('click', closeModal);
document.getElementById('btn-modal-close').addEventListener('click', closeModal);
modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') btnSave.click(); });

searchInput.addEventListener('input', () => {
  renderAlbums(searchInput.value.trim().toLowerCase());
});

// ── Init ──────────────────────────────────────────────────
checkHealth();
loadAlbums();
