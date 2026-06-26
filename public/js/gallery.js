/* gallery.js */
const LIMIT = 40;
let page = 1, totalPages = 1, activeMime = '', searchQ = '';

function fmtSize(b) {
  if (!b) return '0 B';
  if (b < 1024) return `${b} B`;
  if (b < 1024**2) return `${(b/1024).toFixed(1)} KB`;
  return `${(b/1024**2).toFixed(2)} MB`;
}

// API health
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

// Skeletons
function renderSkeletons() {
  const g = document.getElementById('gallery');
  g.innerHTML = '';
  for (let i = 0; i < 12; i++) {
    const d = document.createElement('div');
    d.className = 'skeleton'; d.style.cssText = 'aspect-ratio:1;border-radius:10px;';
    g.appendChild(d);
  }
}

// Lightbox
const lightbox = document.getElementById('lightbox');
const lbImg = document.getElementById('lb-img');
const lbMeta = document.getElementById('lb-meta');
document.getElementById('lb-close').addEventListener('click', closeLb);
lightbox.addEventListener('click', e => { if (e.target === lightbox) closeLb(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeLb(); });
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

async function load() {
  renderSkeletons();
  document.getElementById('gallery-empty').hidden = true;
  document.getElementById('pagination').hidden = true;

  const params = new URLSearchParams({ page, limit: LIMIT });
  if (activeMime) params.set('mime', activeMime);
  if (searchQ)    params.set('q', searchQ);

  const res = await fetch(`/api/gallery?${params}`);
  const data = await res.json();
  const gallery = document.getElementById('gallery');
  gallery.innerHTML = '';

  totalPages = Math.max(1, Math.ceil(data.total / LIMIT));
  document.getElementById('total-label').textContent = `${data.total} file${data.total !== 1 ? 's' : ''}`;

  if (!data.files?.length) {
    document.getElementById('gallery-empty').hidden = false;
    return;
  }

  data.files.forEach(f => {
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
    const info = document.createElement('div'); info.className = 'g-info';
    info.innerHTML = `<div class="g-name">${f.filename}</div><div class="g-size">${fmtSize(f.size)}</div>`;
    card.appendChild(info);
    if (isImg) card.addEventListener('click', () => openLb(f));
    else if (f.viewerUrl || f.imgbbUrl) card.addEventListener('click', () => window.open(f.viewerUrl || f.imgbbUrl, '_blank'));
    gallery.appendChild(card);
  });

  // Pagination
  if (totalPages > 1) {
    document.getElementById('pagination').hidden = false;
    document.getElementById('page-info').textContent = `${page} / ${totalPages}`;
    document.getElementById('btn-prev').disabled = page <= 1;
    document.getElementById('btn-next').disabled = page >= totalPages;
  }
}

// Filter buttons
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeMime = btn.dataset.mime;
    page = 1; load();
  });
});

// Search (debounced)
let searchTimer;
document.getElementById('search').addEventListener('input', e => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { searchQ = e.target.value.trim(); page = 1; load(); }, 350);
});

// Pagination
document.getElementById('btn-prev').addEventListener('click', () => { if (page > 1) { page--; load(); } });
document.getElementById('btn-next').addEventListener('click', () => { if (page < totalPages) { page++; load(); } });

checkHealth();
load();
