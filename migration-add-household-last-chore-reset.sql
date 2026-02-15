-- Adds per-household daily reset guard for chores
ALTER TABLE IF EXISTS public.households
  ADD COLUMN IF NOT EXISTS last_chore_reset_date date;
