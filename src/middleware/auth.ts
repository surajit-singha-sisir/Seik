/**
 * Hard authentication middleware — hybrid edition.
 *
 * Two parallel login paths now feed the same session:
 *   1. Legacy admin — AUTH_USERNAME / AUTH_PASSWORD_HASH from .env, exactly
 *      as before. Uses the server's own DATABASE_URL + IMGBB_API_KEY.
 *   2. Registered account — row in the control-plane `accounts` table, with
 *      its own encrypted Neon URL + ImgBB key, resolved per-request via
 *      tenantContext.ts so every existing route keeps working unmodified.
 *
 * - Session-based: httpOnly, SameSite=Strict, Secure in production
 * - bcrypt password hashing (cost factor 12)
 * - Brute-force lockout: 5 failed attempts → 15-min lockout (shared bucket
 *   across both login paths, keyed by IP)
 */

import type { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { eq, or } from 'drizzle-orm';
import { controlDb, accounts } from '../database/control.js';
import { decryptSecret } from '../utils/crypto.js';
import {
  getOrCreateTenantContext,
  runWithTenant,
  type TenantContext,
} from '../database/tenantContext.js';
import { bootstrapTenantDatabase } from '../database/tenantBootstrap.js';

declare module 'express-session' {
  interface SessionData {
    authenticated?: boolean;
    user?: string;
    accountId?: string | null; // null/undefined = legacy admin session
  }
}

// ── Credentials from .env (legacy admin path) ─────────────
const AUTH_USERNAME      = process.env.AUTH_USERNAME      ?? '';
const AUTH_PASSWORD_HASH = process.env.AUTH_PASSWORD_HASH ?? '';

// ── Brute-force tracker (in-memory, keyed by IP) ──────────
interface AttemptRecord { count: number; lockedUntil: number | null; }
const loginAttempts = new Map<string, AttemptRecord>();
const MAX_ATTEMPTS  = 5;
const LOCKOUT_MS    = 15 * 60 * 1000; // 15 minutes

function getIP(req: Request): string {
  return (
    (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0].trim() ??
    req.socket.remoteAddress ??
    'unknown'
  );
}

function isLockedOut(ip: string): { locked: boolean; remainingMs: number } {
  const rec = loginAttempts.get(ip);
  if (!rec?.lockedUntil) return { locked: false, remainingMs: 0 };
  if (Date.now() < rec.lockedUntil) {
    return { locked: true, remainingMs: rec.lockedUntil - Date.now() };
  }
  loginAttempts.delete(ip);
  return { locked: false, remainingMs: 0 };
}

function recordFailure(ip: string): void {
  const rec = loginAttempts.get(ip) ?? { count: 0, lockedUntil: null };
  rec.count += 1;
  if (rec.count >= MAX_ATTEMPTS) rec.lockedUntil = Date.now() + LOCKOUT_MS;
  loginAttempts.set(ip, rec);
}

function clearAttempts(ip: string): void {
  loginAttempts.delete(ip);
}

// ── Route guard ───────────────────────────────────────────
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (req.session?.authenticated) {
    return next();
  }

  if (req.path.startsWith('/api/')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
}

/** Runs after requireAuth on every authenticated request — resolves the
 * correct tenant (or legacy admin) Drizzle client + ImgBB key and makes it
 * available to the rest of the request via AsyncLocalStorage, so every
 * existing `import { db } from '../../database/index.js'` resolves to the
 * right tenant transparently. */
export async function attachTenant(req: Request, res: Response, next: NextFunction): Promise<void> {
  const accountId = req.session?.accountId;

  if (!accountId) {
    // Legacy admin session — tenantContext.ts already falls back to
    // .env DATABASE_URL/IMGBB_API_KEY when no context is set, so just
    // continue without wrapping in runWithTenant.
    next();
    return;
  }

  try {
    const [account] = await controlDb.select().from(accounts).where(eq(accounts.id, accountId)).limit(1);
    if (!account || !account.active) {
      req.session.destroy(() => res.status(401).json({ error: 'Account not found or disabled.' }));
      return;
    }

    const neonUrl   = decryptSecret(account.neonDatabaseUrlEnc);
    const imgbbKey  = decryptSecret(account.imgbbApiKeyEnc);
    const ctx: TenantContext = getOrCreateTenantContext(
      account.id,
      neonUrl,
      imgbbKey,
      account.storageProvider,
    );

    runWithTenant(ctx, () => next());
  } catch (err) {
    console.error('[attachTenant] failed to resolve tenant:', err);
    res.status(500).json({ error: 'Failed to load your account database.' });
  }
}

// ── Login handler (POST /auth/login) ─────────────────────
export async function handleLogin(req: Request, res: Response): Promise<void> {
  const ip = getIP(req);
  const username = (req.body as { username?: string }).username ?? '';
  const password = (req.body as { password?: string }).password ?? '';
  const nextFromBody = (req.body as { next?: string }).next;

  const { locked, remainingMs } = isLockedOut(ip);
  if (locked) {
    const mins = Math.ceil(remainingMs / 60_000);
    res.status(429).json({
      error: `Too many failed attempts. Try again in ${mins} minute${mins !== 1 ? 's' : ''}.`,
    });
    return;
  }

  if (!username || !password) {
    recordFailure(ip);
    res.status(401).json({ error: 'Invalid credentials.' });
    return;
  }

  // ── Path 1: legacy admin (.env) ──────────────────────────
  if (AUTH_USERNAME && AUTH_PASSWORD_HASH) {
    const usernameMatch = username.trim().toLowerCase() === AUTH_USERNAME.toLowerCase();
    const passwordMatch = usernameMatch && await bcrypt.compare(password, AUTH_PASSWORD_HASH);
    if (usernameMatch && passwordMatch) {
      return completeLogin(req, res, ip, username.trim(), null, nextFromBody);
    }
  }

  // ── Path 2: registered account ───────────────────────────
  try {
    const [account] = await controlDb
      .select()
      .from(accounts)
      .where(or(eq(accounts.username, username.trim()), eq(accounts.email, username.trim().toLowerCase())))
      .limit(1);

    if (account && account.active) {
      const passwordMatch = await bcrypt.compare(password, account.passwordHash);
      if (passwordMatch) {
        await controlDb.update(accounts).set({ lastLoginAt: new Date() }).where(eq(accounts.id, account.id));
        return completeLogin(req, res, ip, account.username, account.id, nextFromBody);
      }
    }
  } catch (err) {
    console.error('[login] account lookup failed:', err);
  }

  recordFailure(ip);
  const attemptsLeft = MAX_ATTEMPTS - (loginAttempts.get(ip)?.count ?? 0);
  res.status(401).json({
    error: `Invalid credentials. ${
      attemptsLeft > 0
        ? `${attemptsLeft} attempt${attemptsLeft !== 1 ? 's' : ''} remaining.`
        : 'Account locked.'
    }`,
  });
}

function completeLogin(
  req: Request,
  res: Response,
  ip: string,
  username: string,
  accountId: string | null,
  nextFromBody: unknown,
): void {
  clearAttempts(ip);
  req.session.authenticated = true;
  req.session.user = username;
  req.session.accountId = accountId;

  const isSafeNext = typeof nextFromBody === 'string' && /^\/(?!\/)/.test(nextFromBody);
  const redirectTo = isSafeNext ? nextFromBody : '/';

  req.session.save((err) => {
    if (err) {
      res.status(500).json({ error: 'Session save failed.' });
      return;
    }
    res.json({ ok: true, redirect: redirectTo });
  });
}

// ── Logout handler (POST /auth/logout) ───────────────────
export function handleLogout(req: Request, res: Response): void {
  req.session.destroy(() => {
    res.clearCookie('seik.sid');
    res.json({ ok: true });
  });
}

// Re-exported for the registration route, which needs to bootstrap a brand
// new tenant database right after creating its `accounts` row.
export { bootstrapTenantDatabase };
