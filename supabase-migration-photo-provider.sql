-- ============================================================
-- Migration: Add photo provider columns to user_settings
-- Run once in Supabase SQL editor (Dashboard → SQL Editor)
-- Safe to run multiple times (all use IF NOT EXISTS / ADD COLUMN IF NOT EXISTS)
-- ============================================================

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS photo_provider             text    DEFAULT 'imgur',
  ADD COLUMN IF NOT EXISTS google_photos_album_id     text,
  ADD COLUMN IF NOT EXISTS google_photos_album_title  text,
  ADD COLUMN IF NOT EXISTS imgur_album_id             text    DEFAULT 'kAG2MS3';

COMMENT ON COLUMN user_settings.photo_provider            IS 'One of: google, imgur, immich, off';
COMMENT ON COLUMN user_settings.google_photos_album_id    IS 'Google Photos album ID for standby slideshow';
COMMENT ON COLUMN user_settings.google_photos_album_title IS 'Display title of selected Google Photos album';
COMMENT ON COLUMN user_settings.imgur_album_id            IS 'Imgur album hash for standby slideshow';

-- Backfill existing rows with defaults
UPDATE user_settings
SET photo_provider  = 'imgur',
    imgur_album_id  = 'kAG2MS3'
WHERE photo_provider IS NULL;
