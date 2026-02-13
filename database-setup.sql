-- ==========================================
-- HOME HUB — Complete Database Setup
-- Run this in Supabase SQL Editor (https://supabase.com → Project → SQL Editor)
-- ==========================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==========================================
-- 1. TABLES
-- ==========================================

CREATE TABLE IF NOT EXISTS households (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS household_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(household_id, email)
);

CREATE TABLE IF NOT EXISTS allowed_emails (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  added_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(household_id, email)
);

CREATE TABLE IF NOT EXISTS user_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  location_name TEXT DEFAULT 'Home',
  location_lat DOUBLE PRECISION DEFAULT 40.029059,
  location_lon DOUBLE PRECISION DEFAULT -82.863462,
  standby_timeout_min INT DEFAULT 10,
  quiet_hours_start TIME DEFAULT '22:00',
  quiet_hours_end TIME DEFAULT '07:00',
  immich_base_url TEXT,
  immich_api_key TEXT,
  immich_album_id TEXT,
  calendar_url TEXT,
  selected_calendars JSONB DEFAULT '["primary"]'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON COLUMN user_settings.selected_calendars IS 'Array of Google Calendar IDs selected by the user (e.g. ["primary", "work@company.com"])';

CREATE TABLE IF NOT EXISTS chores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  recurrence TEXT DEFAULT 'once',
  assigned_to UUID REFERENCES auth.users(id),
  created_by UUID REFERENCES auth.users(id),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'skipped')),
  due_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chore_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chore_id UUID NOT NULL REFERENCES chores(id) ON DELETE CASCADE,
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  completed_by UUID REFERENCES auth.users(id),
  completed_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT
);

CREATE TABLE IF NOT EXISTS seen_alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  alert_id TEXT NOT NULL,
  severity TEXT,
  seen_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, alert_id)
);

CREATE TABLE IF NOT EXISTS system_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source TEXT NOT NULL CHECK (source IN ('client', 'server')),
  service TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ok', 'error', 'timeout')),
  message TEXT,
  latency_ms INT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================
-- 2. ENABLE ROW LEVEL SECURITY
-- ==========================================

ALTER TABLE households ENABLE ROW LEVEL SECURITY;
ALTER TABLE household_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE allowed_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE chores ENABLE ROW LEVEL SECURITY;
ALTER TABLE chore_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE seen_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_logs ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- 3. HELPER FUNCTIONS
-- ==========================================

CREATE OR REPLACE FUNCTION get_my_household_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT hm.household_id
  FROM household_members hm
  WHERE hm.email = (SELECT email FROM auth.users WHERE id = auth.uid())
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION is_allowed_user()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM allowed_emails ae
    WHERE ae.email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );
$$;

-- ==========================================
-- 4. RLS POLICIES
-- ==========================================

-- HOUSEHOLDS
CREATE POLICY "household_select" ON households FOR SELECT
  USING (id = get_my_household_id());

-- HOUSEHOLD_MEMBERS
CREATE POLICY "members_select" ON household_members FOR SELECT
  USING (household_id = get_my_household_id());

-- ALLOWED_EMAILS
CREATE POLICY "allowed_emails_select" ON allowed_emails FOR SELECT
  USING (household_id = get_my_household_id());

CREATE POLICY "allowed_emails_insert" ON allowed_emails FOR INSERT
  WITH CHECK (
    household_id = get_my_household_id()
    AND EXISTS (
      SELECT 1 FROM household_members
      WHERE household_id = get_my_household_id()
        AND email = (SELECT email FROM auth.users WHERE id = auth.uid())
        AND role = 'admin'
    )
  );

CREATE POLICY "allowed_emails_delete" ON allowed_emails FOR DELETE
  USING (
    household_id = get_my_household_id()
    AND EXISTS (
      SELECT 1 FROM household_members
      WHERE household_id = get_my_household_id()
        AND email = (SELECT email FROM auth.users WHERE id = auth.uid())
        AND role = 'admin'
    )
  );

-- USER_SETTINGS
CREATE POLICY "settings_select" ON user_settings FOR SELECT
  USING (user_id = auth.uid() AND is_allowed_user());
CREATE POLICY "settings_insert" ON user_settings FOR INSERT
  WITH CHECK (user_id = auth.uid() AND is_allowed_user());
CREATE POLICY "settings_update" ON user_settings FOR UPDATE
  USING (user_id = auth.uid() AND is_allowed_user());

-- CHORES
CREATE POLICY "chores_select" ON chores FOR SELECT
  USING (household_id = get_my_household_id() AND is_allowed_user());
CREATE POLICY "chores_insert" ON chores FOR INSERT
  WITH CHECK (household_id = get_my_household_id() AND is_allowed_user());
CREATE POLICY "chores_update" ON chores FOR UPDATE
  USING (household_id = get_my_household_id() AND is_allowed_user());
CREATE POLICY "chores_delete" ON chores FOR DELETE
  USING (household_id = get_my_household_id() AND is_allowed_user());

-- CHORE_LOGS
CREATE POLICY "chore_logs_select" ON chore_logs FOR SELECT
  USING (household_id = get_my_household_id() AND is_allowed_user());
CREATE POLICY "chore_logs_insert" ON chore_logs FOR INSERT
  WITH CHECK (household_id = get_my_household_id() AND is_allowed_user());

-- SEEN_ALERTS
CREATE POLICY "seen_alerts_select" ON seen_alerts FOR SELECT
  USING (user_id = auth.uid());
CREATE POLICY "seen_alerts_insert" ON seen_alerts FOR INSERT
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "seen_alerts_delete" ON seen_alerts FOR DELETE
  USING (user_id = auth.uid());

-- SYSTEM_LOGS
CREATE POLICY "system_logs_insert" ON system_logs FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "system_logs_select" ON system_logs FOR SELECT
  USING (is_allowed_user());

-- ==========================================
-- 5. SEED DATA (EDIT BEFORE RUNNING)
-- ==========================================
-- Replace YOUR_EMAIL@gmail.com with your actual Google email.

-- INSERT INTO households (name) VALUES ('My Home');
--
-- INSERT INTO household_members (household_id, email, role)
-- SELECT id, 'YOUR_EMAIL@gmail.com', 'admin'
-- FROM households WHERE name = 'My Home';
--
-- INSERT INTO allowed_emails (household_id, email)
-- SELECT id, 'YOUR_EMAIL@gmail.com'
-- FROM households WHERE name = 'My Home';
