/**
 * control.ts
 *
 * The control-plane database client — always points at process.env.DATABASE_URL,
 * regardless of which user is logged in. This is the same Neon DB that already
 * backs the express-session store, so no new connection string is required.
 *
 * Holds the `accounts` registry (see controlSchema.ts). Self-bootstraps its
 * own table on server start so no manual `db:migrate` step is needed for
 * existing installs upgrading to the hybrid multi-tenant model.
 */

import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as controlSchema from './controlSchema.js';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Copy .env.example to .env and configure it.');
}

const controlSql = neon(process.env.DATABASE_URL);

export const controlDb = drizzle(controlSql, { schema: controlSchema });

export * from './controlSchema.js';

/** Idempotent bootstrap — safe to call on every server start.
 *  neon-http's tagged-template `sql` is the only query form it exposes
 *  (no `.query()` method like node-postgres), so DDL must go through it. */
export async function ensureControlSchema(): Promise<void> {
  await controlSql`
    CREATE TABLE IF NOT EXISTS "accounts" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "username" text NOT NULL UNIQUE,
      "email" text NOT NULL UNIQUE,
      "password_hash" text NOT NULL,
      "imgbb_api_key_enc" text NOT NULL,
      "neon_database_url_enc" text NOT NULL,
      "storage_provider" text NOT NULL DEFAULT 'imgbb',
      "active" boolean NOT NULL DEFAULT true,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
      "last_login_at" timestamp with time zone
    )
  `;
  console.log('[control] accounts table ready.');
}
