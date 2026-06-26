# Seik

Professional image & document management platform — ImgBB for storage, Neon Postgres for metadata, Vercel for hosting.

## Status

**Phase 1 — Project Setup:** ✅ done
- Folder structure, `package.json`, `tsconfig.json`, `.env.example`, `.gitignore`, `vercel.json`

**Phase 2 — Database Schema:** ✅ done
- Full Drizzle schema (`users`, `files`, `albums`, `tags`, `file_tags`, `upload_history`, `settings`) with relations and inferred types in `src/database/schema.ts`
- Neon connection in `src/database/index.ts`

**Phase 3 — Storage Provider Layer:** ✅ scaffolded
- `StorageProvider` interface + `ImgbbStorageProvider` implementation + provider factory in `src/api/storage/`

**Phase 4 onward** (upload pipeline, compression, gallery, search, viewers, dashboard, mobile UI, docs): not started yet.

## Getting started

```bash
npm install
cp .env.example .env   # fill in DATABASE_URL and IMGBB_API_KEY
npm run db:push        # push schema to Neon
npm run dev             # start dev server on PORT (default 3000)
```
