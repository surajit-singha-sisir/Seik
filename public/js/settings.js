/* settings.js — Settings page logic */
'use strict';

// ── State ────────────────────────────────────────────────
let serverData = null;   // response from GET /api/settings
let pendingRestart = false;

// ── DOM helpers ──────────────────────────────────────────
const $ = (id) => document.getElementById(id);

function showToast(msg, type = 'ok') {
  const t = $('s-toast');
  const icon = t.querySelector('i');
  const text = t.querySelector('span');
  icon.className = type === 'ok' ? 'fa-solid fa-circle-check'
                 : type === 'err' ? 'fa-solid fa-circle-xmark'
                 : 'fa-solid fa-triangle-exclamation';
  text.textContent = msg;
  t.className = `s-toast ${type} show`;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 3200);
}

function markRestartNeeded() {
  pendingRestart = true;
  $('restart-banner').classList.add('visible');
}

function fmtBytes(b) {
  if (b === 0) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(b) / Math.log(1024));
  return (b / Math.pow(1024, i)).toFixed(i ? 1 : 0) + ' ' + u[i];
}

function fmtMs(ms) {
  const m = ms / 60000;
  return m >= 60 ? `${(m / 60).toFixed(0)}h` : `${m.toFixed(0)}m`;
}

// ── Load ─────────────────────────────────────────────────
async function loadSettings() {
  try {
    const res = await fetch('/api/settings');
    if (!res.ok) throw new Error(await res.text());
    serverData = await res.json();
    renderAll();
  } catch (err) {
    showToast('Failed to load settings: ' + err.message, 'err');
  }
}

// ── Albums for dropdown ──────────────────────────────────
async function loadAlbums() {
  try {
    const res = await fetch('/api/albums');
    if (!res.ok) return [];
    const data = await res.json();
    return data.albums ?? data ?? [];
  } catch { return []; }
}

// ── Render everything ────────────────────────────────────
async function renderAll() {
  const { settings, env, user, storage, rateLimit } = serverData;

  // ── User info ──
  const initial = (user.username || 'A')[0].toUpperCase();
  $('user-avatar').textContent = initial;
  $('user-name').textContent = user.username;

  // ── Theme toggle ──
  const savedTheme = localStorage.getItem('seik-theme') || settings.theme || 'dark';
  const themeToggle = $('theme-toggle');
  themeToggle.checked = (savedTheme === 'light');
  $('theme-label').textContent = savedTheme === 'light' ? 'Light' : 'Dark';

  // ── Default quality ──
  const q = Number(settings.default_quality) || 85;
  $('quality-range').value = q;
  $('quality-value').textContent = q;

  // ── Gallery page size ──
  $('page-size').value = Number(settings.gallery_page_size) || 60;

  // ── Confirm before delete ──
  $('confirm-delete').checked = settings.confirm_before_delete !== false;

  // ── Upload size limit ──
  $('upload-size').value = env.maxUploadSizeMb || 32;

  // ── ImgBB API URL ──
  $('imgbb-url').value = env.imgbbApiUrl || '';

  // ── Masked values ──
  $('db-masked').textContent = env.databaseUrl || '(not set)';
  $('imgbb-masked').textContent = env.imgbbApiKey || '(not set)';

  // ── Storage ──
  $('storage-files').textContent = storage.fileCount.toLocaleString();
  $('storage-size').textContent = fmtBytes(storage.totalSize);
  $('storage-albums').textContent = storage.albumCount.toLocaleString();

  // ── Rate limit ──
  $('rl-window').textContent = fmtMs(rateLimit.windowMs);
  $('rl-max').textContent = rateLimit.max.toLocaleString();

  // ── Default album dropdown ──
  const albums = await loadAlbums();
  const sel = $('default-album');
  sel.innerHTML = '<option value="">— None —</option>';
  for (const a of albums) {
    const opt = document.createElement('option');
    opt.value = a.id;
    opt.textContent = a.name;
    if (a.id === settings.default_album_id) opt.selected = true;
    sel.appendChild(opt);
  }
}

// ── Patch DB-backed setting ──────────────────────────────
async function patchSetting(payload) {
  const res = await fetch('/api/settings', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Update failed');
  serverData.settings = data.settings;
  return data;
}

// ── Patch env-backed setting ─────────────────────────────
async function patchEnv(payload) {
  const res = await fetch('/api/settings/env', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Update failed');
  if (data.requiresRestart) markRestartNeeded();
  return data;
}

// ── Theme toggle ─────────────────────────────────────────
$('theme-toggle').addEventListener('change', async (e) => {
  const theme = e.target.checked ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('seik-theme', theme);
  $('theme-label').textContent = e.target.checked ? 'Light' : 'Dark';
  try {
    await patchSetting({ theme });
    showToast(`Theme set to ${theme}`);
  } catch (err) { showToast(err.message, 'err'); }
});

// ── Quality range ────────────────────────────────────────
$('quality-range').addEventListener('input', (e) => {
  $('quality-value').textContent = e.target.value;
});
$('quality-range').addEventListener('change', async (e) => {
  try {
    await patchSetting({ defaultQuality: Number(e.target.value) });
    showToast('Default quality saved');
  } catch (err) { showToast(err.message, 'err'); }
});

// ── Gallery page size ─────────────────────────────────────
$('page-size').addEventListener('change', async (e) => {
  const v = Number(e.target.value);
  if (v < 10 || v > 500) return;
  try {
    await patchSetting({ galleryPageSize: v });
    showToast('Gallery page size saved');
  } catch (err) { showToast(err.message, 'err'); }
});

// ── Confirm before delete ─────────────────────────────────
$('confirm-delete').addEventListener('change', async (e) => {
  try {
    await patchSetting({ confirmBeforeDelete: e.target.checked });
    showToast(e.target.checked ? 'Confirm on delete enabled' : 'Confirm on delete disabled');
  } catch (err) { showToast(err.message, 'err'); }
});

// ── Default album ─────────────────────────────────────────
$('default-album').addEventListener('change', async (e) => {
  try {
    await patchSetting({ defaultAlbumId: e.target.value || null });
    showToast('Default album saved');
  } catch (err) { showToast(err.message, 'err'); }
});

// ── Upload size save ──────────────────────────────────────
$('save-upload-size').addEventListener('click', async () => {
  const v = Number($('upload-size').value);
  if (!v || v < 1 || v > 500) return showToast('Enter a value between 1 and 500 MB', 'warn');
  try {
    await patchEnv({ maxUploadSizeMb: v });
    showToast('Upload size limit saved — restart to apply', 'warn');
  } catch (err) { showToast(err.message, 'err'); }
});

// ── ImgBB API key save ────────────────────────────────────
$('save-imgbb-key').addEventListener('click', async () => {
  const key = $('imgbb-key-input').value.trim();
  if (!key) return showToast('Enter an API key', 'warn');
  try {
    await patchEnv({ imgbbApiKey: key });
    $('imgbb-masked').textContent = '•'.repeat(Math.max(0, key.length - 4)) + key.slice(-4);
    $('imgbb-key-input').value = '';
    showToast('ImgBB API key saved — restart to apply', 'warn');
  } catch (err) { showToast(err.message, 'err'); }
});

// ── ImgBB API URL save ────────────────────────────────────
$('save-imgbb-url').addEventListener('click', async () => {
  const url = $('imgbb-url').value.trim();
  if (!url) return showToast('Enter a URL', 'warn');
  try {
    await patchEnv({ imgbbApiUrl: url });
    showToast('ImgBB API URL saved — restart to apply', 'warn');
  } catch (err) { showToast(err.message, 'err'); }
});

// ── DB URL save ───────────────────────────────────────────
$('save-db-url').addEventListener('click', async () => {
  const url = $('db-url-input').value.trim();
  if (!url) return showToast('Enter a database URL', 'warn');
  try {
    await patchEnv({ databaseUrl: url });
    $('db-masked').textContent = '•'.repeat(Math.max(0, url.length - 12)) + url.slice(-12);
    $('db-url-input').value = '';
    showToast('Database URL saved — restart to apply', 'warn');
  } catch (err) { showToast(err.message, 'err'); }
});

// ── Password change ───────────────────────────────────────
$('save-password').addEventListener('click', async () => {
  const currentPassword = $('pw-current').value;
  const newPassword = $('pw-new').value;
  const confirmPassword = $('pw-confirm').value;

  if (!currentPassword || !newPassword) return showToast('Fill in all password fields', 'warn');
  if (newPassword !== confirmPassword) return showToast('New passwords do not match', 'err');
  if (newPassword.length < 8) return showToast('New password must be at least 8 characters', 'warn');

  try {
    const res = await fetch('/api/settings/password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to change password');
    $('pw-current').value = '';
    $('pw-new').value = '';
    $('pw-confirm').value = '';
    if (data.requiresRestart) markRestartNeeded();
    showToast('Password changed — restart to apply', 'warn');
  } catch (err) { showToast(err.message, 'err'); }
});

// ── Restart server ────────────────────────────────────────
$('restart-btn').addEventListener('click', async () => {
  if (!confirm('Restart the server now? It will go offline briefly.')) return;
  $('restart-btn').disabled = true;
  $('restart-btn').textContent = 'Restarting…';
  try {
    await fetch('/api/settings/restart', { method: 'POST' });
  } catch { /* expected — server is going down */ }
  showToast('Server restarting… reconnecting in 6s', 'warn');
  setTimeout(() => window.location.reload(), 6000);
});

// ── Init ──────────────────────────────────────────────────
loadSettings();
