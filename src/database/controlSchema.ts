/**
 * controlSchema.ts
 *
 * The "control plane" schema — lives in the master DATABASE_URL (the one
 * already configured in .env). Holds account registry only: who exists,
 * their login credentials, and their *own* encrypted ImgBB key + Neon DB
 * connection string. Actual photo/file/album data never touches this DB —
 * it lives in each user's own tenant database (see tenantBootstrap.ts).
 */

import { pgTable, uuid, text, timestamp, boolean } from 'drizzle-orm/pg-core';

export const accounts = pgTable('accounts', {
  id: uuid('id').defaultRandom().primaryKey(),
  username: text('username').notNull().unique(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),

  // Encrypted with src/utils/crypto.ts (AES-256-GCM, key derived from SESSION_SECRET)
  imgbbApiKeyEnc: text('imgbb_api_key_enc').notNull(),
  neonDatabaseUrlEnc: text('neon_database_url_enc').notNull(),

  storageProvider: text('storage_provider').notNull().default('imgbb'),
  active: boolean('active').notNull().default(true),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
});

export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
