import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { rateLimit } from 'express-rate-limit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import uploadsRouter from './api/routes/uploads.js';
import dashboardRouter from './api/routes/dashboard.js';
import galleryRouter from './api/routes/gallery.js';
import albumsRouter from './api/routes/albums.js';
import tagsRouter from './api/routes/tags.js';
import filesRouter from './api/routes/files.js';
import qrRouter from './api/routes/qr.js';
import searchRouter from './api/routes/search.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(
  rateLimit({
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
    max: Number(process.env.RATE_LIMIT_MAX) || 300,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api/uploads', uploadsRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/gallery', galleryRouter);
app.use('/api/albums', albumsRouter);
app.use('/api/tags', tagsRouter);
app.use('/api/files', filesRouter);
app.use('/api/qr', qrRouter);
app.use('/api/search', searchRouter);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, app: process.env.APP_NAME || 'Seik' });
});

// ── Dynamic, DB-backed detail pages ────────────────────────
app.get('/albums/:id', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'album.html'));
});
app.get('/tags/:id', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'tag.html'));
});

app.listen(PORT, () => {
  console.log(`Seik server running at http://localhost:${PORT}`);
});

export default app;
