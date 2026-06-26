import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { db, settings, files, albums } from '../../database/index.js';
import { count, sum } from 'drizzle-orm';
import { readEnvValues, updateEnvValues, maskSecret } from '../../utils/envFile.js';

const router = Router();

// ── Keys we persist in the DB-backed `settings` table ─────
// Stored as JSON values, one row per key.
const SETTINGS_KEYS = {
  theme: 'theme',                     // 'dark' | 'light'
  defaultQuality: 'default_quality',  // number 1-100
  defaultAlbumId: 'default_album_id', // uuid | null
  galleryPageSize: 'gallery_page_size', // number
  confirmBeforeDelete: 'confirm_before_delete', // boolean
} as const;

const DEFAULTS: Record<string, unknown> = {
  [SETTINGS_KEYS.theme]: 'dark',
  [SETTINGS_KEYS.defaultQuality]: Number(process.env.DEFAULT_COMPRESSION_QUALITY) || 85,
  [SETTINGS_KEYS.defaultAlbumId]: null,
  [SETTINGS_KEYS.galleryPageSize]: 60,
  [SETTINGS_KEYS.confirmBeforeDelete]: true,
};

const PatchSettings = z.object({
  theme: z.enum(['dark', 'light']).optional(),
  defaultQuality: z.number().min(1).max(100).optional(),
  defaultAlbumId: z.string().uuid().nullable().optional(),
  galleryPageSize: z.number().min(10).max(500).optional(),
  confirmBeforeDelete: z.boolean().optional(),
});

const ENV_KEYS = [
  'DATABASE_URL',
  'IMGBB_API_KEY',
  'IMGBB_API_URL',
  'MAX_UPLOAD_SIZE_MB',
  'AUTH_USERNAME',
] as const;

const PatchEnv = z.object({
  databaseUrl: z.string().trim().min(1).optional(),
  imgbbApiKey: z.string().trim().min(1).optional(),
  imgbbApiUrl: z.string().trim().url().optional(),
  maxUploadSizeMb: z.number().min(1).max(500).optional(),
});

const PasswordChange = z.object({
  currentPassword: z.string().min(1, 'Current password is required.'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters.'),
});

/** Read all settings rows and merge with defaults. */
async function loadAllSettings(): Promise<Record<string, unknown>> {
  const rows = await db.select().from(settings);
  const result = { ...DEFAULTS };
  for (const row of rows) {
    if (row.key in result || Object.values(SETTINGS_KEYS).includes(row.key as never)) {
      result[row.key] = row.value;
    }
  }
  return result;
}

/** Upsert a single settings row by key. */
async function upsertSetting(key: string, value: unknown): Promise<void> {
  const { eq } = await import('drizzle-orm');
  const [existing] = await db.select().from(settings).where(eq(settings.key, key));
  if (existing) {
    await db.update(settings).set({ value, updatedAt: new Date() }).where(eq(settings.key, key));
  } else {
    await db.insert(settings).values({ key, value });
  }
}

/** GET /api/settings — everything the Settings page needs in one call. */
router.get('/', async (req, res) => {
  try {
    const liveSettings = await loadAllSettings();

    const envValues = await readEnvValues([...ENV_KEYS]);

    const [fileTotals] = await db.select({ fileCount: count(), totalSize: sum(files.size) }).from(files);
    const [albumTotals] = await db.select({ albumCount: count() }).from(albums);

    res.json({
      settings: liveSettings,
      env: {
        databaseUrl: maskSecret(envValues.DATABASE_URL, 12),
        imgbbApiKey: maskSecret(envValues.IMGBB_API_KEY, 4),
        imgbbApiUrl: envValues.IMGBB_API_URL ?? '',
        maxUploadSizeMb: Number(envValues.MAX_UPLOAD_SIZE_MB) || 32,
      },
      user: {
        username: req.session?.user ?? envValues.AUTH_USERNAME ?? 'admin',
      },
      storage: {
        fileCount: Number(fileTotals?.fileCount ?? 0),
        totalSize: Number(fileTotals?.totalSize ?? 0),
        albumCount: Number(albumTotals?.albumCount ?? 0),
      },
      rateLimit: {
        windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
        max: Number(process.env.RATE_LIMIT_MAX) || 1000,
      },
    });
  } catch (err) {
    console.error('[settings/get]', err);
    res.status(500).json({ error: 'Failed to load settings.' });
  }
});

/** PATCH /api/settings — update DB-backed (instant, no restart) settings. */
router.patch('/', async (req, res) => {
  try {
    const parsed = PatchSettings.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });

    const updates = parsed.data;
    const keyMap: Record<string, string> = {
      theme: SETTINGS_KEYS.theme,
      defaultQuality: SETTINGS_KEYS.defaultQuality,
      defaultAlbumId: SETTINGS_KEYS.defaultAlbumId,
      galleryPageSize: SETTINGS_KEYS.galleryPageSize,
      confirmBeforeDelete: SETTINGS_KEYS.confirmBeforeDelete,
    };

    for (const [field, value] of Object.entries(updates)) {
      await upsertSetting(keyMap[field], value);
    }

    const liveSettings = await loadAllSettings();
    res.json({ ok: true, settings: liveSettings });
  } catch (err) {
    console.error('[settings/patch]', err);
    res.status(500).json({ error: 'Failed to update settings.' });
  }
});

/** PATCH /api/settings/env — update env-backed values. Writes .env on disk.
 * Does NOT take effect until the server restarts (Node reads env once at boot). */
router.patch('/env', async (req, res) => {
  try {
    const parsed = PatchEnv.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
    const { databaseUrl, imgbbApiKey, imgbbApiUrl, maxUploadSizeMb } = parsed.data;

    const toWrite: Record<string, string> = {};
    if (databaseUrl !== undefined) toWrite.DATABASE_URL = databaseUrl;
    if (imgbbApiKey !== undefined) toWrite.IMGBB_API_KEY = imgbbApiKey;
    if (imgbbApiUrl !== undefined) toWrite.IMGBB_API_URL = imgbbApiUrl;
    if (maxUploadSizeMb !== undefined) toWrite.MAX_UPLOAD_SIZE_MB = String(maxUploadSizeMb);

    if (!Object.keys(toWrite).length) {
      return res.status(400).json({ error: 'No values provided.' });
    }

    const result = await updateEnvValues(toWrite);
    res.json({
      ok: true,
      changed: [...result.updated, ...result.added],
      requiresRestart: true,
    });
  } catch (err) {
    console.error('[settings/env]', err);
    res.status(500).json({ error: 'Failed to update environment values.' });
  }
});

/** POST /api/settings/password — change the admin password.
 * Writes a new bcrypt hash to .env. Requires restart to take effect. */
router.post('/password', async (req, res) => {
  try {
    const parsed = PasswordChange.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
    const { currentPassword, newPassword } = parsed.data;

    const envValues = await readEnvValues(['AUTH_PASSWORD_HASH']);
    const currentHash = envValues.AUTH_PASSWORD_HASH;
    if (!currentHash) {
      return res.status(500).json({ error: 'No password hash configured on the server.' });
    }

    const matches = await bcrypt.compare(currentPassword, currentHash);
    if (!matches) {
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }

    const newHash = await bcrypt.hash(newPassword, 12);
    await updateEnvValues({ AUTH_PASSWORD_HASH: newHash });

    res.json({ ok: true, requiresRestart: true });
  } catch (err) {
    console.error('[settings/password]', err);
    res.status(500).json({ error: 'Failed to change password.' });
  }
});

/** POST /api/settings/restart — triggers a tsx watch restart by touching
 * server.ts (updating its mtime). tsx watch sees the file change and
 * restarts the process automatically. Works in dev (tsx watch) without
 * killing the server permanently. In production (plain node) it's a no-op
 * file touch — harmless, but won't restart anything without a process manager. */
router.post('/restart', async (_req, res) => {
  res.json({ ok: true, message: 'Server is restarting…' });
  setTimeout(async () => {
    try {
      // Touch src/server.ts so tsx watch detects a change and restarts
      const { utimes } = await import('node:fs/promises');
      const serverPath = new URL('../../server.ts', import.meta.url).pathname
        .replace(/^\/([A-Z]:)/, '$1'); // fix Windows path: /C:/... → C:/...
      const now = new Date();
      await utimes(serverPath, now, now);
      console.log('[settings] Touched server.ts — tsx watch will restart now.');
    } catch (err) {
      // Fallback: if touch fails (e.g. in production dist), just exit and
      // rely on the process manager (pm2, Docker, systemd) to bring it back.
      console.error('[settings] Touch failed, falling back to process.exit:', err);
      process.exit(0);
    }
  }, 300);
});

export default router;
