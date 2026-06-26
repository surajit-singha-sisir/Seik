/* =========================================================
   tags.js — Full CRUD: create · rename (inline) · delete
   Sortable by usage / name / date. Searchable. DB-connected.
   ========================================================= */

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

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { month:'short', day:'numeric', year:'numeric' });
}

// ── State ─────────────────────────────────────────────────
let allTags = [];
const tagsGrid   = document.getElementById('tags-grid');
const emptyEl    = document.getElementById('tags-empty');
const searchEl   = document.getElementById('tags-search');
const sortSelect = document.getElementById('sort-select');

// Modal (create)
const modal       = document.getElementById('modal');
const modalTitle  = document.getElementById('modal-title');
const tagNameInput= document.getElementById('tag-name');
const btnSave     = document.getElementById('btn-save');

// ── Load ──────────────────────────────────────────────────
async function loadTags() {
  const res  = await fetch('/api/tags');
  const data = await res.json();
  allTags = data.tags || [];
  renderTags();
}

function getSortedFiltered() {
  const q = searchEl.value.trim().toLowerCase();
  let list = q
    ? allTags.filter(t => t.name.toLowerCase().includes(q) || t.slug.includes(q))
    : [...allTags];

  const sort = sortSelect.value;
  if (sort === 'name') list.sort((a,b) => a.name.localeCompare(b.name));
  else if (sort === 'date') list.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  // default = usage (already sorted by server)
  return list;
}

function renderTags() {
  const list  = getSortedFiltered();
  const total = allTags.length;
  const q     = searchEl.value.trim();

  document.getElementById('total-label').textContent =
    `${total} tag${total !== 1 ? 's' : ''}` + (q ? ` · ${list.length} match${list.length !== 1 ? 'es' : ''}` : '');

  tagsGrid.innerHTML = '';

  if (!list.length && !q) { emptyEl.hidden = false; return; }
  emptyEl.hidden = true;

  if (!list.length) {
    tagsGrid.innerHTML = `<p style="color:rgba(237,234,227,.3);font-size:.85rem">No tags match "<em>${q}</em>".</p>`;
    return;
  }

  list.forEach(t => tagsGrid.appendChild(buildCard(t)));
}

function buildCard(t) {
  const card = document.createElement('div');
  card.className = 'tag-card';
  card.dataset.id = t.id;

  card.innerHTML = `
    <div class="tag-card-header">
      <i class="fa-solid fa-tag tag-icon"></i>
      <span class="tag-card-name" title="${escHtml(t.name)}">${escHtml(t.name)}</span>
    </div>
    <span class="tag-slug">#${escHtml(t.slug)}</span>
    <div class="tag-meta">
      <span class="tag-count-badge">
        <i class="fa-solid fa-image" style="font-size:.6rem;opacity:.6"></i>
        ${t.fileCount} file${t.fileCount !== 1 ? 's' : ''}
      </span>
      <span>${fmtDate(t.createdAt)}</span>
    </div>
    <div class="tag-actions">
      <button class="tag-btn edit-btn"><i class="fa-solid fa-pen"></i> Rename</button>
      <button class="tag-btn del"><i class="fa-solid fa-trash"></i> Delete</button>
    </div>
  `;

  card.querySelector('.edit-btn').addEventListener('click', () => startInlineEdit(t, card));
  card.querySelector('.del').addEventListener('click', () => deleteTag(t));

  return card;
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Inline rename ─────────────────────────────────────────
function startInlineEdit(t, card) {
  const nameEl = card.querySelector('.tag-card-name');
  const actEl  = card.querySelector('.tag-actions');

  // Replace name span with input
  const input = document.createElement('input');
  input.className = 'tag-edit-input';
  input.value = t.name;
  input.maxLength = 40;
  nameEl.replaceWith(input);
  input.focus();
  input.select();

  // Replace actions
  actEl.innerHTML = `
    <button class="tag-btn save"><i class="fa-solid fa-check"></i> Save</button>
    <button class="tag-btn cancel"><i class="fa-solid fa-xmark"></i> Cancel</button>
  `;

  actEl.querySelector('.save').addEventListener('click', () => commitRename(t, input.value.trim()));
  actEl.querySelector('.cancel').addEventListener('click', () => {
    // Restore original card
    card.replaceWith(buildCard(t));
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter')  commitRename(t, input.value.trim());
    if (e.key === 'Escape') card.replaceWith(buildCard(t));
  });
}

async function commitRename(t, newName) {
  if (!newName || newName === t.name) { renderTags(); return; }
  try {
    const res = await fetch(`/api/tags/${t.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName }),
    });
    const data = await res.json();
    if (res.status === 409) { showToast('That tag name already exists', 'warn'); return; }
    if (!res.ok) { showToast(data.error || 'Rename failed', 'fail'); return; }
    showToast(`Renamed to "${data.name}"`);
    await loadTags();
  } catch {
    showToast('Network error', 'fail');
  }
}

// ── Delete ────────────────────────────────────────────────
async function deleteTag(t) {
  const msg = t.fileCount > 0
    ? `Delete tag "${t.name}"?\nThis will remove it from ${t.fileCount} file${t.fileCount !== 1 ? 's' : ''}.`
    : `Delete tag "${t.name}"?`;
  if (!confirm(msg)) return;
  try {
    const res = await fetch(`/api/tags/${t.id}`, { method: 'DELETE' });
    if (!res.ok) { showToast('Delete failed', 'fail'); return; }
    showToast(`Tag "${t.name}" deleted`);
    await loadTags();
  } catch {
    showToast('Network error', 'fail');
  }
}

// ── Create (via modal) ────────────────────────────────────
function openCreate() {
  modalTitle.textContent = 'New tag';
  btnSave.textContent = 'Create';
  tagNameInput.value = '';
  modal.hidden = false;
  tagNameInput.focus();
}

function closeModal() {
  modal.hidden = true;
}

btnSave.addEventListener('click', async () => {
  const name = tagNameInput.value.trim();
  if (!name) { tagNameInput.focus(); return; }

  btnSave.disabled = true;
  try {
    const res = await fetch('/api/tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    if (res.status === 409) { showToast('Tag already exists', 'warn'); return; }
    if (!res.ok) { showToast(data.error || 'Failed', 'fail'); return; }
    closeModal();
    showToast(`Tag "${data.name}" created`);
    await loadTags();
  } catch {
    showToast('Network error', 'fail');
  } finally {
    btnSave.disabled = false;
  }
});

document.getElementById('btn-new-tag').addEventListener('click', openCreate);
document.getElementById('empty-cta').addEventListener('click', e => { e.preventDefault(); openCreate(); });
document.getElementById('btn-cancel').addEventListener('click', closeModal);
document.getElementById('btn-modal-close').addEventListener('click', closeModal);
modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.hidden) closeModal(); });
tagNameInput.addEventListener('keydown', e => { if (e.key === 'Enter') btnSave.click(); });

searchEl.addEventListener('input', renderTags);
sortSelect.addEventListener('change', renderTags);

// ── Init ──────────────────────────────────────────────────
checkHealth();
loadTags();
