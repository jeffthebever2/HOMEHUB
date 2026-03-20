-- D1 Migration: 0002_thumb_columns.sql
-- Add dimensions and color info to photo metadata
ALTER TABLE photo_metadata ADD COLUMN width_px   INTEGER;
ALTER TABLE photo_metadata ADD COLUMN height_px  INTEGER;
ALTER TABLE photo_metadata ADD COLUMN dominant_color TEXT;
