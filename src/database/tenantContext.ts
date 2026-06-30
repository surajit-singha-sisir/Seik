/**
 * tenantContext.ts
 *
 * Per-request tenant state, propagated via Node's AsyncLocalStorage so that
 * every existing route/service — which all `import { db } from
 * '../../database/index.js'` — keeps working completely unmodified. The
 * `db` export there becomes a Proxy that forwards to whichever tenant's
 * Drizzle client is active for the current request.
 *
 * Two modes of operation:
 *   1. Legacy/admin — no account row, falls back to the single DATABASE_URL
 *      + IMGBB_API_KEY already configured in .env. This is what already
 *      shipped before the hybrid model and keeps working unchanged.
 *   2. Tenant — req.session.accountId is set after a registered user logs
 *      in. Their own Neon URL + ImgBB key (decrypted from the control-plane
 *      `accounts` row) are loaded once per login and cached for the
 *      session's lifetime in `tenantCache`.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { neon } from '@neondatabase/serverless';
import { drizzle, type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import * as schema from './schema.js';

export interface TenantContext {
  accountId: string | null;     // null = legacy single-tenant (.env) mode
  db: NeonHttpDatabase<typeof schema>;
  imgbbApiKey: string;
  storageProvider: string;
}

const als = new AsyncLocalStorage<TenantContext>();

// ── Legacy/admin fallback client — built once, lazily ─────
let legacyContext: TenantContext | null = null;
function getLegacyContext(): TenantContext {
  if (legacyContext) return legacyContext;
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set. Copy .env.example to .env and configure it.');
  }
  const sql = neon(process.env.DATABASE_URL);
  legacyContext = {
    accountId: null,
    db: drizzle(sql, { schema }),
    imgbbApiKey: process.env.IMGBB_API_KEY || '',
    storageProvider: process.env.STORAGE_PROVIDER || 'imgbb',
  };
  return legacyContext;
}

// ── Per-account tenant client cache (keyed by accountId) ──
// Avoids reconnecting on every single request within the same login session.
const tenantCache = new Map<string, TenantContext>();

export function getOrCreateTenantContext(
  accountId: string,
  neonDatabaseUrl: string,
  imgbbApiKey: string,
  storageProvider: string,
): TenantContext {
  const cached = tenantCache.get(accountId);
  if (cached) return cached;

  const sql = neon(neonDatabaseUrl);
  const ctx: TenantContext = {
    accountId,
    db: drizzle(sql, { schema }),
    imgbbApiKey,
    storageProvider,
  };
  tenantCache.set(accountId, ctx);
  return ctx;
}

/** Drop a cached tenant client — call when an account's secrets change. */
export function invalidateTenantContext(accountId: string): void {
  tenantCache.delete(accountId);
}

/** Runs `fn` with the given tenant context active for its entire async call tree. */
export function runWithTenant<T>(ctx: TenantContext, fn: () => T): T {
  return als.run(ctx, fn);
}

/** Reads the active tenant context, falling back to legacy/admin mode
 *  outside of any request (e.g. scripts) or if context wasn't set. */
export function getTenantContext(): TenantContext {
  return als.getStore() ?? getLegacyContext();
}
