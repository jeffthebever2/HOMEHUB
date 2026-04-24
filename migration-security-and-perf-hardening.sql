-- ============================================================
-- migration-security-and-perf-hardening.sql  (2026-04-24)
--
-- Supabase Performance & Security Advisor cleanup. Applied via the
-- Supabase MCP tool in two migrations:
--   security_and_perf_hardening_v1       — policies + indexes
--   security_and_perf_hardening_v2_initplan — ->> operator placement
--
-- This file is the consolidated, idempotent version safe to re-run
-- against a fresh database or a restored backup.
--
-- Fixes:
--   • 26 × auth_rls_initplan  — wrap auth.jwt()/auth.uid() in
--     (SELECT ...) so Postgres evaluates them once per query
--     instead of once per row.
--   • 10 × unindexed_foreign_keys — add covering btree indexes for
--     every FK the advisor flagged.
--   •  1 × redundant index  — drop idx_user_settings_user_id
--     (the UNIQUE constraint on user_id already provides a btree).
--   •  1 × missing index   — add idx_household_members_email, since
--     every RLS subquery filters by email alone (the composite
--     (household_id,email) UNIQUE can't serve it).
--
-- All RLS policies are semantically identical to the originals;
-- only the evaluation pattern changed.
-- ============================================================

-- ── household_members ───────────────────────────────────────
DROP POLICY IF EXISTS "members_select" ON public.household_members;
CREATE POLICY "members_select" ON public.household_members
  FOR SELECT
  USING (email = ((SELECT auth.jwt()) ->> 'email'));

DROP POLICY IF EXISTS "household_members_admin_update" ON public.household_members;
CREATE POLICY "household_members_admin_update" ON public.household_members
  FOR UPDATE
  USING (household_id IN (
    SELECT hm.household_id FROM public.household_members hm
    WHERE hm.email = ((SELECT auth.jwt()) ->> 'email')
      AND hm.role = 'admin'
  ))
  WITH CHECK (household_id IN (
    SELECT hm.household_id FROM public.household_members hm
    WHERE hm.email = ((SELECT auth.jwt()) ->> 'email')
      AND hm.role = 'admin'
  ));

-- ── households ──────────────────────────────────────────────
DROP POLICY IF EXISTS "household_select" ON public.households;
CREATE POLICY "household_select" ON public.households
  FOR SELECT
  USING (id IN (
    SELECT hm.household_id FROM public.household_members hm
    WHERE hm.email = ((SELECT auth.jwt()) ->> 'email')
  ));

-- ── allowed_emails ──────────────────────────────────────────
DROP POLICY IF EXISTS "allowed_emails_select" ON public.allowed_emails;
CREATE POLICY "allowed_emails_select" ON public.allowed_emails
  FOR SELECT
  USING (household_id IN (
    SELECT hm.household_id FROM public.household_members hm
    WHERE hm.email = ((SELECT auth.jwt()) ->> 'email')
  ));

DROP POLICY IF EXISTS "allowed_emails_admin_insert" ON public.allowed_emails;
CREATE POLICY "allowed_emails_admin_insert" ON public.allowed_emails
  FOR INSERT
  WITH CHECK (household_id IN (
    SELECT hm.household_id FROM public.household_members hm
    WHERE hm.email = ((SELECT auth.jwt()) ->> 'email')
      AND hm.role = 'admin'
  ));

DROP POLICY IF EXISTS "allowed_emails_admin_delete" ON public.allowed_emails;
CREATE POLICY "allowed_emails_admin_delete" ON public.allowed_emails
  FOR DELETE
  USING (household_id IN (
    SELECT hm.household_id FROM public.household_members hm
    WHERE hm.email = ((SELECT auth.jwt()) ->> 'email')
      AND hm.role = 'admin'
  ));

-- ── chores ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "chores_select" ON public.chores;
CREATE POLICY "chores_select" ON public.chores
  FOR SELECT
  USING (household_id IN (
    SELECT hm.household_id FROM public.household_members hm
    WHERE hm.email = ((SELECT auth.jwt()) ->> 'email')
  ));

DROP POLICY IF EXISTS "chores_insert" ON public.chores;
CREATE POLICY "chores_insert" ON public.chores
  FOR INSERT
  WITH CHECK (household_id IN (
    SELECT hm.household_id FROM public.household_members hm
    WHERE hm.email = ((SELECT auth.jwt()) ->> 'email')
  ));

DROP POLICY IF EXISTS "chores_update" ON public.chores;
CREATE POLICY "chores_update" ON public.chores
  FOR UPDATE
  USING (household_id IN (
    SELECT hm.household_id FROM public.household_members hm
    WHERE hm.email = ((SELECT auth.jwt()) ->> 'email')
  ));

DROP POLICY IF EXISTS "chores_delete" ON public.chores;
CREATE POLICY "chores_delete" ON public.chores
  FOR DELETE
  USING (household_id IN (
    SELECT hm.household_id FROM public.household_members hm
    WHERE hm.email = ((SELECT auth.jwt()) ->> 'email')
  ));

-- ── chore_logs ──────────────────────────────────────────────
DROP POLICY IF EXISTS "chore_logs_select" ON public.chore_logs;
CREATE POLICY "chore_logs_select" ON public.chore_logs
  FOR SELECT
  USING (household_id IN (
    SELECT hm.household_id FROM public.household_members hm
    WHERE hm.email = ((SELECT auth.jwt()) ->> 'email')
  ));

DROP POLICY IF EXISTS "chore_logs_insert" ON public.chore_logs;
CREATE POLICY "chore_logs_insert" ON public.chore_logs
  FOR INSERT
  WITH CHECK (household_id IN (
    SELECT hm.household_id FROM public.household_members hm
    WHERE hm.email = ((SELECT auth.jwt()) ->> 'email')
  ));

-- ── grocery_items ───────────────────────────────────────────
DROP POLICY IF EXISTS "grocery_select" ON public.grocery_items;
CREATE POLICY "grocery_select" ON public.grocery_items
  FOR SELECT
  USING (household_id IN (
    SELECT hm.household_id FROM public.household_members hm
    WHERE hm.email = ((SELECT auth.jwt()) ->> 'email')
  ));

DROP POLICY IF EXISTS "grocery_insert" ON public.grocery_items;
CREATE POLICY "grocery_insert" ON public.grocery_items
  FOR INSERT
  WITH CHECK (household_id IN (
    SELECT hm.household_id FROM public.household_members hm
    WHERE hm.email = ((SELECT auth.jwt()) ->> 'email')
  ));

DROP POLICY IF EXISTS "grocery_update" ON public.grocery_items;
CREATE POLICY "grocery_update" ON public.grocery_items
  FOR UPDATE
  USING (household_id IN (
    SELECT hm.household_id FROM public.household_members hm
    WHERE hm.email = ((SELECT auth.jwt()) ->> 'email')
  ));

DROP POLICY IF EXISTS "grocery_delete" ON public.grocery_items;
CREATE POLICY "grocery_delete" ON public.grocery_items
  FOR DELETE
  USING (household_id IN (
    SELECT hm.household_id FROM public.household_members hm
    WHERE hm.email = ((SELECT auth.jwt()) ->> 'email')
  ));

-- ── site_controls ───────────────────────────────────────────
DROP POLICY IF EXISTS "site_controls_select" ON public.site_controls;
CREATE POLICY "site_controls_select" ON public.site_controls
  FOR SELECT
  USING (
    (household_id IN (
      SELECT hm.household_id FROM public.household_members hm
      WHERE hm.email = ((SELECT auth.jwt()) ->> 'email')
    ))
    OR public_read = true
  );

DROP POLICY IF EXISTS "site_controls_insert" ON public.site_controls;
CREATE POLICY "site_controls_insert" ON public.site_controls
  FOR INSERT
  WITH CHECK (household_id IN (
    SELECT hm.household_id FROM public.household_members hm
    WHERE hm.email = ((SELECT auth.jwt()) ->> 'email')
      AND hm.role = 'admin'
  ));

DROP POLICY IF EXISTS "site_controls_update" ON public.site_controls;
CREATE POLICY "site_controls_update" ON public.site_controls
  FOR UPDATE
  USING (household_id IN (
    SELECT hm.household_id FROM public.household_members hm
    WHERE hm.email = ((SELECT auth.jwt()) ->> 'email')
      AND hm.role = 'admin'
  ));

DROP POLICY IF EXISTS "site_controls_delete" ON public.site_controls;
CREATE POLICY "site_controls_delete" ON public.site_controls
  FOR DELETE
  USING (household_id IN (
    SELECT hm.household_id FROM public.household_members hm
    WHERE hm.email = ((SELECT auth.jwt()) ->> 'email')
      AND hm.role = 'admin'
  ));

-- ── push_subscriptions ──────────────────────────────────────
DROP POLICY IF EXISTS "push_sub_self" ON public.push_subscriptions;
CREATE POLICY "push_sub_self" ON public.push_subscriptions
  FOR ALL
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- ── seen_alerts ─────────────────────────────────────────────
DROP POLICY IF EXISTS "seen_alerts_self" ON public.seen_alerts;
CREATE POLICY "seen_alerts_self" ON public.seen_alerts
  FOR ALL
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- ── user_settings ───────────────────────────────────────────
DROP POLICY IF EXISTS "user_settings_self" ON public.user_settings;
CREATE POLICY "user_settings_self" ON public.user_settings
  FOR ALL
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- ── system_logs ─────────────────────────────────────────────
DROP POLICY IF EXISTS "system_logs_select" ON public.system_logs;
CREATE POLICY "system_logs_select" ON public.system_logs
  FOR SELECT
  USING ((SELECT auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "system_logs_insert" ON public.system_logs;
CREATE POLICY "system_logs_insert" ON public.system_logs
  FOR INSERT
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

-- ============================================================
-- FK COVERING INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_allowed_emails_added_by
  ON public.allowed_emails(added_by);

CREATE INDEX IF NOT EXISTS idx_chore_logs_chore_id
  ON public.chore_logs(chore_id);

CREATE INDEX IF NOT EXISTS idx_chore_logs_completed_by
  ON public.chore_logs(completed_by);

CREATE INDEX IF NOT EXISTS idx_chore_logs_household_id_completed_at
  ON public.chore_logs(household_id, completed_at DESC);

CREATE INDEX IF NOT EXISTS idx_chores_assigned_to
  ON public.chores(assigned_to);

CREATE INDEX IF NOT EXISTS idx_chores_created_by
  ON public.chores(created_by);

CREATE INDEX IF NOT EXISTS idx_grocery_items_added_by
  ON public.grocery_items(added_by);

CREATE INDEX IF NOT EXISTS idx_household_members_user_id
  ON public.household_members(user_id);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_household_id
  ON public.push_subscriptions(household_id);

CREATE INDEX IF NOT EXISTS idx_user_settings_household_id
  ON public.user_settings(household_id);

-- Email is the hot path for every RLS subquery.
CREATE INDEX IF NOT EXISTS idx_household_members_email
  ON public.household_members(email);

-- ============================================================
-- DROP REDUNDANT INDEX
-- ============================================================
-- idx_user_settings_user_id duplicates user_settings_user_id_key
-- (both are btree on user_id; UNIQUE constraints already provide
-- a btree index Postgres uses for equality lookups).
DROP INDEX IF EXISTS public.idx_user_settings_user_id;
