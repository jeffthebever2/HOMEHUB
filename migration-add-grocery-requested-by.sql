-- Add requested_by column to grocery_items for family member attribution
-- Safe to run multiple times (IF NOT EXISTS)
ALTER TABLE grocery_items ADD COLUMN IF NOT EXISTS requested_by text;
