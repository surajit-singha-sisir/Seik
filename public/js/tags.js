/* tags.js */
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

const tagsGrid = document.getElementById('tags-grid');
const emptyEl  = document.getElementById('tags-empty');

async function loadTags() {
  tagsGrid.innerHTML = '';
  const res  = await fetch('/api/tags');
  const data = await res.json();

  document.getElementById('total-label').textContent = `${data.tags.length} tag${data.tags.length !== 1 ? 's' : ''}`;

  if (!data.tags.length) { emptyEl.hidden = false; return; }
  emptyEl.hidden = true;

  data.tags.forEach(t => {
    const chip = document.createElement('div');
    chip.className = 'tag-chip';
    chip.innerHTML = `
      <span class="tag-name">${t.name}</span>
      <span class="tag-count">${t.fileCount}</span>
      <button class="tag-del" title="Delete tag" data-id="${t.id}"><i class="fa-solid fa-xmark"></i></button>
    `;
    chip.querySelector('.tag-del').addEventListener('click', async () => {
      if (!confirm(`Delete tag "${t.name}"?`)) return;
      await fetch(`/api/tags/${t.id}`, { method: 'DELETE' });
      loadTags();
    });
    tagsGrid.appendChild(chip);
  });
}

// Add tag
async function addTag() {
  const input = document.getElementById('tag-input');
  const name  = input.value.trim();
  if (!name) return;
  const res = await fetch('/api/tags', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (res.status === 409) { alert('That tag already exists.'); return; }
  if (res.ok) { input.value = ''; loadTags(); }
}

document.getElementById('btn-add-tag').addEventListener('click', addTag);
document.getElementById('tag-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') addTag();
});

checkHealth();
loadTags();
