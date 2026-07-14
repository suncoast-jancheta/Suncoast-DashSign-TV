-- Suncoast DashSign TV — Cloudflare D1 schema
-- The worker auto-creates these tables on first request, so running this file
-- manually is optional. Kept in sync with worker/index.ts (ensureSchema).

CREATE TABLE IF NOT EXISTS screens (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  device_type TEXT NOT NULL DEFAULT 'Web Player',
  orientation TEXT NOT NULL DEFAULT 'landscape',
  group_id TEXT,
  playlist TEXT NOT NULL DEFAULT '[]',
  last_check_in TEXT,
  ip_address TEXT,
  operating_hours TEXT,
  alert TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS screen_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  playlist TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS content (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,             -- 'image' | 'video'
  r2_key TEXT,                    -- set for uploaded files stored in R2
  url TEXT NOT NULL,              -- '/media/...' for uploads, or an absolute URL
  thumbnail TEXT,
  size INTEGER NOT NULL DEFAULT 0,
  duration REAL,
  upload_date TEXT NOT NULL,
  folder_id TEXT,
  start_date TEXT,
  expiry_date TEXT,
  orientation TEXT NOT NULL DEFAULT 'landscape'
);

CREATE TABLE IF NOT EXISTS folders (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  parent_id TEXT
);

CREATE TABLE IF NOT EXISTS websites (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  thumbnail TEXT
);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  content_name TEXT NOT NULL,
  screen_name TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  duration REAL NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_content_folder ON content(folder_id);
CREATE INDEX IF NOT EXISTS idx_screens_group ON screens(group_id);
CREATE INDEX IF NOT EXISTS idx_reports_ts ON reports(timestamp);
