-- ============================================================
-- migration-add-household-last-chore-reset.sql
-- Adds last_chore_reset_date to households table for idempotent daily resets.
-- Safe to run multiple times.
-- Run in Supabase SQL Editor.
-- ============================================================

ALTER TABLE households ADD COLUMN IF NOT EXISTS last_chore_reset_date date;

COMMENT ON COLUMN households.last_chore_reset_date IS 'Date (YYYY-MM-DD) of last chore reset, used for idempotency';
