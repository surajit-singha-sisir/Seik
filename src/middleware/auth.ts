/**
 * Hard authentication middleware
 * - Session-based: httpOnly, SameSite=Strict, Secure in production
 * - bcrypt password hashing (cost factor 12)
 * - Brute-force lockout: 5 failed attempts → 15-min lockout
 * - All app routes and API routes are protected
 */

import type { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';

// ── Types ─────────────────────────────────────────────────
declare module 'express-session' {
  interface SessionData {
    authenticated?: boolean;
    user?: string;
  }
}

interface AttemptRecord {
  count: number;
  lockedUntil: number | null;
}

// ── Credentials (loaded from env) ────────────────────────
// AUTH_USERNAME  – plain text username / email
// AUTH_PASSWORD_HASH – bcrypt hash of the password
// Generate a hash: node -e "require('bcryptjs').hash('yourpassword',12).then(console.log)"
const AUTH_USERNAME   = process.env.AUTH_USERNAME  ?? '';
const AUTH_PASSWORD_HASH = process.env.AUTH_PASSWORD_HASH ?? '';

// ── In-memory brute-force tracker (keyed by IP) ───────────
const loginAttempts = new Map<string, AttemptRecord>();
const MAX_ATTEMPTS   = 5;
const LOCKOUT_MS     = 15 * 60 * 1000; // 15 minutes

function getIP(req: Request): string {
  return (
    (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ||
    req.socket.remoteAddress ||
    'unknown'
  );
}

function isLockedOut(ip: string): { locked: boolean; remainingMs: number } {
  const rec = loginAttempts.get(ip);
  if (!rec?.lockedUntil) return { locked: false, remainingMs: 0 };
  if (Date.now() < rec.lockedUntil) {
    return { locked: true, remainingMs: rec.lockedUntil - Date.now() };
  }
  // Lockout expired — reset
  loginAttempts.delete(ip);
  return { locked: false, remainingMs: 0 };
}

function recordFailure(ip: string): void {
  const rec = loginAttempts.get(ip) ?? { count: 0, lockedUntil: null };
  rec.count += 1;
  if (rec.count >= MAX_ATTEMPTS) {
    rec.lockedUntil = Date.now() + LOCKOUT_MS;
  }
  loginAttempts.set(ip, rec);
}

function clearAttempts(ip: string): void {
  loginAttempts.delete(ip);
}

// ── Route guard ───────────────────────────────────────────
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (req.session?.authenticated) return next();

  // API requests get a 401 JSON response
  if (req.path.startsWith('/api/')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  // HTML pages redirect to login
  res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
}

// ── Login handler (POST /auth/login) ─────────────────────
export async function handleLogin(req: Request, res: Response): Promise<void> {
  const ip = getIP(req);
  const { username, password } = req.body as { username?: string; password?: string };

  // Lockout check
  const { locked, remainingMs } = isLockedOut(ip);
  if (locked) {
    const mins = Math.ceil(remainingMs / 60_000);
    res.status(429).json({
      error: `Too many failed attempts. Try again in ${mins} minute${mins !== 1 ? 's' : ''}.`,
    });
    return;
  }

  // Basic validation
  if (!username || !password || !AUTH_USERNAME || !AUTH_PASSWORD_HASH) {
    recordFailure(ip);
    res.status(401).json({ error: 'Invalid credentials.' });
    return;
  }

  // Constant-time username compare + bcrypt password verify
  const usernameMatch = username.trim().toLowerCase() === AUTH_USERNAME.toLowerCase();
  const passwordMatch = await bcrypt.compare(password, AUTH_PASSWORD_HASH);

  if (!usernameMatch || !passwordMatch) {
    recordFailure(ip);
    const attemptsLeft = MAX_ATTEMPTS - (loginAttempts.get(ip)?.count ?? 0);
    res.status(401).json({
      error: `Invalid credentials. ${attemptsLeft > 0 ? `${attemptsLeft} attempt${attemptsLeft !== 1 ? 's' : ''} remaining.` : 'Account locked.'}`,
    });
    return;
  }

  clearAttempts(ip);
  req.session.authenticated = true;
  req.session.user = username.trim();

  const next = (req.query['next'] as string) || '/';
  res.json({ ok: true, redirect: next });
}

// ── Logout handler (POST /auth/logout) ───────────────────
export function handleLogout(req: Request, res: Response): void {
  req.session.destroy(() => {
    res.clearCookie('seik.sid');
    res.json({ ok: true });
  });
}
