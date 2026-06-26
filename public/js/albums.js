/* albums.js */
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

const grid    = document.getElementById('albums-grid');
const emptyEl = document.getElementById('albums-empty');
const modal   = document.getElementById('modal');

async function loadAlbums() {
  grid.innerHTML = '<div class="skeleton" style="height:100px;border-radius:12px;grid-column:1/-1"></div>';
  const res  = await fetch('/api/albums');
  const data = await res.json();
  grid.innerHTML = '';

  document.getElementById('total-label').textContent = `${data.albums.length} album${data.albums.length !== 1 ? 's' : ''}`;

  if (!data.albums.length) { emptyEl.hidden = false; return; }
  emptyEl.hidden = true;

  data.albums.forEach(a => {
    const card = document.createElement('div');
    card.className = 'album-card';
    card.innerHTML = `
      <div class="album-icon"><i class="fa-solid fa-folder-open"></i></div>
      <div class="album-name">${a.name}</div>
      <div class="album-meta">${a.fileCount} file${a.fileCount !== 1 ? 's' : ''} · ${fmtDate(a.createdAt)}</div>
      ${a.description ? `<div style="font-size:.75rem;color:rgba(237,234,227,.45);margin-top:.1rem">${a.description}</div>` : ''}
      <div class="album-actions">
        <button class="icon-btn del-btn" title="Delete album" data-id="${a.id}">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>
    `;
    card.querySelector('.del-btn').addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm(`Delete album "${a.name}"? Files will not be deleted.`)) return;
      await fetch(`/api/albums/${a.id}`, { method: 'DELETE' });
      loadAlbums();
    });
    grid.appendChild(card);
  });
}

// Modal
document.getElementById('btn-new-album').addEventListener('click', () => { modal.hidden = false; });
document.getElementById('btn-cancel').addEventListener('click', () => { modal.hidden = true; });
modal.addEventListener('click', e => { if (e.target === modal) modal.hidden = true; });

document.getElementById('btn-create').addEventListener('click', async () => {
  const name = document.getElementById('album-name').value.trim();
  const desc = document.getElementById('album-desc').value.trim();
  if (!name) return;
  const res = await fetch('/api/albums', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, description: desc || undefined }),
  });
  if (res.ok) {
    modal.hidden = true;
    document.getElementById('album-name').value = '';
    document.getElementById('album-desc').value = '';
    loadAlbums();
  }
});

checkHealth();
loadAlbums();
