-- ============================================================
-- migration-site-control.sql
-- Creates the site_controls table used by the Site Control Center.
-- Run once in your Supabase SQL editor.
-- ============================================================

create table if not exists site_controls (
  id               uuid primary key default gen_random_uuid(),
  household_id     uuid not null references households(id) on delete cascade,
  site_name        text not null default 'main',
  base_url         text,
  maintenance      boolean not null default false,
  banner_message   text,
  banner_severity  text not null default 'info'
                     check (banner_severity in ('info','warning','critical')),
  disabled_paths   text,       -- newline-separated list of paths
  public_read      boolean not null default false,
  updated_at       timestamptz default now(),

  -- Each household can have multiple named site configs
  unique (household_id, site_name)
);

-- Indexes
create index if not exists idx_site_controls_household_id
  on site_controls (household_id);

create index if not exists idx_site_controls_site_name
  on site_controls (site_name);

-- RLS
alter table site_controls enable row level security;

-- Admins in the household can read/write their own site controls
create policy "Admins can manage site_controls"
  on site_controls for all
  using (
    exists (
      select 1 from household_members hm
      where hm.household_id = site_controls.household_id
        and hm.user_id = auth.uid()
        and hm.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from household_members hm
      where hm.household_id = site_controls.household_id
        and hm.user_id = auth.uid()
        and hm.role = 'admin'
    )
  );

-- Optional: allow public reading of rows where public_read = true
create policy "Public can read public site_controls"
  on site_controls for select
  using (public_read = true);
