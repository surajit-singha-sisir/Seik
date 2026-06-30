/**
 * account.ts
 *
 * Public (unauthenticated) registration endpoint. Each new account brings
 * its own ImgBB key and its own Neon database — the "hybrid" model where
 * the app itself stays single-deployment but every user's data and image
 * storage are fully isolated under their own credentials.
 *
 * Flow:
 *   1. Validate shape (zod)
 *   2. Live-verify the ImgBB key (tiny throwaway upload) and the Neon URL
 *      (SELECT 1) — fail fast with a specific reason before writing anything
 *   3. Reject duplicate username/email
 *   4. Bootstrap the full Seik schema on the user's own Neon database
 *   5. Encrypt both secrets (AES-256-GCM, key derived from SESSION_SECRET)
 *      and insert the account row
 *   6. Log the new user straight in (same session shape as /auth/login)
 */

import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { eq, or } from 'drizzle-orm';
import { controlDb, accounts } from '../../database/control.js';
import { encryptSecret } from '../../utils/crypto.js';
import { verifyImgbbKey, verifyNeonConnection } from '../../utils/accountVerify.js';
import { bootstrapTenantDatabase } from '../../database/tenantBootstrap.js';

const router = Router();

const RegisterSchema = z.object({
  username: z.string().trim().min(3, 'Username must be at least 3 characters.').max(32),
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
  imgbbApiKey: z.string().trim().min(10, 'Enter your ImgBB API key.'),
  neonDatabaseUrl: z.string().trim().min(10, 'Enter your Neon connection string.'),
});

router.post('/register', async (req, res) => {
  const parsed = RegisterSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input.' });
    return;
  }
  const { username, email, password, imgbbApiKey, neonDatabaseUrl } = parsed.data;

  // ── Duplicate check ───────────────────────────────────────
  const [existing] = await controlDb
    .select({ id: accounts.id })
    .from(accounts)
    .where(or(eq(accounts.username, username), eq(accounts.email, email)))
    .limit(1);
  if (existing) {
    res.status(409).json({ error: 'That username or email is already registered.' });
    return;
  }

  // ── Live verification — fail fast, before touching anything ──
  const [imgbbResult, neonResult] = await Promise.all([
    verifyImgbbKey(imgbbApiKey),
    verifyNeonConnection(neonDatabaseUrl),
  ]);
  if (!imgbbResult.ok) {
    res.status(400).json({ error: imgbbResult.reason, field: 'imgbbApiKey' });
    return;
  }
  if (!neonResult.ok) {
    res.status(400).json({ error: neonResult.reason, field: 'neonDatabaseUrl' });
    return;
  }

  try {
    // ── Bootstrap the user's own database with the Seik schema ──
    await bootstrapTenantDatabase(neonDatabaseUrl);

    // ── Persist the account, secrets encrypted at rest ──────────
    const passwordHash = await bcrypt.hash(password, 12);
    const [account] = await controlDb
      .insert(accounts)
      .values({
        username,
        email,
        passwordHash,
        imgbbApiKeyEnc: encryptSecret(imgbbApiKey),
        neonDatabaseUrlEnc: encryptSecret(neonDatabaseUrl),
        storageProvider: 'imgbb',
      })
      .returning();

    // ── Log straight in ──────────────────────────────────────────
    req.session.authenticated = true;
    req.session.user = account.username;
    req.session.accountId = account.id;
    req.session.save((err) => {
      if (err) {
        res.status(500).json({ error: 'Account created, but session save failed. Please sign in.' });
        return;
      }
      res.json({ ok: true, redirect: '/' });
    });
  } catch (err) {
    console.error('[register] failed:', err);
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Registration failed. Please try again.',
    });
  }
});

export default router;
