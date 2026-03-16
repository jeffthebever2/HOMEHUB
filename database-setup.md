# Database Setup

Run the following SQL in the Supabase SQL Editor (Dashboard → SQL Editor → New Query).

---

## Core tables

```sql
-- Households
CREATE TABLE IF NOT EXISTS households (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  last_chore_reset_date DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Household members (one row per user per household)
CREATE TABLE IF NOT EXISTS household_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT,
  role TEXT DEFAULT 'member',  -- 'admin' or 'member'
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(household_id, user_id)
);

-- Allowed emails (controls sign-up access)
CREATE TABLE IF NOT EXISTS allowed_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- User settings (per-user preferences)
CREATE TABLE IF NOT EXISTS user_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  household_id UUID REFERENCES households(id),
  selected_calendars TEXT[] DEFAULT ARRAY['primary'],
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Chores
CREATE TABLE IF NOT EXISTS chores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  status TEXT DEFAULT 'pending',           -- 'pending', 'done', 'skipped'
  category TEXT DEFAULT 'Daily',           -- 'Daily', 'Monday (Living Room)', etc.
  day_of_week INTEGER,                     -- 0=Sun … 6=Sat, NULL=Daily
  completed_by_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Chore completion logs (never deleted — used for statistics)
CREATE TABLE IF NOT EXISTS chore_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,
  chore_id UUID REFERENCES chores(id),
  chore_title TEXT,
  completed_by TEXT,
  completed_at TIMESTAMPTZ DEFAULT now()
);

-- Grocery list
CREATE TABLE IF NOT EXISTS grocery_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  checked BOOLEAN DEFAULT false,
  requested_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- System logs
CREATE TABLE IF NOT EXISTS system_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID,
  source TEXT,
  service TEXT,
  status TEXT,
  message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Site control (remote banner + maintenance mode for external sites)
CREATE TABLE IF NOT EXISTS site_controls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,
  site_name TEXT NOT NULL,
  base_url TEXT,
  maintenance BOOLEAN DEFAULT false,
  banner_message TEXT,
  banner_severity TEXT DEFAULT 'info',
  disabled_paths TEXT,
  public_read BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(household_id, site_name)
);

-- Photo provider preference
CREATE TABLE IF NOT EXISTS photo_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID REFERENCES households(id) ON DELETE CASCADE UNIQUE,
  provider TEXT DEFAULT 'google',          -- 'google' or 'immich'
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

---

## Incremental migrations

If you already have a partial schema, run these individually:

- `migration-add-chore-columns.sql` — adds `category`, `day_of_week`, `completed_by_name`, `selected_calendars`
- `migration-add-grocery-requested-by.sql` — adds `requested_by` to `grocery_items`
- `migration-add-household-last-chore-reset.sql` — adds `last_chore_reset_date` to `households`
- `migration-site-control.sql` — creates `site_controls` table
- `supabase-migration-photo-provider.sql` — creates `photo_providers` table

---

## RLS (Row Level Security)

Enable RLS on all tables and add a policy that lets authenticated users access
rows belonging to their household. Example for `chores`:

```sql
ALTER TABLE chores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "household members can read chores"
  ON chores FOR SELECT
  USING (
    household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  );
```

Repeat for each table. The service role key (used only by cron functions) bypasses RLS automatically.
