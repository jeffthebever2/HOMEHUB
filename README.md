-- ==========================================
-- MIGRATION: Add missing chore columns
-- Run this in Supabase SQL Editor
-- (Dashboard → SQL Editor → New Query → Paste → Run)
-- ==========================================

-- Add category column (e.g. "Daily", "Monday (Living Room)", etc.)
ALTER TABLE chores ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'Daily';

-- Add day_of_week column (0=Sunday, 1=Monday ... 6=Saturday, NULL=Daily)
ALTER TABLE chores ADD COLUMN IF NOT EXISTS day_of_week INTEGER;

-- Add completed_by_name column (stores the family member's name who completed it)
ALTER TABLE chores ADD COLUMN IF NOT EXISTS completed_by_name TEXT;

-- Add selected_calendars to user_settings (for multi-calendar selection)
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS selected_calendars TEXT[] DEFAULT ARRAY['primary'];

-- Verify: check that columns were added
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'chores' 
  AND column_name IN ('category', 'day_of_week', 'completed_by_name')
ORDER BY column_name;
