import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const helmetFn = (helmet as any).default ?? helmet;
import compression from 'compression';
import { rateLimit } from 'express-rate-limit';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import uploadsRouter  from './api/routes/uploads.js';
import dashboardRouter from './api/routes/dashboard.js';
import galleryRouter  from './api/routes/gallery.js';
import albumsRouter   from './api/routes/albums.js';
import tagsRouter     from './api/routes/tags.js';
import filesRouter    from './api/routes/files.js';
import qrRouter       from './api/routes/qr.js';
import searchRouter   from './api/routes/search.js';
import settingsRouter from './api/routes/settings.js';
import cleanupRouter  from './api/routes/cleanup.js';

import accountRouter from './api/routes/account.js';
import { requireAuth, attachTenant, handleLogin, handleLogout } from './middleware/auth.js';
import { ensureControlSchema } from './database/control.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app  = express();
const PORT = Number(process.env.PORT) || 3000;
const isProd = process.env.NODE_ENV === 'production';

// Trust Vercel's proxy so secure cookies work over HTTPS
if (isProd) app.set('trust proxy', 1);

// ── Security headers ──────────────────────────────────────
app.use(helmetFn({ contentSecurityPolicy: false }));
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Rate limiter ──────────────────────────────────────────
app.use(
  rateLimit({
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
    max: Number(process.env.RATE_LIMIT_MAX) || 1000,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => !isProd,
  }),
);

// ── Session store ─────────────────────────────────────────
const PgSession = connectPgSimple(session);
app.use(
  session({
    store: new PgSession({
      conString: process.env.DATABASE_URL,
      tableName: 'session',
      createTableIfMissing: true,
    }),
    name: 'seik.sid',
    secret: process.env.SESSION_SECRET!,
    resave: false,
    saveUninitialized: false,
    proxy: isProd,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProd,
      maxAge: 8 * 60 * 60 * 1000,
    },
  }),
);

// ── Public static (login + register page assets only) ────
// Only /css/theme.css and /login, /register themselves bypass auth
app.use('/css/theme.css', express.static(path.join(__dirname, '..', 'public', 'css', 'theme.css')));
app.get('/login', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'login.html'));
});
app.get('/register', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'register.html'));
});

// ── Auth endpoints (public) ───────────────────────────────
app.post('/auth/login',  handleLogin);
app.post('/auth/logout', handleLogout);
app.use('/auth', accountRouter);
app.get('/auth/requirements', (_req, res) => {
  res.json({
    appName: process.env.APP_NAME || 'Seik',
    fields: [
      { key: 'username', label: 'Username', hint: 'At least 3 characters. Used to sign in.' },
      { key: 'email', label: 'Email', hint: 'Used to sign in and recover your account.' },
      { key: 'password', label: 'Password', hint: 'At least 8 characters.' },
      {
        key: 'imgbbApiKey',
        label: 'ImgBB API key',
        hint: 'Your own free key from api.imgbb.com/ — every image you upload is stored on your ImgBB account, not the app owner\'s.',
      },
      {
        key: 'neonDatabaseUrl',
        label: 'Neon database connection string',
        hint: 'A free Postgres database from neon.tech — starts with postgresql://. Your albums, tags, and file records live here, fully separate from every other user.',
      },
    ],
  });
});

// ── Everything below requires a valid session ─────────────
app.use(requireAuth);
app.use(attachTenant);

// ── Protected static files ────────────────────────────────
app.use(express.static(path.join(__dirname, '..', 'public')));

// ── Protected API routes ──────────────────────────────────
app.use('/api/uploads',   uploadsRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/gallery',   galleryRouter);
app.use('/api/albums',    albumsRouter);
app.use('/api/tags',      tagsRouter);
app.use('/api/files',     filesRouter);
app.use('/api/qr',        qrRouter);
app.use('/api/search',    searchRouter);
app.use('/api/settings',  settingsRouter);
app.use('/api/cleanup',   cleanupRouter);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, app: process.env.APP_NAME || 'Seik' });
});

// ── Dynamic DB-backed detail pages ───────────────────────
app.get('/albums/:id', (_req, res) =>
  res.sendFile(path.join(__dirname, '..', 'public', 'album.html')));
app.get('/tags/:id', (_req, res) =>
  res.sendFile(path.join(__dirname, '..', 'public', 'tag.html')));

// ── Start ─────────────────────────────────────────────────
ensureControlSchema()
  .catch((err) => {
    console.error('[startup] failed to ensure control schema:', err);
  })
  .finally(() => {
    app.listen(PORT, () => {
      console.log(`Seik server running at http://localhost:${PORT}`);
    });
  });

export default app;
