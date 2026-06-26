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

// ── Duplicate modal refs (kept for legacy HTML; modal no longer used) ────────
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

// ── Settings: albums ──────────────────────────────────────
async function loadAlbums() {
  try {
    const data = await fetch('/api/albums?limit=200').then(r => r.json());
    const items = Array.isArray(data) ? data : (data.albums ?? []);
    items.forEach(a => {
      const opt = document.createElement('option');
      opt.value = a.id; opt.textContent = a.name;
      albumSelect.appendChild(opt);
    });
  } catch { /* non-fatal */ }
}

// ── Settings: tags ────────────────────────────────────────
async function loadTags() {
  try {
    const data = await fetch('/api/tags?limit=200').then(r => r.json());
    allTags = Array.isArray(data) ? data : (data.tags ?? []);
    renderTagPicker();
  } catch {
    tagsPicker.innerHTML = '<span class="tags-placeholder">Failed to load tags</span>';
  }
}

function renderTagPicker() {
  tagsPicker.innerHTML = '';
  if (!allTags.length) {
    tagsPicker.innerHTML = '<span class="tags-placeholder">No tags yet</span>';
    return;
  }
  allTags.forEach(tag => {
    const pill = document.createElement('button');
    pill.type = 'button';
    pill.className = 'tag-pill' + (selectedTagIds.has(tag.id) ? ' selected' : '');
    pill.dataset.id = tag.id;
    pill.textContent = tag.name;
    pill.addEventListener('click', () => {
      selectedTagIds.has(tag.id) ? selectedTagIds.delete(tag.id) : selectedTagIds.add(tag.id);
      pill.classList.toggle('selected', selectedTagIds.has(tag.id));
      updateSummary();
    });
    tagsPicker.appendChild(pill);
  });
}

async function createTag() {
  const name = newTagInput.value.trim();
  if (!name) return;
  try {
    const res = await fetch('/api/tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) throw new Error();
    const tag = await res.json();
    allTags.push(tag);
    selectedTagIds.add(tag.id);
    renderTagPicker();
    newTagInput.value = '';
    updateSummary();
    showToast(`Tag "${tag.name}" created`, 'ok');
  } catch {
    showToast('Failed to create tag', 'fail');
  }
}

// ── Settings summary ──────────────────────────────────────
function updateSummary() {
  const albumName = albumSelect.options[albumSelect.selectedIndex]?.text;
  const hasAlbum  = !!albumSelect.value;
  const hasTags   = selectedTagIds.size > 0;

  summaryAlbumRow.hidden = !hasAlbum;
  summaryAlbumName.textContent = hasAlbum ? albumName : '—';

  summaryTagsRow.hidden = !hasTags;
  if (hasTags) {
    const names = allTags.filter(t => selectedTagIds.has(t.id)).map(t => t.name);
    summaryTagsList.textContent = names.join(', ');
  }

  settingSummary.hidden = !hasAlbum && !hasTags;
}

// ── Queue rendering ───────────────────────────────────────
function renderQueueHead() {
  const total = queue.length;
  queueHead.hidden = total === 0;
  queueCount.textContent = `${total} file${total !== 1 ? 's' : ''}`;
}

function addToQueue(file, urlString) {
  const id = ++nextId;
  const node = itemTpl.content.cloneNode(true).querySelector('.q-item');
  node.dataset.id = id;

  const nameEl    = node.querySelector('.q-name');
  const origEl    = node.querySelector('.q-original');
  const compEl    = node.querySelector('.q-compressed');
  const redEl     = node.querySelector('.q-reduction');
  const arrowEl   = node.querySelector('.q-arrow');
  const progBar   = node.querySelector('.q-progress-bar');
  const dupEl     = node.querySelector('.q-duplicate');
  const errEl     = node.querySelector('.q-error');
  const badgeEl   = node.querySelector('.q-badge');
  const thumbEl   = node.querySelector('.q-thumb');
  const qualSlider= node.querySelector('.q-quality-slider');
  const qualVal   = node.querySelector('.q-quality-value');
  const qualRow   = node.querySelector('.q-quality-row');
  const rmBtn     = node.querySelector('.q-remove');

  const entry = {
    id, file, urlString,
    node, nameEl, origEl, compEl, redEl, arrowEl,
    progBar, dupEl, errEl, badgeEl, thumbEl,
    qualSlider, qualVal, qualRow, rmBtn,
    status: 'queued',
  };
  queue.push(entry);
  queueList.appendChild(node);

  // Name & size
  const name = file ? file.name : (urlString || 'URL');
  nameEl.textContent = name;
  nameEl.title = name;
  origEl.textContent = file ? fmtSize(file.size) : '—';
  arrowEl.hidden = true;
  compEl.hidden = true;
  redEl.hidden = true;

  // Thumb preview for images
  if (file && file.type.startsWith('image/')) {
    const img = document.createElement('img');
    img.alt = '';
    const url = URL.createObjectURL(file);
    img.src = url;
    img.onload = () => URL.revokeObjectURL(url);
    thumbEl.innerHTML = '';
    thumbEl.appendChild(img);
  }

  // Quality slider sync
  qualSlider.value = globalQuality.value;
  qualVal.textContent = `${qualSlider.value}%`;
  qualRow.hidden = !file || !COMPRESSIBLE_MIME.has(file.type);
  qualSlider.addEventListener('input', () => {
    qualVal.textContent = `${qualSlider.value}%`;
  });

  // Remove button
  rmBtn.addEventListener('click', () => {
    const idx = queue.findIndex(e => e.id === id);
    if (idx !== -1) queue.splice(idx, 1);
    node.remove();
    renderQueueHead();
  });

  renderQueueHead();
  return entry;
}

function setStatus(entry, status) {
  entry.status = status;
  entry.node.dataset.status = status;
  const badge = entry.badgeEl;
  const labels = {
    queued:     ['queued',   ''],
    uploading:  ['uploading',''],
    done:       ['done',     'ok'],
    failed:     ['failed',   'fail'],
    duplicate:  ['duplicate','warn'],
  };
  const [text, cls] = labels[status] || ['', ''];
  badge.textContent = text;
  badge.className = 'q-badge' + (cls ? ` q-badge-${cls}` : '');
}

function showDuplicate(entry) {
  entry.dupEl.hidden = false;
  entry.dupEl.querySelector('span').textContent = 'Same filename & size already exists — skipped';
  setStatus(entry, 'duplicate');
}

function showError(entry, msg) {
  entry.errEl.hidden = false;
  entry.errEl.querySelector('span').textContent = msg;
  entry.errEl.querySelector('.q-retry').onclick = () => {
    entry.errEl.hidden = true;
    setStatus(entry, 'queued');
    uploadEntry(entry);
  };
  setStatus(entry, 'failed');
}

// ── Pre-upload duplicate check ────────────────────────────
async function preCheckDuplicate(file) {
  try {
    const res = await fetch('/api/uploads/check-duplicate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: file.name, size: file.size }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.duplicate ?? null;
  } catch {
    return null;
  }
}

// ── XHR upload with progress ──────────────────────────────
function uploadWithProgress(formData, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/uploads');
    xhr.upload.addEventListener('progress', e => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    });
    xhr.addEventListener('load', () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) resolve(data);
        else reject(new Error(data.error || `HTTP ${xhr.status}`));
      } catch {
        reject(new Error('Invalid server response'));
      }
    });
    xhr.addEventListener('error', () => reject(new Error('Network error')));
    xhr.addEventListener('abort', () => reject(new Error('Upload aborted')));
    xhr.send(formData);
  });
}

// ── Upload a single queue entry ───────────────────────────
async function uploadEntry(entry) {
  if (entry.status === 'uploading' || entry.status === 'done') return;

  setStatus(entry, 'uploading');
  entry.errEl.hidden = true;
  entry.dupEl.hidden = true;
  entry.progBar.style.width = '0%';

  try {
    let data;

    if (entry.urlString) {
      // URL-based upload
      const res = await fetch('/api/uploads/url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: entry.urlString,
          quality: Number(globalQuality.value),
          albumId: albumSelect.value || undefined,
          tagIds: [...selectedTagIds],
        }),
      });
      data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      entry.progBar.style.width = '100%';
    } else {
      // File upload
      const fd = new FormData();
      fd.append('file', entry.file);
      if (albumSelect.value) fd.append('albumId', albumSelect.value);
      if (selectedTagIds.size) fd.append('tagIds', JSON.stringify([...selectedTagIds]));

      data = await uploadWithProgress(fd, pct => {
        entry.progBar.style.width = `${Math.round(pct * 100)}%`;
      });
    }

    // Show compression stats
    if (data.compression) {
      const c = data.compression;
      entry.arrowEl.hidden = false;
      entry.compEl.hidden = false;
      entry.redEl.hidden = false;
      entry.compEl.textContent = fmtSize(c.compressedSize);
      entry.redEl.textContent = fmtPct(c.reductionPercent);
      entry.redEl.className = 'q-reduction' + (c.reductionPercent > 0 ? ' q-reduction-good' : '');
    }

    // Post-upload server-side duplicate check (hash-based)
    if (data.duplicate) {
      showDuplicate(entry, data.duplicate);
    } else {
      setStatus(entry, 'done');
    }

    // Update thumb with returned URL if available
    if (data.file?.thumbUrl && entry.thumbEl) {
      const img = entry.thumbEl.querySelector('img') || document.createElement('img');
      img.src = data.file.thumbUrl;
      img.alt = '';
      if (!img.parentElement) {
        entry.thumbEl.innerHTML = '';
        entry.thumbEl.appendChild(img);
      }
    }

  } catch (err) {
    showError(entry, err.message || 'Upload failed');
  }
}

// ── Upload All logic (hard-block duplicates before upload) ──
async function startUploadAll() {
  const pending = queue.filter(e => e.status === 'queued');
  if (!pending.length) return;

  // Disable button while checking
  btnUploadAll.disabled = true;
  btnUploadAll.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Checking…';

  // Check all file entries for duplicates in parallel
  const checks = await Promise.all(
    pending.map(async e => ({
      entry: e,
      isDup: e.file ? (await preCheckDuplicate(e.file)) !== null : false,
    }))
  );

  btnUploadAll.disabled = false;
  btnUploadAll.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Upload all';

  // Mark duplicates and collect non-duplicates
  const toUpload = [];
  let dupCount = 0;
  for (const { entry, isDup } of checks) {
    if (isDup) {
      showDuplicate(entry);
      dupCount++;
    } else {
      toUpload.push(entry);
    }
  }

  if (dupCount > 0) {
    showToast(
      `${dupCount} duplicate${dupCount !== 1 ? 's' : ''} skipped`,
      'warn'
    );
  }

  // Upload only the non-duplicate entries
  toUpload.forEach(e => uploadEntry(e));
}

// ── File ingestion ────────────────────────────────────────
function addFiles(files) {
  [...files].forEach(f => addToQueue(f, null));
}

function addUrl(urlStr) {
  try { new URL(urlStr); } catch {
    showToast('Not a valid URL', 'fail'); return;
  }
  addToQueue(null, urlStr);
}

// ── Dropzone events ───────────────────────────────────────
dropzone.addEventListener('click', e => {
  // Ignore clicks that originated from buttons/inputs inside the dropzone
  if (e.target.closest('button, input')) return;
  fileInput.click();
});
dropzone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') fileInput.click(); });
btnBrowse.addEventListener('click', () => fileInput.click());
btnFolder.addEventListener('click', () => folderInput.click());
fileInput.addEventListener('change', () => { addFiles(fileInput.files); fileInput.value = ''; });
folderInput.addEventListener('change', () => { addFiles(folderInput.files); folderInput.value = ''; });

dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('dz-over'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dz-over'));
dropzone.addEventListener('drop', e => {
  e.preventDefault();
  dropzone.classList.remove('dz-over');
  const files = [...e.dataTransfer.items]
    .filter(i => i.kind === 'file')
    .map(i => i.getAsFile())
    .filter(Boolean);
  addFiles(files);
});

document.addEventListener('paste', e => {
  const items = [...(e.clipboardData?.items || [])];
  const files = items.filter(i => i.kind === 'file').map(i => i.getAsFile()).filter(Boolean);
  if (files.length) addFiles(files);
});

// ── URL add ───────────────────────────────────────────────
btnUrlAdd.addEventListener('click', () => {
  const v = urlInput.value.trim();
  if (v) { addUrl(v); urlInput.value = ''; }
});
urlInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    const v = urlInput.value.trim();
    if (v) { addUrl(v); urlInput.value = ''; }
  }
});

// ── Queue controls ────────────────────────────────────────
btnUploadAll.addEventListener('click', startUploadAll);

btnClearDone.addEventListener('click', () => {
  for (let i = queue.length - 1; i >= 0; i--) {
    if (queue[i].status === 'done') {
      queue[i].node.remove();
      queue.splice(i, 1);
    }
  }
  renderQueueHead();
});

// ── Settings controls ─────────────────────────────────────
albumSelect.addEventListener('change', updateSummary);

globalQuality.addEventListener('input', () => {
  globalQualLabel.textContent = `${globalQuality.value}%`;
  // Sync all queued items that haven't started
  queue.forEach(e => {
    if (e.status === 'queued' && !e.qualRow.hidden) {
      e.qualSlider.value = globalQuality.value;
      e.qualVal.textContent = `${globalQuality.value}%`;
    }
  });
});

btnNewTag.addEventListener('click', createTag);
newTagInput.addEventListener('keydown', e => { if (e.key === 'Enter') createTag(); });

// ── Init ──────────────────────────────────────────────────
checkHealth();
loadAlbums();
loadTags();
