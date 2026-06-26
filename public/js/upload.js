/* =========================================================
   upload.js — Seik upload page
   Handles: file picker · drag-drop · paste · URL · folder
   Live compression preview via /api/uploads/preview
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
const itemTpl     = document.getElementById('queue-item-template');

// ── State ─────────────────────────────────────────────────
const queue = []; // { id, file, name, status, el, abortCtrl }
let nextId = 0;

// ── Toast ─────────────────────────────────────────────────
let toastEl;
function showToast(msg) {
  if (!toastEl) {
    toastEl = Object.assign(document.createElement('div'), { className:'toast' });
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastEl._t);
  toastEl._t = setTimeout(() => toastEl.classList.remove('show'), 2200);
}

// ── Helpers ───────────────────────────────────────────────
function fmtSize(bytes) {
  if (bytes < 1024)       return `${bytes} B`;
  if (bytes < 1024**2)    return `${(bytes/1024).toFixed(1)} KB`;
  return `${(bytes/1024**2).toFixed(2)} MB`;
}

function fmtPct(n) {
  if (n > 0)  return `−${n}%`;
  if (n < 0)  return `+${Math.abs(n)}%`;
  return '0%';
}


// ── Queue management ──────────────────────────────────────
function updateQueueHead() {
  const count = queue.length;
  queueHead.hidden = count === 0;
  queueCount.textContent = `${count} file${count !== 1 ? 's' : ''}`;
}

function addFilesToQueue(fileList) {
  for (const file of fileList) {
    addItem(file, file.name, 'file');
  }
  updateQueueHead();
}

function addUrlToQueue(url) {
  // For URL items, no File object — we send JSON to /api/uploads/url
  addItem(null, url, 'url');
  updateQueueHead();
}

function addItem(file, name, type) {
  const id = nextId++;
  const node = itemTpl.content.cloneNode(true);
  const li = node.querySelector('.q-item');

  // Populate template slots
  li.dataset.id     = id;
  li.dataset.type   = type;
  li.dataset.status = 'queued';

  const isCompressible = file ? COMPRESSIBLE_MIME.has(file.type) : false;
  li.dataset.compressible = isCompressible;

  li.querySelector('.q-name').textContent  = name.length > 48 ? name.slice(0,45)+'…' : name;
  li.querySelector('.q-status').textContent = 'queued';
  li.querySelector('.q-original').textContent = file ? fmtSize(file.size) : '—';

  // Thumbnail
  if (file && file.type.startsWith('image/')) {
    const img = document.createElement('img');
    img.src = URL.createObjectURL(file);
    img.onload = () => URL.revokeObjectURL(img.src);
    li.querySelector('.q-thumb').replaceChildren(img);
  } else if (type === 'url') {
    li.querySelector('.q-thumb i').className = 'fa-solid fa-link';
  }

  // Quality slider wiring
  const slider = li.querySelector('.q-quality-slider');
  const qualLabel = li.querySelector('.q-quality-value');
  slider.addEventListener('input', () => {
    qualLabel.textContent = `${slider.value}%`;
    schedulePreview(id, file, Number(slider.value));
  });

  // Remove button
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

  // Kick off initial preview for compressible files
  if (isCompressible && file) schedulePreview(id, file, 85);
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
    const res  = await fetch('/api/uploads/preview', { method:'POST', body: fd });
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
  li.querySelector('.q-status').textContent = text;
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
  const existing = body.querySelector('.q-result-link');
  if (existing) existing.remove();

  const row = document.createElement('div');
  row.className = 'q-result-link';

  const link = document.createElement('a');
  link.href = url; link.target = '_blank'; link.rel = 'noopener';
  link.textContent = url.length > 60 ? url.slice(0,57)+'…' : url;

  const btn = document.createElement('button');
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

  // hide old errors/dupes
  li.querySelector('.q-error').hidden    = true;
  li.querySelector('.q-duplicate').hidden = true;

  const progressBar = li.querySelector('.q-progress-bar');
  // Animate progress bar (XHR used for real progress tracking)
  const slider = li.querySelector('.q-quality-slider');
  const quality = Number(slider.value);

  try {
    let data;
    if (entry.type === 'url') {
      const res = await fetch('/api/uploads/url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: entry.name, quality }),
        signal: entry.abortCtrl.signal,
      });
      data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    } else {
      data = await uploadWithProgress(entry.file, quality, progressBar, entry.abortCtrl.signal);
    }

    entry.status = 'done';
    setStatus(li, 'done', 'done');
    progressBar.style.width = '100%';

    // Update compression stats with real values
    const comp = data.compression;
    if (comp) {
      li.querySelector('.q-original').textContent    = fmtSize(comp.originalSize);
      li.querySelector('.q-compressed').textContent  = fmtSize(comp.compressedSize);
      li.querySelector('.q-reduction').textContent   = comp.compressed ? fmtPct(comp.reductionPercent) : '';
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


// XHR-based upload for real progress tracking
function uploadWithProgress(file, quality, progressBar, signal) {
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('quality', quality);

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

// ── Input method wiring ───────────────────────────────────

// 1. File picker
btnBrowse.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  addFilesToQueue(fileInput.files);
  fileInput.value = '';
});

// 2. Folder picker
btnFolder.addEventListener('click', () => folderInput.click());
folderInput.addEventListener('change', () => {
  addFilesToQueue(folderInput.files);
  folderInput.value = '';
});

// 3. Drag and drop
dropzone.addEventListener('dragover', e => {
  e.preventDefault();
  dropzone.classList.add('drag-over');
});
dropzone.addEventListener('dragleave', e => {
  if (!dropzone.contains(e.relatedTarget)) dropzone.classList.remove('drag-over');
});
dropzone.addEventListener('drop', e => {
  e.preventDefault();
  dropzone.classList.remove('drag-over');
  const files = gatherDroppedFiles(e.dataTransfer);
  addFilesToQueue(files);
});
dropzone.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' ') fileInput.click();
});

function gatherDroppedFiles(dt) {
  // Use DataTransferItemList to support folders via webkitGetAsEntry
  const out = [];
  if (dt.items) {
    for (const item of dt.items) {
      if (item.kind !== 'file') continue;
      const entry = item.webkitGetAsEntry?.();
      if (entry?.isDirectory) {
        // folders will be traversed async — for simplicity add root files only
        traverseEntry(entry, out);
        continue;
      }
      const f = item.getAsFile();
      if (f) out.push(f);
    }
    return out;
  }
  return Array.from(dt.files);
}

function traverseEntry(entry, out) {
  if (entry.isFile) {
    entry.file(f => { out.push(f); addFilesToQueue([f]); });
  } else if (entry.isDirectory) {
    const reader = entry.createReader();
    reader.readEntries(entries => entries.forEach(e => traverseEntry(e, out)));
  }
}

// 4. Clipboard paste (Ctrl+V anywhere on the page)
document.addEventListener('paste', e => {
  const items = e.clipboardData?.items;
  if (!items) return;
  const files = [];
  for (const item of items) {
    if (item.kind === 'file') {
      const f = item.getAsFile();
      if (f) files.push(f);
    }
  }
  if (files.length) addFilesToQueue(files);
});

// 5. URL input
function addFromUrl() {
  const val = urlInput.value.trim();
  if (!val) return;
  try { new URL(val); } catch { showToast('Invalid URL'); return; }
  addUrlToQueue(val);
  urlInput.value = '';
  updateQueueHead();
}
btnUrlAdd.addEventListener('click', addFromUrl);
urlInput.addEventListener('keydown', e => { if (e.key === 'Enter') addFromUrl(); });


// ── Queue actions ─────────────────────────────────────────
btnUploadAll.addEventListener('click', () => {
  const pending = queue.filter(e => e.status === 'queued' || e.status === 'failed');
  // Upload sequentially to avoid hammering the server; adjust if you want parallel
  pending.reduce((p, entry) => p.then(() => uploadEntry(entry)), Promise.resolve());
});

btnClearDone.addEventListener('click', () => {
  const done = queue.filter(e => e.status === 'done');
  done.forEach(e => { e.el.remove(); queue.splice(queue.indexOf(e),1); });
  updateQueueHead();
});
