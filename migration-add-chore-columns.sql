-- ============================================================
-- migration-add-chore-columns.sql
-- Adds columns needed by the chore system (v2).
-- Safe to run multiple times (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
-- Run in Supabase SQL Editor.
-- ============================================================

-- Chore completion tracking columns
ALTER TABLE chores ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending';
ALTER TABLE chores ADD COLUMN IF NOT EXISTS completed_by_name text;
ALTER TABLE chores ADD COLUMN IF NOT EXISTS completer_email text;
ALTER TABLE chores ADD COLUMN IF NOT EXISTS day_of_week integer;
ALTER TABLE chores ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'Daily';
ALTER TABLE chores ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 0;
ALTER TABLE chores ADD COLUMN IF NOT EXISTS description text;

COMMENT ON COLUMN chores.status IS 'pending | done | skipped';
COMMENT ON COLUMN chores.day_of_week IS '0=Sun, 1=Mon, ..., 6=Sat (null for Daily)';
COMMENT ON COLUMN chores.category IS 'Daily, Monday, Tuesday, etc.';
