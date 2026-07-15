/**
 * Suncoast Signages — Cloudflare Worker API
 *
 * - D1 (binding DB): screens, groups, content metadata, websites, folders,
 *   reports, users, settings
 * - R2 (binding MEDIA): uploaded image/video files, served from /media/*
 * - Static assets (binding ASSETS): the built React admin app + player
 *
 * Auth: username/password accounts stored in D1 (PBKDF2-hashed). Login
 * returns an HMAC-signed expiring token keyed to the user's password hash,
 * so changing a password revokes that user's sessions. A default admin
 * account (admin / Suncoast#1234) is seeded on first run. Non-admin users
 * ("Members") can only control the screens they've been granted.
 * Player endpoints (/api/player/*, /media/*) are public so any TV/browser
 * can display a screen via its link.
 */
import { Hono } from 'hono';
import type { Context } from 'hono';

export interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  ASSETS: Fetcher;
  WORKSPACE_NAME?: string;
  // Set automatically by scripts/prepare-local.mjs during local dev: the
  // machine's LAN origin (e.g. http://192.168.1.23:8787) so the admin UI can
  // show player links that TVs on the same network can open. Unset in prod.
  LAN_ORIGIN?: string;
}

interface DbUser {
  id: string;
  name: string;
  username: string;
  password_hash: string;
  salt: string;
  role: string;
  allowed_screens: string; // '*' or JSON array of screen ids
}

const ONLINE_WINDOW_MS = 90_000; // player checks in every 30s
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_ADMIN_PASSWORD = 'Suncoast#1234';
const TRANSITIONS = ['none', 'fade', 'slide', 'slide-up', 'zoom', 'flip', 'wipe'];

// ---------------------------------------------------------------------------
// Schema bootstrap (runs once per isolate)
// ---------------------------------------------------------------------------
let schemaReady: Promise<void> | null = null;

function ensureSchema(db: D1Database): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      await db.batch([
        db.prepare(`CREATE TABLE IF NOT EXISTS screens (
          id TEXT PRIMARY KEY, name TEXT NOT NULL,
          device_type TEXT NOT NULL DEFAULT 'Web Player',
          orientation TEXT NOT NULL DEFAULT 'landscape',
          group_id TEXT, playlist TEXT NOT NULL DEFAULT '[]',
          last_check_in TEXT, ip_address TEXT, operating_hours TEXT, alert TEXT,
          delivery_mode TEXT NOT NULL DEFAULT 'stream',
          created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))`),
        db.prepare(`CREATE TABLE IF NOT EXISTS screen_groups (
          id TEXT PRIMARY KEY, name TEXT NOT NULL, playlist TEXT NOT NULL DEFAULT '[]',
          created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))`),
        db.prepare(`CREATE TABLE IF NOT EXISTS content (
          id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL,
          r2_key TEXT, url TEXT NOT NULL, thumbnail TEXT,
          size INTEGER NOT NULL DEFAULT 0, duration REAL, upload_date TEXT NOT NULL,
          folder_id TEXT, start_date TEXT, expiry_date TEXT,
          orientation TEXT NOT NULL DEFAULT 'landscape')`),
        db.prepare(`CREATE TABLE IF NOT EXISTS folders (
          id TEXT PRIMARY KEY, name TEXT NOT NULL, parent_id TEXT)`),
        db.prepare(`CREATE TABLE IF NOT EXISTS websites (
          id TEXT PRIMARY KEY, name TEXT NOT NULL, url TEXT NOT NULL, thumbnail TEXT)`),
        db.prepare(`CREATE TABLE IF NOT EXISTS reports (
          id TEXT PRIMARY KEY, content_name TEXT NOT NULL, screen_name TEXT NOT NULL,
          timestamp TEXT NOT NULL, duration REAL NOT NULL DEFAULT 0)`),
        db.prepare(`CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY, name TEXT NOT NULL, username TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL, salt TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'Member',
          allowed_screens TEXT NOT NULL DEFAULT '[]',
          created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))`),
        db.prepare(`CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY, value TEXT NOT NULL)`),
      ]);

      // Databases created before the delivery_mode column existed.
      await db
        .prepare("ALTER TABLE screens ADD COLUMN delivery_mode TEXT NOT NULL DEFAULT 'stream'")
        .run()
        .catch(() => undefined);

      // Seed the default admin account on a fresh database.
      const row = await db.prepare('SELECT COUNT(*) AS n FROM users').first<{ n: number }>();
      if (!row || row.n === 0) {
        const salt = randomHex(16);
        const hash = await pbkdf2Hex(DEFAULT_ADMIN_PASSWORD, salt);
        await db
          .prepare('INSERT INTO users (id, name, username, password_hash, salt, role, allowed_screens) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .bind(generateId(), 'Admin', 'admin', hash, salt, 'Admin', '*')
          .run();
      }
    })().catch((e) => {
      schemaReady = null;
      throw e;
    });
  }
  return schemaReady;
}

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------
function randomHex(bytes: number): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function pbkdf2Hex(password: string, saltHex: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const salt = new Uint8Array((saltHex.match(/../g) ?? []).map((h) => parseInt(h, 16)));
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100_000 }, key, 256);
  return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Token is keyed to the user's password hash so a password change (or user
// deletion) invalidates outstanding sessions for that user.
async function issueToken(user: DbUser): Promise<string> {
  const exp = Date.now() + TOKEN_TTL_MS;
  return `${user.id}.${exp}.${await hmacHex(user.password_hash, `${user.id}:${exp}`)}`;
}

async function verifyTokenAndGetUser(db: D1Database, token: string): Promise<DbUser | null> {
  const [uid, expStr, sig] = token.split('.');
  if (!uid || !expStr || !sig) return null;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Date.now()) return null;
  const user = await db.prepare('SELECT * FROM users WHERE id = ?').bind(uid).first<DbUser>();
  if (!user) return null;
  const expected = await hmacHex(user.password_hash, `${uid}:${expStr}`);
  return timingSafeEqual(sig, expected) ? user : null;
}

function publicUser(u: DbUser) {
  return {
    id: u.id,
    name: u.name,
    username: u.username,
    email: u.username,
    role: u.role,
    allowedScreens: u.allowed_screens === '*' ? '*' : parseJSON<string[]>(u.allowed_screens, []),
  };
}

function canControlScreen(u: DbUser, screenId: string): boolean {
  if (u.role === 'Admin' || u.allowed_screens === '*') return true;
  return parseJSON<string[]>(u.allowed_screens, []).includes(screenId);
}

async function getTransition(db: D1Database): Promise<string> {
  const row = await db.prepare("SELECT value FROM settings WHERE key = 'transition'").first<{ value: string }>();
  return row && TRANSITIONS.includes(row.value) ? row.value : 'fade';
}

// ---------------------------------------------------------------------------
// Row <-> API object mapping
// ---------------------------------------------------------------------------
function parseJSON<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string' || !value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function screenStatus(lastCheckIn: string | null): 'Online' | 'Offline' | 'Never Connected' {
  if (!lastCheckIn) return 'Never Connected';
  return Date.now() - Date.parse(lastCheckIn) < ONLINE_WINDOW_MS ? 'Online' : 'Offline';
}

function rowToScreen(row: Record<string, unknown>) {
  return {
    id: row.id,
    workspaceId: 'ws-1',
    name: row.name,
    status: screenStatus(row.last_check_in as string | null),
    playlist: parseJSON(row.playlist, []),
    groupId: row.group_id ?? undefined,
    deviceType: row.device_type,
    lastCheckIn: row.last_check_in ?? undefined,
    orientation: row.orientation,
    deliveryMode: (row.delivery_mode as string) || 'stream',
    ipAddress: row.ip_address ?? undefined,
    operatingHours: parseJSON(row.operating_hours, undefined),
    alert: parseJSON(row.alert, undefined),
  };
}

function rowToGroup(row: Record<string, unknown>) {
  return {
    id: row.id,
    workspaceId: 'ws-1',
    name: row.name,
    playlist: parseJSON(row.playlist, []),
  };
}

function rowToContent(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    url: row.url,
    thumbnail: row.thumbnail ?? undefined,
    size: row.size ?? 0,
    duration: row.duration ?? undefined,
    uploadDate: row.upload_date,
    folderId: row.folder_id ?? undefined,
    startDate: row.start_date ?? undefined,
    expiryDate: row.expiry_date ?? undefined,
    orientation: row.orientation,
  };
}

function generateId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120) || 'file';
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------
type AppEnv = { Bindings: Env; Variables: { user: DbUser } };

const app = new Hono<AppEnv>();

app.use('*', async (c, next) => {
  await ensureSchema(c.env.DB);
  await next();
});

// --- Media from R2 (public, supports video range requests + downloads) ------
app.get('/media/*', async (c) => {
  const url = new URL(c.req.url);
  const key = decodeURIComponent(url.pathname.replace(/^\//, ''));
  const asDownload = url.searchParams.has('download');
  const rangeHeader = c.req.header('Range');

  const downloadHeaders: Record<string, string> = asDownload
    ? { 'Content-Disposition': `attachment; filename="${sanitizeFilename(key.split('/').pop() || 'file')}"` }
    : {};

  let object: R2ObjectBody | R2Object | null;
  let range: { offset: number; length?: number } | undefined;

  const match = rangeHeader?.match(/^bytes=(\d*)-(\d*)$/);
  if (match && (match[1] || match[2])) {
    const head = await c.env.MEDIA.head(key);
    if (!head) return c.text('Not found', 404);
    const size = head.size;
    const start = match[1] ? parseInt(match[1], 10) : size - parseInt(match[2], 10);
    const end = match[1] && match[2] ? Math.min(parseInt(match[2], 10), size - 1) : size - 1;
    if (start >= size || start < 0 || start > end) {
      return c.body(null, 416, { 'Content-Range': `bytes */${size}` });
    }
    range = { offset: start, length: end - start + 1 };
    object = await c.env.MEDIA.get(key, { range });
    if (!object || !('body' in object)) return c.text('Not found', 404);
    return c.body(object.body as ReadableStream, 206, {
      'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream',
      'Content-Length': String(range.length),
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=31536000, immutable',
    });
  }

  object = await c.env.MEDIA.get(key);
  if (!object || !('body' in object)) return c.text('Not found', 404);
  return c.body(object.body as ReadableStream, 200, {
    'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream',
    'Content-Length': String(object.size),
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'public, max-age=31536000, immutable',
    ...downloadHeaders,
  });
});

// --- Public player endpoints -------------------------------------------------
app.get('/api/player/:id', async (c) => {
  const id = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT * FROM screens WHERE id = ?').bind(id).first<Record<string, unknown>>();
  if (!row) return c.json({ error: 'Screen not found' }, 404);

  // Record the check-in (this doubles as the heartbeat).
  const ip = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || null;
  await c.env.DB.prepare('UPDATE screens SET last_check_in = ?, ip_address = COALESCE(?, ip_address) WHERE id = ?')
    .bind(new Date().toISOString(), ip, id)
    .run();

  const screen = rowToScreen(row) as { playlist: Array<{ sourceId: string; type: string }>; groupId?: string } & Record<string, unknown>;
  screen.status = 'Online';
  screen.lastCheckIn = new Date().toISOString();

  // A screen in a group plays the group playlist (its own playlist is a fallback).
  if (screen.groupId) {
    const group = await c.env.DB.prepare('SELECT * FROM screen_groups WHERE id = ?')
      .bind(screen.groupId)
      .first<Record<string, unknown>>();
    const groupPlaylist = group ? (parseJSON(group.playlist, []) as typeof screen.playlist) : [];
    if (groupPlaylist.length > 0) screen.playlist = groupPlaylist;
  }

  const [contentRows, websiteRows, transition] = await Promise.all([
    c.env.DB.prepare('SELECT * FROM content').all<Record<string, unknown>>(),
    c.env.DB.prepare('SELECT * FROM websites').all<Record<string, unknown>>(),
    getTransition(c.env.DB),
  ]);

  return c.json({
    screen,
    content: (contentRows.results ?? []).map(rowToContent),
    websites: websiteRows.results ?? [],
    settings: { transition },
    // Players schedule the playlist against this clock so every device on the
    // same link shows the same item at the same moment.
    serverTime: Date.now(),
  });
});

app.post('/api/player/:id/checkin', async (c) => {
  const id = c.req.param('id');
  const ip = c.req.header('CF-Connecting-IP') || null;
  await c.env.DB.prepare('UPDATE screens SET last_check_in = ?, ip_address = COALESCE(?, ip_address) WHERE id = ?')
    .bind(new Date().toISOString(), ip, id)
    .run();
  return c.json({ ok: true });
});

app.post('/api/player/:id/report', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{ contentName?: string; duration?: number }>().catch(() => ({}) as { contentName?: string; duration?: number });
  if (!body.contentName) return c.json({ error: 'contentName required' }, 400);
  const screen = await c.env.DB.prepare('SELECT name FROM screens WHERE id = ?').bind(id).first<{ name: string }>();
  if (!screen) return c.json({ error: 'Screen not found' }, 404);
  await c.env.DB.prepare('INSERT INTO reports (id, content_name, screen_name, timestamp, duration) VALUES (?, ?, ?, ?, ?)')
    .bind(generateId(), body.contentName, screen.name, new Date().toISOString(), body.duration ?? 0)
    .run();
  return c.json({ ok: true });
});

// --- Auth ---------------------------------------------------------------------
app.post('/api/auth/login', async (c) => {
  const body = await c.req.json<{ username?: string; password?: string }>().catch(() => ({}) as { username?: string; password?: string });
  if (!body.username || !body.password) return c.json({ error: 'Username and password required' }, 400);
  const user = await c.env.DB.prepare('SELECT * FROM users WHERE username = ?')
    .bind(body.username.toLowerCase().trim())
    .first<DbUser>();
  if (!user) return c.json({ error: 'Incorrect username or password' }, 401);
  const hash = await pbkdf2Hex(body.password, user.salt);
  if (!timingSafeEqual(hash, user.password_hash)) return c.json({ error: 'Incorrect username or password' }, 401);
  return c.json({ token: await issueToken(user), user: publicUser(user) });
});

// --- Admin auth middleware ------------------------------------------------------
app.use('/api/*', async (c, next) => {
  const path = new URL(c.req.url).pathname;
  if (path === '/api/auth/login' || path.startsWith('/api/player/')) return next();
  const auth = c.req.header('Authorization');
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : undefined;
  const user = token ? await verifyTokenAndGetUser(c.env.DB, token) : null;
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  c.set('user', user);
  return next();
});

function adminOnly(c: Context<AppEnv>): Response | null {
  if (c.get('user').role !== 'Admin') return c.json({ error: 'Admin access required' }, 403);
  return null;
}

// --- Workspace / user ----------------------------------------------------------
app.get('/api/me', (c) =>
  c.json({
    workspace: { id: 'ws-1', name: c.env.WORKSPACE_NAME || 'Suncoast Signages' },
    user: publicUser(c.get('user')),
    playerOrigin: c.env.LAN_ORIGIN || null,
  }),
);

app.post('/api/me/password', async (c) => {
  const user = c.get('user');
  const body = await c.req
    .json<{ currentPassword?: string; newPassword?: string }>()
    .catch(() => ({}) as { currentPassword?: string; newPassword?: string });
  if (!body.currentPassword || !body.newPassword) return c.json({ error: 'Current and new password required' }, 400);
  if (body.newPassword.length < 8) return c.json({ error: 'New password must be at least 8 characters' }, 400);
  const hash = await pbkdf2Hex(body.currentPassword, user.salt);
  if (!timingSafeEqual(hash, user.password_hash)) return c.json({ error: 'Current password is incorrect' }, 401);
  const salt = randomHex(16);
  const newHash = await pbkdf2Hex(body.newPassword, salt);
  await c.env.DB.prepare('UPDATE users SET password_hash = ?, salt = ? WHERE id = ?').bind(newHash, salt, user.id).run();
  // Old tokens are now invalid; hand back a fresh one so this session survives.
  return c.json({ ok: true, token: await issueToken({ ...user, password_hash: newHash, salt }) });
});

// --- Users (admin only) ----------------------------------------------------------
app.get('/api/users', async (c) => {
  const denied = adminOnly(c);
  if (denied) return denied;
  const { results } = await c.env.DB.prepare('SELECT * FROM users ORDER BY created_at').all<DbUser>();
  return c.json((results ?? []).map(publicUser));
});

app.post('/api/users', async (c) => {
  const denied = adminOnly(c);
  if (denied) return denied;
  const body = await c.req
    .json<{ name?: string; username?: string; password?: string; role?: string; allowedScreens?: string[] }>()
    .catch(() => ({}) as Record<string, never>);
  if (!body.name || !body.username || !body.password) return c.json({ error: 'name, username and password required' }, 400);
  if (body.password.length < 8) return c.json({ error: 'Password must be at least 8 characters' }, 400);
  const username = body.username.toLowerCase().trim();
  if (!/^[a-z0-9._-]{2,40}$/.test(username)) {
    return c.json({ error: 'Username can only contain letters, numbers, dots, dashes and underscores' }, 400);
  }
  const existing = await c.env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(username).first();
  if (existing) return c.json({ error: 'That username is already taken' }, 409);
  const role = body.role === 'Admin' ? 'Admin' : 'Member';
  const allowed = role === 'Admin' ? '*' : JSON.stringify(body.allowedScreens ?? []);
  const id = generateId();
  const salt = randomHex(16);
  const hash = await pbkdf2Hex(body.password, salt);
  await c.env.DB.prepare('INSERT INTO users (id, name, username, password_hash, salt, role, allowed_screens) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(id, body.name, username, hash, salt, role, allowed)
    .run();
  const row = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<DbUser>();
  return c.json(publicUser(row!), 201);
});

app.put('/api/users/:id', async (c) => {
  const denied = adminOnly(c);
  if (denied) return denied;
  const id = c.req.param('id');
  const user = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<DbUser>();
  if (!user) return c.json({ error: 'Not found' }, 404);
  const body = await c.req
    .json<{ name?: string; role?: string; allowedScreens?: string[]; password?: string }>()
    .catch(() => ({}) as Record<string, never>);

  const role = body.role ? (body.role === 'Admin' ? 'Admin' : 'Member') : user.role;
  // Don't let the last admin demote themselves into a lockout.
  if (user.role === 'Admin' && role !== 'Admin') {
    const admins = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'Admin'").first<{ n: number }>();
    if ((admins?.n ?? 0) <= 1) return c.json({ error: 'Cannot demote the only admin' }, 400);
  }
  const allowed =
    role === 'Admin' ? '*' : 'allowedScreens' in body ? JSON.stringify(body.allowedScreens ?? []) : user.allowed_screens === '*' ? '[]' : user.allowed_screens;

  let passwordHash = user.password_hash;
  let salt = user.salt;
  if (body.password) {
    if (body.password.length < 8) return c.json({ error: 'Password must be at least 8 characters' }, 400);
    salt = randomHex(16);
    passwordHash = await pbkdf2Hex(body.password, salt);
  }

  await c.env.DB.prepare('UPDATE users SET name = ?, role = ?, allowed_screens = ?, password_hash = ?, salt = ? WHERE id = ?')
    .bind(body.name ?? user.name, role, allowed, passwordHash, salt, id)
    .run();
  const row = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<DbUser>();
  return c.json(publicUser(row!));
});

app.delete('/api/users/:id', async (c) => {
  const denied = adminOnly(c);
  if (denied) return denied;
  const id = c.req.param('id');
  if (id === c.get('user').id) return c.json({ error: "You can't delete your own account" }, 400);
  await c.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

// --- Workspace settings ----------------------------------------------------------
app.get('/api/settings', async (c) => c.json({ transition: await getTransition(c.env.DB) }));

app.put('/api/settings', async (c) => {
  const denied = adminOnly(c);
  if (denied) return denied;
  const body = await c.req.json<{ transition?: string }>().catch(() => ({}) as { transition?: string });
  if (!body.transition || !TRANSITIONS.includes(body.transition)) {
    return c.json({ error: `transition must be one of: ${TRANSITIONS.join(', ')}` }, 400);
  }
  await c.env.DB.prepare("INSERT INTO settings (key, value) VALUES ('transition', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .bind(body.transition)
    .run();
  return c.json({ transition: body.transition });
});

// --- Screens ---------------------------------------------------------------------
app.get('/api/screens', async (c) => {
  const user = c.get('user');
  const { results } = await c.env.DB.prepare('SELECT * FROM screens ORDER BY created_at').all<Record<string, unknown>>();
  const screens = (results ?? []).map(rowToScreen).filter((s) => canControlScreen(user, s.id as string));
  return c.json(screens);
});

app.post('/api/screens', async (c) => {
  const denied = adminOnly(c);
  if (denied) return denied;
  const body = await c.req.json<Record<string, unknown>>();
  if (!body.name) return c.json({ error: 'name required' }, 400);
  const id = generateId();
  await c.env.DB.prepare('INSERT INTO screens (id, name, device_type, orientation, group_id) VALUES (?, ?, ?, ?, ?)')
    .bind(id, body.name, body.deviceType ?? 'Web Player', body.orientation ?? 'landscape', body.groupId ?? null)
    .run();
  const row = await c.env.DB.prepare('SELECT * FROM screens WHERE id = ?').bind(id).first<Record<string, unknown>>();
  return c.json(rowToScreen(row!), 201);
});

app.get('/api/screens/:id', async (c) => {
  const id = c.req.param('id');
  if (!canControlScreen(c.get('user'), id)) return c.json({ error: 'You do not have access to this screen' }, 403);
  const row = await c.env.DB.prepare('SELECT * FROM screens WHERE id = ?').bind(id).first<Record<string, unknown>>();
  if (!row) return c.json({ error: 'Not found' }, 404);
  return c.json(rowToScreen(row));
});

app.put('/api/screens/:id', async (c) => {
  const id = c.req.param('id');
  if (!canControlScreen(c.get('user'), id)) return c.json({ error: 'You do not have access to this screen' }, 403);
  const row = await c.env.DB.prepare('SELECT * FROM screens WHERE id = ?').bind(id).first<Record<string, unknown>>();
  if (!row) return c.json({ error: 'Not found' }, 404);
  const u = await c.req.json<Record<string, unknown>>();
  await c.env.DB.prepare(
    `UPDATE screens SET name = ?, device_type = ?, orientation = ?, group_id = ?, playlist = ?, operating_hours = ?, alert = ?, delivery_mode = ? WHERE id = ?`,
  )
    .bind(
      u.name ?? row.name,
      u.deviceType ?? row.device_type,
      u.orientation ?? row.orientation,
      'groupId' in u ? (u.groupId ?? null) : row.group_id,
      'playlist' in u ? JSON.stringify(u.playlist ?? []) : row.playlist,
      'operatingHours' in u ? (u.operatingHours ? JSON.stringify(u.operatingHours) : null) : row.operating_hours,
      'alert' in u ? (u.alert ? JSON.stringify(u.alert) : null) : row.alert,
      u.deliveryMode === 'download' || u.deliveryMode === 'stream' ? u.deliveryMode : row.delivery_mode || 'stream',
      id,
    )
    .run();
  const updated = await c.env.DB.prepare('SELECT * FROM screens WHERE id = ?').bind(id).first<Record<string, unknown>>();
  return c.json(rowToScreen(updated!));
});

app.delete('/api/screens/:id', async (c) => {
  const id = c.req.param('id');
  if (!canControlScreen(c.get('user'), id)) return c.json({ error: 'You do not have access to this screen' }, 403);
  await c.env.DB.prepare('DELETE FROM screens WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

// --- Groups (admin only to modify — groups control many screens at once) -----------
app.get('/api/groups', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM screen_groups ORDER BY created_at').all<Record<string, unknown>>();
  return c.json((results ?? []).map(rowToGroup));
});

app.post('/api/groups', async (c) => {
  const denied = adminOnly(c);
  if (denied) return denied;
  const body = await c.req.json<Record<string, unknown>>();
  if (!body.name) return c.json({ error: 'name required' }, 400);
  const id = generateId();
  await c.env.DB.prepare('INSERT INTO screen_groups (id, name) VALUES (?, ?)').bind(id, body.name).run();
  return c.json({ id, workspaceId: 'ws-1', name: body.name, playlist: [] }, 201);
});

app.get('/api/groups/:id', async (c) => {
  const row = await c.env.DB.prepare('SELECT * FROM screen_groups WHERE id = ?').bind(c.req.param('id')).first<Record<string, unknown>>();
  if (!row) return c.json({ error: 'Not found' }, 404);
  return c.json(rowToGroup(row));
});

app.put('/api/groups/:id', async (c) => {
  const denied = adminOnly(c);
  if (denied) return denied;
  const id = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT * FROM screen_groups WHERE id = ?').bind(id).first<Record<string, unknown>>();
  if (!row) return c.json({ error: 'Not found' }, 404);
  const u = await c.req.json<Record<string, unknown>>();
  await c.env.DB.prepare('UPDATE screen_groups SET name = ?, playlist = ? WHERE id = ?')
    .bind(u.name ?? row.name, 'playlist' in u ? JSON.stringify(u.playlist ?? []) : row.playlist, id)
    .run();
  const updated = await c.env.DB.prepare('SELECT * FROM screen_groups WHERE id = ?').bind(id).first<Record<string, unknown>>();
  return c.json(rowToGroup(updated!));
});

app.delete('/api/groups/:id', async (c) => {
  const denied = adminOnly(c);
  if (denied) return denied;
  const id = c.req.param('id');
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE screens SET group_id = NULL WHERE group_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM screen_groups WHERE id = ?').bind(id),
  ]);
  return c.json({ ok: true });
});

// --- Content (uploads go to R2, metadata to D1) ------------------------------------
app.get('/api/content', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM content ORDER BY upload_date DESC').all<Record<string, unknown>>();
  return c.json((results ?? []).map(rowToContent));
});

app.post('/api/content', async (c) => {
  const contentType = c.req.header('Content-Type') || '';
  const id = generateId();
  const uploadDate = new Date().toISOString();

  if (contentType.includes('multipart/form-data')) {
    const form = await c.req.formData();
    const file = form.get('file') as unknown as File | string | null;
    if (!file || typeof file === 'string') return c.json({ error: 'file required' }, 400);
    const name = String(form.get('name') || file.name);
    const type = String(form.get('type') || (file.type.startsWith('video/') ? 'video' : 'image'));
    const r2Key = `media/${id}/${sanitizeFilename(file.name)}`;
    await c.env.MEDIA.put(r2Key, file.stream(), {
      httpMetadata: { contentType: file.type || 'application/octet-stream' },
    });
    const durationRaw = form.get('duration');
    const duration = durationRaw ? Number(durationRaw) : null;
    const folderId = form.get('folderId') ? String(form.get('folderId')) : null;
    const orientation = String(form.get('orientation') || 'landscape');
    await c.env.DB.prepare(
      `INSERT INTO content (id, name, type, r2_key, url, size, duration, upload_date, folder_id, orientation)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(id, name, type, r2Key, `/${r2Key}`, file.size, duration, uploadDate, folderId, orientation)
      .run();
  } else {
    // URL-based content (no file upload)
    const body = await c.req.json<Record<string, unknown>>();
    if (!body.name || !body.url) return c.json({ error: 'name and url required' }, 400);
    await c.env.DB.prepare(
      `INSERT INTO content (id, name, type, url, thumbnail, size, duration, upload_date, folder_id, orientation)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        id,
        body.name,
        body.type ?? 'image',
        body.url,
        body.thumbnail ?? null,
        body.size ?? 0,
        body.duration ?? null,
        uploadDate,
        body.folderId ?? null,
        body.orientation ?? 'landscape',
      )
      .run();
  }

  const row = await c.env.DB.prepare('SELECT * FROM content WHERE id = ?').bind(id).first<Record<string, unknown>>();
  return c.json(rowToContent(row!), 201);
});

app.put('/api/content/:id', async (c) => {
  const id = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT * FROM content WHERE id = ?').bind(id).first<Record<string, unknown>>();
  if (!row) return c.json({ error: 'Not found' }, 404);
  const u = await c.req.json<Record<string, unknown>>();
  await c.env.DB.prepare(
    `UPDATE content SET name = ?, duration = ?, folder_id = ?, start_date = ?, expiry_date = ?, orientation = ? WHERE id = ?`,
  )
    .bind(
      u.name ?? row.name,
      'duration' in u ? (u.duration ?? null) : row.duration,
      'folderId' in u ? (u.folderId ?? null) : row.folder_id,
      'startDate' in u ? (u.startDate ?? null) : row.start_date,
      'expiryDate' in u ? (u.expiryDate ?? null) : row.expiry_date,
      u.orientation ?? row.orientation,
      id,
    )
    .run();
  const updated = await c.env.DB.prepare('SELECT * FROM content WHERE id = ?').bind(id).first<Record<string, unknown>>();
  return c.json(rowToContent(updated!));
});

app.post('/api/content/delete', async (c) => {
  const body = await c.req.json<{ ids?: string[] }>().catch(() => ({ ids: [] }));
  const ids = body.ids ?? [];
  if (ids.length === 0) return c.json({ ok: true });
  const placeholders = ids.map(() => '?').join(',');
  const { results } = await c.env.DB.prepare(`SELECT id, r2_key FROM content WHERE id IN (${placeholders})`)
    .bind(...ids)
    .all<{ id: string; r2_key: string | null }>();
  for (const row of results ?? []) {
    if (row.r2_key) await c.env.MEDIA.delete(row.r2_key);
  }
  await c.env.DB.prepare(`DELETE FROM content WHERE id IN (${placeholders})`).bind(...ids).run();
  return c.json({ ok: true });
});

// --- Folders --------------------------------------------------------------------------
app.get('/api/folders', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM folders').all<Record<string, unknown>>();
  return c.json((results ?? []).map((r) => ({ id: r.id, name: r.name, parentId: r.parent_id ?? undefined })));
});

app.post('/api/folders', async (c) => {
  const body = await c.req.json<{ name?: string; parentId?: string }>();
  if (!body.name) return c.json({ error: 'name required' }, 400);
  const id = generateId();
  await c.env.DB.prepare('INSERT INTO folders (id, name, parent_id) VALUES (?, ?, ?)').bind(id, body.name, body.parentId ?? null).run();
  return c.json({ id, name: body.name, parentId: body.parentId }, 201);
});

// --- Websites ---------------------------------------------------------------------------
app.get('/api/websites', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM websites').all<Record<string, unknown>>();
  return c.json(results ?? []);
});

app.post('/api/websites', async (c) => {
  const body = await c.req.json<{ name?: string; url?: string; thumbnail?: string }>();
  if (!body.name || !body.url) return c.json({ error: 'name and url required' }, 400);
  const id = generateId();
  await c.env.DB.prepare('INSERT INTO websites (id, name, url, thumbnail) VALUES (?, ?, ?, ?)')
    .bind(id, body.name, body.url, body.thumbnail ?? null)
    .run();
  return c.json({ id, name: body.name, url: body.url, thumbnail: body.thumbnail }, 201);
});

app.delete('/api/websites/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM websites WHERE id = ?').bind(c.req.param('id')).run();
  return c.json({ ok: true });
});

// --- Reports ---------------------------------------------------------------------------
app.get('/api/reports', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM reports ORDER BY timestamp DESC LIMIT 500').all<Record<string, unknown>>();
  return c.json(
    (results ?? []).map((r) => ({
      id: r.id,
      workspaceId: 'ws-1',
      contentName: r.content_name,
      screenName: r.screen_name,
      timestamp: r.timestamp,
      duration: r.duration,
    })),
  );
});

app.all('/api/*', (c) => c.json({ error: 'Not found' }, 404));

// Everything else falls through to static assets (the React app).
app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
