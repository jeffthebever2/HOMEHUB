-- ==========================================
-- Migration: Add Automatic Chore Reset Tracking
-- Adds last_chore_reset_date column to households table
-- This enables server-side automatic daily chore resets
-- ==========================================

-- Add column to track the last date chores were reset for this household
ALTER TABLE households 
ADD COLUMN IF NOT EXISTS last_chore_reset_date DATE DEFAULT NULL;

COMMENT ON COLUMN households.last_chore_reset_date IS 
'Tracks the last date (America/New_York timezone) when daily/weekly chores were automatically reset for this household. Used to ensure idempotent cron-based resets.';

-- Add missing columns for enhanced chore functionality (if not already present from other migrations)
ALTER TABLE chores 
ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'Daily',
ADD COLUMN IF NOT EXISTS day_of_week INTEGER;

COMMENT ON COLUMN chores.category IS 'Category of chore: Daily, Weekly, or Monthly';
COMMENT ON COLUMN chores.day_of_week IS 'Day of week for weekly chores (0=Sunday, 6=Saturday)';

-- Create index for faster reset queries
CREATE INDEX IF NOT EXISTS idx_chores_household_status ON chores(household_id, status);
CREATE INDEX IF NOT EXISTS idx_chores_category_dow ON chores(category, day_of_week);
