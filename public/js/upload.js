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

// ── State ─────────────────────────────────────────────────
const queue = [];
let nextId = 0;
let selectedTagIds = new Set();   // Set<string>
let allTags = [];                  // [{id, name, slug}]

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

// ── Load albums from DB ───────────────────────────────────
async function loadAlbums() {
  try {
    const res = await fetch('/api/albums');
    const data = await res.json();
    const current = albumSelect.value;
    // Remove all options except the first "No album"
    while (albumSelect.options.length > 1) albumSelect.remove(1);
    (data.albums || []).forEach(a => {
      const opt = new Option(`${a.name} (${a.fileCount})`, a.id);
      albumSelect.appendChild(opt);
    });
    if (current) albumSelect.value = current;
  } catch (e) {
    console.error('[loadAlbums]', e);
  }
}

// ── Load tags from DB ─────────────────────────────────────
async function loadTags() {
  try {
    const res = await fetch('/api/tags');
    const data = await res.json();
    allTags = data.tags || [];
    renderTagsPicker();
  } catch (e) {
    console.error('[loadTags]', e);
    tagsPicker.innerHTML = '<span class="tags-placeholder">Failed to load tags</span>';
  }
}

function renderTagsPicker() {
  tagsPicker.innerHTML = '';
  if (!allTags.length) {
    tagsPicker.innerHTML = '<span class="tags-placeholder">No tags yet — create one below</span>';
    return;
  }
  allTags.forEach(t => {
    const pill = document.createElement('button');
    pill.type = 'button';
    pill.className = 'tag-pill' + (selectedTagIds.has(t.id) ? ' selected' : '');
    pill.dataset.id = t.id;
    pill.title = `${t.fileCount} file${t.fileCount !== 1 ? 's' : ''}`;
    pill.innerHTML = `<i class="fa-solid fa-check tag-pill-check"></i>${t.name}`;
    pill.addEventListener('click', () => {
      if (selectedTagIds.has(t.id)) selectedTagIds.delete(t.id);
      else selectedTagIds.add(t.id);
      pill.classList.toggle('selected', selectedTagIds.has(t.id));
      updateSummary();
    });
    tagsPicker.appendChild(pill);
  });
}

// ── Create tag inline ─────────────────────────────────────
async function createTag() {
  const name = newTagInput.value.trim();
  if (!name) return;
  btnNewTag.disabled = true;
  try {
    const res = await fetch('/api/tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    if (res.status === 409) { showToast('Tag already exists', 'warn'); return; }
    if (!res.ok) { showToast(data.error || 'Failed to create tag', 'fail'); return; }
    newTagInput.value = '';
    await loadTags();
    // Auto-select the new tag
    selectedTagIds.add(data.id);
    renderTagsPicker();
    updateSummary();
    showToast(`Tag "${data.name}" created & selected`);
  } finally {
    btnNewTag.disabled = false;
  }
}
btnNewTag.addEventListener('click', createTag);
newTagInput.addEventListener('keydown', e => { if (e.key === 'Enter') createTag(); });

// ── Global quality slider ─────────────────────────────────
globalQuality.addEventListener('input', () => {
  globalQualLabel.textContent = `${globalQuality.value}%`;
});

// ── Summary strip ─────────────────────────────────────────
albumSelect.addEventListener('change', updateSummary);

function updateSummary() {
  const hasAlbum = !!albumSelect.value;
  const hasTags  = selectedTagIds.size > 0;

  summaryAlbumRow.hidden = !hasAlbum;
  if (hasAlbum) {
    summaryAlbumName.textContent = albumSelect.options[albumSelect.selectedIndex].text;
  }

  summaryTagsRow.hidden = !hasTags;
  if (hasTags) {
    const names = allTags.filter(t => selectedTagIds.has(t.id)).map(t => t.name);
    summaryTagsList.textContent = names.join(', ');
  }

  settingSummary.hidden = !hasAlbum && !hasTags;
}

// ── Queue management ──────────────────────────────────────
function updateQueueHead() {
  const count = queue.length;
  queueHead.hidden = count === 0;
  queueCount.textContent = `${count} file${count !== 1 ? 's' : ''}`;
}

function addFilesToQueue(fileList) {
  for (const file of fileList) addItem(file, file.name, 'file');
  updateQueueHead();
}

function addUrlToQueue(url) {
  addItem(null, url, 'url');
  updateQueueHead();
}

function addItem(file, name, type) {
  const id = nextId++;
  const node = itemTpl.content.cloneNode(true);
  const li = node.querySelector('.q-item');

  li.dataset.id     = id;
  li.dataset.type   = type;
  li.dataset.status = 'queued';

  const isCompressible = file ? COMPRESSIBLE_MIME.has(file.type) : false;
  li.dataset.compressible = isCompressible;

  li.querySelector('.q-name').textContent = name.length > 48 ? name.slice(0,45)+'…' : name;
  li.querySelector('.q-badge').textContent = 'queued';
  li.querySelector('.q-original').textContent = file ? fmtSize(file.size) : '—';

  if (file && file.type.startsWith('image/')) {
    const img = document.createElement('img');
    img.src = URL.createObjectURL(file);
    img.onload = () => URL.revokeObjectURL(img.src);
    li.querySelector('.q-thumb').replaceChildren(img);
  } else if (type === 'url') {
    li.querySelector('.q-thumb i').className = 'fa-solid fa-link';
  }

  // Sync quality slider with global default
  const slider = li.querySelector('.q-quality-slider');
  const qualLabel = li.querySelector('.q-quality-value');
  slider.value = globalQuality.value;
  qualLabel.textContent = `${globalQuality.value}%`;

  slider.addEventListener('input', () => {
    qualLabel.textContent = `${slider.value}%`;
    schedulePreview(id, file, Number(slider.value));
  });

  li.querySelector('.q-remove').addEventListener('click', () => {
    const entry = queue.find(e => e.id === id);
    if (entry?.abortCtrl) entry.abortCtrl.abort();
    li.remove();
    const idx = queue.findIndex(e => e.id === id);
    if (idx !== -1) queue.splice(idx, 1);
    updateQueueHead();
  });

  queueList.appendChild(li);
  queue.push({ id, file, name, type, status: 'queued', el: li });

  if (isCompressible && file) schedulePreview(id, file, Number(globalQuality.value));
}

// ── Live compression preview ──────────────────────────────
const previewTimers = new Map();

function schedulePreview(id, file, quality) {
  if (!file) return;
  clearTimeout(previewTimers.get(id));
  previewTimers.set(id, setTimeout(() => runPreview(id, file, quality), 280));
}

async function runPreview(id, file, quality) {
  const entry = queue.find(e => e.id === id);
  if (!entry || entry.status === 'uploading' || entry.status === 'done') return;

  const li = entry.el;
  const compressedEl = li.querySelector('.q-compressed');
  const reductionEl  = li.querySelector('.q-reduction');
  compressedEl.textContent = '…';

  const fd = new FormData();
  fd.append('file', file);
  fd.append('quality', quality);

  try {
    const res  = await fetch('/api/uploads/preview', { method: 'POST', body: fd });
    const data = await res.json();
    if (!res.ok) { compressedEl.textContent = '—'; return; }
    compressedEl.textContent = fmtSize(data.compressedSize);
    reductionEl.textContent  = data.compressed ? fmtPct(data.reductionPercent) : '';
    reductionEl.style.color  = data.reductionPercent > 0 ? 'var(--ok)' : 'var(--warn)';
  } catch {
    compressedEl.textContent = '—';
  }
}

// ── Upload a single entry ─────────────────────────────────
function setStatus(li, status, text) {
  li.dataset.status = status;
  li.querySelector('.q-badge').textContent = text;
}

function showDuplicate(li, data) {
  const dup = li.querySelector('.q-duplicate');
  dup.hidden = false;
  dup.querySelector('span').textContent =
    `Already uploaded as "${data.duplicate.filename}" — saved again anyway.`;
}

function showResult(li, data) {
  const url = data.file.imgbbUrl || data.file.viewerUrl || '';
  if (!url) return;
  const body = li.querySelector('.q-body');
  body.querySelector('.q-result-link')?.remove();

  const row  = document.createElement('div');
  row.className = 'q-result-link';

  const link = document.createElement('a');
  link.href = url; link.target = '_blank'; link.rel = 'noopener';
  link.textContent = url.length > 58 ? url.slice(0,55)+'…' : url;

  const btn  = document.createElement('button');
  btn.type = 'button'; btn.className = 'q-copy-btn';
  btn.innerHTML = '<i class="fa-regular fa-copy"></i>';
  btn.title = 'Copy URL';
  btn.addEventListener('click', () => {
    navigator.clipboard.writeText(url).then(() => showToast('URL copied!'));
  });

  row.append(link, btn);
  body.appendChild(row);
}

async function uploadEntry(entry) {
  if (entry.status === 'uploading' || entry.status === 'done') return;

  const li = entry.el;
  entry.status = 'uploading';
  entry.abortCtrl = new AbortController();
  setStatus(li, 'uploading', 'uploading…');

  li.querySelector('.q-error').hidden    = true;
  li.querySelector('.q-duplicate').hidden = true;

  const progressBar = li.querySelector('.q-progress-bar');
  const slider      = li.querySelector('.q-quality-slider');
  const quality     = Number(slider.value);
  const albumId     = albumSelect.value || null;
  const tagIds      = [...selectedTagIds];

  try {
    let data;
    if (entry.type === 'url') {
      const res = await fetch('/api/uploads/url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: entry.name, quality, albumId, tagIds }),
        signal: entry.abortCtrl.signal,
      });
      data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    } else {
      data = await uploadWithProgress(entry.file, quality, albumId, tagIds, progressBar, entry.abortCtrl.signal);
    }

    entry.status = 'done';
    setStatus(li, 'done', 'done ✓');
    progressBar.style.width = '100%';

    const comp = data.compression;
    if (comp) {
      li.querySelector('.q-original').textContent   = fmtSize(comp.originalSize);
      li.querySelector('.q-compressed').textContent = fmtSize(comp.compressedSize);
      li.querySelector('.q-reduction').textContent  = comp.compressed ? fmtPct(comp.reductionPercent) : '';
    }

    if (data.duplicate) showDuplicate(li, data);
    showResult(li, data);
  } catch (err) {
    if (err.name === 'AbortError') {
      entry.status = 'queued';
      setStatus(li, 'queued', 'cancelled');
      progressBar.style.width = '0%';
      return;
    }
    entry.status = 'failed';
    setStatus(li, 'failed', 'failed');
    const errRow = li.querySelector('.q-error');
    errRow.hidden = false;
    errRow.querySelector('span').textContent = err.message || 'Upload failed.';
    errRow.querySelector('.q-retry').onclick = () => {
      entry.status = 'queued';
      uploadEntry(entry);
    };
  }
}

function uploadWithProgress(file, quality, albumId, tagIds, progressBar, signal) {
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('quality', quality);
    if (albumId) fd.append('albumId', albumId);
    if (tagIds.length) fd.append('tagIds', JSON.stringify(tagIds));

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/uploads');

    signal.addEventListener('abort', () => { xhr.abort(); reject(new DOMException('Aborted','AbortError')); });

    xhr.upload.addEventListener('progress', e => {
      if (e.lengthComputable) progressBar.style.width = `${Math.round(e.loaded/e.total*90)}%`;
    });

    xhr.addEventListener('load', () => {
      progressBar.style.width = '95%';
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 400) reject(new Error(data.error || `HTTP ${xhr.status}`));
        else resolve(data);
      } catch { reject(new Error('Invalid server response')); }
    });
    xhr.addEventListener('error', () => reject(new Error('Network error')));
    xhr.addEventListener('abort', () => reject(new DOMException('Aborted','AbortError')));

    xhr.send(fd);
  });
}

// ── Input wiring ──────────────────────────────────────────
btnBrowse.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => { addFilesToQueue(fileInput.files); fileInput.value = ''; });

btnFolder.addEventListener('click', () => folderInput.click());
folderInput.addEventListener('change', () => { addFilesToQueue(folderInput.files); folderInput.value = ''; });

dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('drag-over'); });
dropzone.addEventListener('dragleave', e => {
  if (!dropzone.contains(e.relatedTarget)) dropzone.classList.remove('drag-over');
});
dropzone.addEventListener('drop', e => {
  e.preventDefault();
  dropzone.classList.remove('drag-over');
  addFilesToQueue(gatherDroppedFiles(e.dataTransfer));
});
dropzone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') fileInput.click(); });

function gatherDroppedFiles(dt) {
  const out = [];
  if (dt.items) {
    for (const item of dt.items) {
      if (item.kind !== 'file') continue;
      const entry = item.webkitGetAsEntry?.();
      if (entry?.isDirectory) { traverseEntry(entry, out); continue; }
      const f = item.getAsFile();
      if (f) out.push(f);
    }
    return out;
  }
  return Array.from(dt.files);
}

function traverseEntry(entry, out) {
  if (entry.isFile) {
    entry.file(f => { addFilesToQueue([f]); });
  } else if (entry.isDirectory) {
    const reader = entry.createReader();
    reader.readEntries(entries => entries.forEach(e => traverseEntry(e, out)));
  }
}

document.addEventListener('paste', e => {
  const items = e.clipboardData?.items;
  if (!items) return;
  const files = [];
  for (const item of items) {
    if (item.kind === 'file') { const f = item.getAsFile(); if (f) files.push(f); }
  }
  if (files.length) addFilesToQueue(files);
});

function addFromUrl() {
  const val = urlInput.value.trim();
  if (!val) return;
  try { new URL(val); } catch { showToast('Invalid URL', 'fail'); return; }
  addUrlToQueue(val);
  urlInput.value = '';
}
btnUrlAdd.addEventListener('click', addFromUrl);
urlInput.addEventListener('keydown', e => { if (e.key === 'Enter') addFromUrl(); });

btnUploadAll.addEventListener('click', () => {
  const pending = queue.filter(e => e.status === 'queued' || e.status === 'failed');
  pending.reduce((p, entry) => p.then(() => uploadEntry(entry)), Promise.resolve());
});

btnClearDone.addEventListener('click', () => {
  const done = queue.filter(e => e.status === 'done');
  done.forEach(e => { e.el.remove(); queue.splice(queue.indexOf(e),1); });
  updateQueueHead();
});

// ── Init ──────────────────────────────────────────────────
checkHealth();
loadAlbums();
loadTags();
