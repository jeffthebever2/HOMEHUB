-- Migration: Add Google OAuth refresh token columns to user_settings
--
-- These columns are required for the server-side token refresh flow
-- (/api/token-refresh). Without them, Google access tokens cannot be
-- renewed after the initial 1-hour expiry, forcing re-authentication.
--
-- Safe to run multiple times (IF NOT EXISTS / IF EXISTS guards).

-- 1. Add google_refresh_token column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'user_settings'
      AND column_name  = 'google_refresh_token'
  ) THEN
    ALTER TABLE public.user_settings
      ADD COLUMN google_refresh_token TEXT;
    RAISE NOTICE 'Added google_refresh_token column';
  ELSE
    RAISE NOTICE 'google_refresh_token column already exists — skipping';
  END IF;
END $$;

-- 2. Add google_token_updated_at column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'user_settings'
      AND column_name  = 'google_token_updated_at'
  ) THEN
    ALTER TABLE public.user_settings
      ADD COLUMN google_token_updated_at TIMESTAMPTZ;
    RAISE NOTICE 'Added google_token_updated_at column';
  ELSE
    RAISE NOTICE 'google_token_updated_at column already exists — skipping';
  END IF;
END $$;

-- 3. Ensure household_id column exists (some setups may be missing it)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'user_settings'
      AND column_name  = 'household_id'
  ) THEN
    ALTER TABLE public.user_settings
      ADD COLUMN household_id UUID REFERENCES public.households(id);
    RAISE NOTICE 'Added household_id column';
  ELSE
    RAISE NOTICE 'household_id column already exists — skipping';
  END IF;
END $$;

-- 4. Grant service role access to the new columns (for /api/token-refresh)
GRANT SELECT, UPDATE ON public.user_settings TO service_role;
