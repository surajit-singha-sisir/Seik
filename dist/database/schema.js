import { pgTable, uuid, text, integer, boolean, timestamp, jsonb, primaryKey, } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
// ─────────────────────────────────────────────
// users
// ─────────────────────────────────────────────
export const users = pgTable('users', {
    id: uuid('id').defaultRandom().primaryKey(),
    email: text('email').notNull().unique(),
    name: text('name'),
    avatar: text('avatar'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
// ─────────────────────────────────────────────
// albums
// ─────────────────────────────────────────────
export const albums = pgTable('albums', {
    id: uuid('id').defaultRandom().primaryKey(),
    parentId: uuid('parent_id'),
    name: text('name').notNull(),
    description: text('description'),
    coverFileId: uuid('cover_file_id'),
    favorite: boolean('favorite').default(false).notNull(),
    pinned: boolean('pinned').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
// ─────────────────────────────────────────────
// files
// ─────────────────────────────────────────────
export const files = pgTable('files', {
    id: uuid('id').defaultRandom().primaryKey(),
    albumId: uuid('album_id').references(() => albums.id, { onDelete: 'set null' }),
    filename: text('filename').notNull(),
    originalFilename: text('original_filename').notNull(),
    mimeType: text('mime_type').notNull(),
    extension: text('extension').notNull(),
    size: integer('size').notNull(),
    originalSize: integer('original_size').notNull().default(0),
    width: integer('width'),
    height: integer('height'),
    hash: text('hash').notNull(),
    storageProvider: text('storage_provider').notNull().default('imgbb'),
    storageKey: text('storage_key'),
    imgbbId: text('imgbb_id'),
    imgbbUrl: text('imgbb_url'),
    viewerUrl: text('viewer_url'),
    thumbUrl: text('thumb_url'),
    mediumUrl: text('medium_url'),
    deleteUrl: text('delete_url'),
    favorite: boolean('favorite').default(false).notNull(),
    hidden: boolean('hidden').default(false).notNull(),
    archived: boolean('archived').default(false).notNull(),
    metadataJson: jsonb('metadata_json'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
});
// ─────────────────────────────────────────────
// tags
// ─────────────────────────────────────────────
export const tags = pgTable('tags', {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
// ─────────────────────────────────────────────
// file_tags (join table)
// ─────────────────────────────────────────────
export const fileTags = pgTable('file_tags', {
    fileId: uuid('file_id').notNull().references(() => files.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }),
}, (t) => ({
    pk: primaryKey({ columns: [t.fileId, t.tagId] }),
}));
// ─────────────────────────────────────────────
// upload_history
// ─────────────────────────────────────────────
export const uploadHistory = pgTable('upload_history', {
    id: uuid('id').defaultRandom().primaryKey(),
    fileId: uuid('file_id').notNull().references(() => files.id, { onDelete: 'cascade' }),
    compressionQuality: integer('compression_quality'),
    originalSize: integer('original_size').notNull(),
    compressedSize: integer('compressed_size'),
    uploadDuration: integer('upload_duration'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
// ─────────────────────────────────────────────
// settings
// ─────────────────────────────────────────────
export const settings = pgTable('settings', {
    id: uuid('id').defaultRandom().primaryKey(),
    key: text('key').notNull().unique(),
    value: jsonb('value'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
// ─────────────────────────────────────────────
// Relations
// ─────────────────────────────────────────────
export const albumsRelations = relations(albums, ({ one, many }) => ({
    parent: one(albums, { fields: [albums.parentId], references: [albums.id] }),
    files: many(files),
    coverFile: one(files, { fields: [albums.coverFileId], references: [files.id] }),
}));
export const filesRelations = relations(files, ({ one, many }) => ({
    album: one(albums, { fields: [files.albumId], references: [albums.id] }),
    fileTags: many(fileTags),
    uploadHistory: many(uploadHistory),
}));
export const tagsRelations = relations(tags, ({ many }) => ({
    fileTags: many(fileTags),
}));
export const fileTagsRelations = relations(fileTags, ({ one }) => ({
    file: one(files, { fields: [fileTags.fileId], references: [files.id] }),
    tag: one(tags, { fields: [fileTags.tagId], references: [tags.id] }),
}));
export const uploadHistoryRelations = relations(uploadHistory, ({ one }) => ({
    file: one(files, { fields: [uploadHistory.fileId], references: [files.id] }),
}));
//# sourceMappingURL=schema.js.map