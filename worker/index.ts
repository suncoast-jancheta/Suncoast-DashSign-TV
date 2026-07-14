/**
 * Suncoast DashSign TV — Cloudflare Worker API
 *
 * - D1 (binding DB): screens, groups, content metadata, websites, folders, reports
 * - R2 (binding MEDIA): uploaded image/video files, served from /media/*
 * - Static assets (binding ASSETS): the built React admin app + player
 *
 * Auth: single admin password (ADMIN_PASSWORD secret). Login returns an
 * HMAC-signed expiring token. Player endpoints (/api/player/*, /media/*)
 * are public so any TV/browser can display a screen via its link.
 */
import { Hono } from 'hono';

export interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  ASSETS: Fetcher;
  ADMIN_PASSWORD?: string;
  WORKSPACE_NAME?: string;
}

const ONLINE_WINDOW_MS = 90_000; // player checks in every 30s
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Schema bootstrap (runs once per isolate)
// ---------------------------------------------------------------------------
let schemaReady: Promise<void> | null = null;

function ensureSchema(db: D1Database): Promise<void> {
  if (!schemaReady) {
    schemaReady = db
      .batch([
        db.prepare(`CREATE TABLE IF NOT EXISTS screens (
          id TEXT PRIMARY KEY, name TEXT NOT NULL,
          device_type TEXT NOT NULL DEFAULT 'Web Player',
          orientation TEXT NOT NULL DEFAULT 'landscape',
          group_id TEXT, playlist TEXT NOT NULL DEFAULT '[]',
          last_check_in TEXT, ip_address TEXT, operating_hours TEXT, alert TEXT,
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
      ])
      .then(() => undefined)
      .catch((e) => {
        schemaReady = null;
        throw e;
      });
  }
  return schemaReady;
}

// ---------------------------------------------------------------------------
// Auth helpers — HMAC-signed expiring token keyed by the admin password
// ---------------------------------------------------------------------------
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

async function issueToken(secret: string): Promise<string> {
  const exp = Date.now() + TOKEN_TTL_MS;
  return `${exp}.${await hmacHex(secret, `signhub:${exp}`)}`;
}

async function verifyToken(secret: string, token: string): Promise<boolean> {
  const [expStr, sig] = token.split('.');
  if (!expStr || !sig) return false;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Date.now()) return false;
  const expected = await hmacHex(secret, `signhub:${expStr}`);
  return timingSafeEqual(sig, expected);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
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
const app = new Hono<{ Bindings: Env }>();

app.use('*', async (c, next) => {
  await ensureSchema(c.env.DB);
  await next();
});

// --- Media from R2 (public, supports video range requests) -----------------
app.get('/media/*', async (c) => {
  const key = decodeURIComponent(new URL(c.req.url).pathname.replace(/^\//, ''));
  const rangeHeader = c.req.header('Range');

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
  });
});

// --- Auth -------------------------------------------------------------------
app.post('/api/auth/login', async (c) => {
  const secret = c.env.ADMIN_PASSWORD;
  if (!secret) {
    return c.json({ error: 'ADMIN_PASSWORD is not configured. Run: npx wrangler secret put ADMIN_PASSWORD' }, 500);
  }
  const body = await c.req.json<{ password?: string }>().catch(() => ({ password: undefined }));
  if (!body.password || !timingSafeEqual(body.password, secret)) {
    return c.json({ error: 'Incorrect password' }, 401);
  }
  return c.json({ token: await issueToken(secret) });
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

  const [contentRows, websiteRows] = await Promise.all([
    c.env.DB.prepare('SELECT * FROM content').all<Record<string, unknown>>(),
    c.env.DB.prepare('SELECT * FROM websites').all<Record<string, unknown>>(),
  ]);

  return c.json({
    screen,
    content: (contentRows.results ?? []).map(rowToContent),
    websites: websiteRows.results ?? [],
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

// --- Admin auth middleware ----------------------------------------------------
app.use('/api/*', async (c, next) => {
  const path = new URL(c.req.url).pathname;
  if (path === '/api/auth/login' || path.startsWith('/api/player/')) return next();
  const secret = c.env.ADMIN_PASSWORD;
  const auth = c.req.header('Authorization');
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : undefined;
  if (!secret || !token || !(await verifyToken(secret, token))) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  return next();
});

// --- Workspace / user ----------------------------------------------------------
app.get('/api/me', (c) =>
  c.json({
    workspace: { id: 'ws-1', name: c.env.WORKSPACE_NAME || 'Suncoast Signage' },
    user: { id: 'u-1', email: 'admin', role: 'Admin', name: 'Admin' },
  }),
);

// --- Screens ---------------------------------------------------------------------
app.get('/api/screens', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM screens ORDER BY created_at').all<Record<string, unknown>>();
  return c.json((results ?? []).map(rowToScreen));
});

app.post('/api/screens', async (c) => {
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
  const row = await c.env.DB.prepare('SELECT * FROM screens WHERE id = ?').bind(c.req.param('id')).first<Record<string, unknown>>();
  if (!row) return c.json({ error: 'Not found' }, 404);
  return c.json(rowToScreen(row));
});

app.put('/api/screens/:id', async (c) => {
  const id = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT * FROM screens WHERE id = ?').bind(id).first<Record<string, unknown>>();
  if (!row) return c.json({ error: 'Not found' }, 404);
  const u = await c.req.json<Record<string, unknown>>();
  await c.env.DB.prepare(
    `UPDATE screens SET name = ?, device_type = ?, orientation = ?, group_id = ?, playlist = ?, operating_hours = ?, alert = ? WHERE id = ?`,
  )
    .bind(
      u.name ?? row.name,
      u.deviceType ?? row.device_type,
      u.orientation ?? row.orientation,
      'groupId' in u ? (u.groupId ?? null) : row.group_id,
      'playlist' in u ? JSON.stringify(u.playlist ?? []) : row.playlist,
      'operatingHours' in u ? (u.operatingHours ? JSON.stringify(u.operatingHours) : null) : row.operating_hours,
      'alert' in u ? (u.alert ? JSON.stringify(u.alert) : null) : row.alert,
      id,
    )
    .run();
  const updated = await c.env.DB.prepare('SELECT * FROM screens WHERE id = ?').bind(id).first<Record<string, unknown>>();
  return c.json(rowToScreen(updated!));
});

app.delete('/api/screens/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM screens WHERE id = ?').bind(c.req.param('id')).run();
  return c.json({ ok: true });
});

// --- Groups -------------------------------------------------------------------------
app.get('/api/groups', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM screen_groups ORDER BY created_at').all<Record<string, unknown>>();
  return c.json((results ?? []).map(rowToGroup));
});

app.post('/api/groups', async (c) => {
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
