-- D1 Migration: 0001_initial.sql
-- Run with: npx wrangler d1 migrations apply homehub

-- ── Photo metadata ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS photo_metadata (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  key          TEXT NOT NULL UNIQUE,         -- R2 object key
  album        TEXT NOT NULL DEFAULT 'default',
  filename     TEXT,
  size_bytes   INTEGER,
  content_type TEXT DEFAULT 'image/jpeg',
  thumb_key    TEXT,                         -- R2 key for thumbnail
  thumb_status TEXT DEFAULT 'pending',       -- pending | ready | failed
  uploaded_at  TEXT NOT NULL,               -- ISO 8601
  processed_at TEXT,
  created_at   TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_photos_album ON photo_metadata(album);
CREATE INDEX IF NOT EXISTS idx_photos_uploaded ON photo_metadata(uploaded_at DESC);

-- ── Event log (mirrors system_logs in Supabase for CF-native events) ──
CREATE TABLE IF NOT EXISTS event_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  source     TEXT NOT NULL,   -- 'cron' | 'worker' | 'queue' | 'client'
  service    TEXT NOT NULL,
  status     TEXT NOT NULL,   -- 'ok' | 'error' | 'timeout'
  message    TEXT,
  latency_ms INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_logs_service    ON event_log(service);
CREATE INDEX IF NOT EXISTS idx_logs_created_at ON event_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_logs_status     ON event_log(status);

-- ── Photo history (slideshow play log) ───────────────────────
CREATE TABLE IF NOT EXISTS photo_history (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  photo_key  TEXT NOT NULL,
  played_at  TEXT DEFAULT (datetime('now')),
  device     TEXT   -- optional device identifier
);

CREATE INDEX IF NOT EXISTS idx_history_key     ON photo_history(photo_key);
CREATE INDEX IF NOT EXISTS idx_history_played  ON photo_history(played_at DESC);
