/**
 * tenantBootstrap.ts
 *
 * Runs the full Seik schema (albums, files, tags, file_tags, upload_history,
 * settings, users) against a brand-new tenant Neon database the first time
 * an account is created or logs in and its DB is found empty. Mirrors
 * src/database/drizzle/0000_worthless_absorbing_man.sql exactly so tenant
 * DBs stay structurally identical to what `db:push` would produce.
 */

import { neon } from '@neondatabase/serverless';

const STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS "albums" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "parent_id" uuid,
    "name" text NOT NULL,
    "description" text,
    "cover_file_id" uuid,
    "favorite" boolean DEFAULT false NOT NULL,
    "pinned" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "tags" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "name" text NOT NULL,
    "slug" text NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "tags_slug_unique" UNIQUE("slug")
  )`,
  `CREATE TABLE IF NOT EXISTS "files" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "album_id" uuid REFERENCES "albums"("id") ON DELETE SET NULL,
    "filename" text NOT NULL,
    "original_filename" text NOT NULL,
    "mime_type" text NOT NULL,
    "extension" text NOT NULL,
    "size" integer NOT NULL,
    "original_size" integer DEFAULT 0 NOT NULL,
    "width" integer,
    "height" integer,
    "hash" text NOT NULL,
    "storage_provider" text DEFAULT 'imgbb' NOT NULL,
    "storage_key" text,
    "imgbb_id" text,
    "imgbb_url" text,
    "viewer_url" text,
    "thumb_url" text,
    "medium_url" text,
    "delete_url" text,
    "favorite" boolean DEFAULT false NOT NULL,
    "hidden" boolean DEFAULT false NOT NULL,
    "archived" boolean DEFAULT false NOT NULL,
    "metadata_json" jsonb,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    "expires_at" timestamp with time zone
  )`,
  `CREATE TABLE IF NOT EXISTS "file_tags" (
    "file_id" uuid NOT NULL REFERENCES "files"("id") ON DELETE CASCADE,
    "tag_id" uuid NOT NULL REFERENCES "tags"("id") ON DELETE CASCADE,
    CONSTRAINT "file_tags_file_id_tag_id_pk" PRIMARY KEY("file_id","tag_id")
  )`,
  `CREATE TABLE IF NOT EXISTS "upload_history" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "file_id" uuid NOT NULL REFERENCES "files"("id") ON DELETE CASCADE,
    "compression_quality" integer,
    "original_size" integer NOT NULL,
    "compressed_size" integer,
    "upload_duration" integer,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "settings" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "key" text NOT NULL,
    "value" jsonb,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "settings_key_unique" UNIQUE("key")
  )`,
  `CREATE TABLE IF NOT EXISTS "users" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "email" text NOT NULL,
    "name" text,
    "avatar" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "users_email_unique" UNIQUE("email")
  )`,
];

/**
 * Connects to the given tenant Neon connection string and creates every
 * Seik table if it doesn't already exist. Safe to call on every login —
 * each statement is idempotent (`IF NOT EXISTS`).
 */
export async function bootstrapTenantDatabase(neonDatabaseUrl: string): Promise<void> {
  const sql = neon(neonDatabaseUrl);
  for (const statement of STATEMENTS) {
    // neon-http's `sql` is callable two ways: tagged-template, or as an
    // ordinary function `sql(queryString, params?)` — there is no
    // `.query()`/`.unsafe()` method. Each DDL string is sent individually.
    // eslint-disable-next-line no-await-in-loop
    await sql(statement);
  }
}
