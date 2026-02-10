-- ==========================================
-- HOME HUB — Migration: Add missing columns
-- Run this if your database already exists and is missing these columns.
-- Safe to run multiple times (uses IF NOT EXISTS).
-- ==========================================

-- Add missing columns to chores table
ALTER TABLE chores ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'Daily';
ALTER TABLE chores ADD COLUMN IF NOT EXISTS day_of_week INTEGER;
ALTER TABLE chores ADD COLUMN IF NOT EXISTS completed_by_name TEXT;
ALTER TABLE chores ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Add missing column to user_settings table
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS selected_calendars JSONB DEFAULT '["primary"]'::jsonb;

-- Create index on chores for faster dashboard queries
CREATE INDEX IF NOT EXISTS idx_chores_household_status ON chores(household_id, status);
CREATE INDEX IF NOT EXISTS idx_chores_household_category ON chores(household_id, category);
CREATE INDEX IF NOT EXISTS idx_chore_logs_chore_id ON chore_logs(chore_id);

-- Update existing chores that have NULL updated_at to use created_at
UPDATE chores SET updated_at = created_at WHERE updated_at IS NULL;
