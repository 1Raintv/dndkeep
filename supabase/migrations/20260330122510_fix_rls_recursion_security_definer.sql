-- v2.298.0 — Repo back-fill. This migration was originally
-- applied to live as version 20260330122510 (name 'fix_rls_recursion_security_definer') but
-- never committed to the source tree. v2.298 reconciles the
-- ~112-migration gap between live's schema_migrations history
-- and the repo's supabase/migrations/ directory. Statements
-- below are verbatim from supabase_migrations.schema_migrations
-- on the live database.
--
-- This is a no-op on live (already applied at this version)
-- and a clean apply on a fresh DB provisioned from the repo.


-- ================================================================
-- Fix: replace all cross-referencing RLS policies with
-- security definer functions that bypass RLS to break the cycle.
-- ================================================================

-- Helper: campaign IDs this user belongs to (bypasses RLS)
create or replace function auth_user_campaign_ids()
returns setof uuid language sql security definer stable as $$
  select campaign_id from campaign_members where user_id = auth.uid();
$$;

-- Helper: campaign IDs this user owns (bypasses RLS)
create or replace function auth_user_owned_campaign_ids()
returns setof uuid language sql security definer stable as $$
  select id from campaigns where owner_id = auth.uid();
$$;

-- ── campaign_members ─────────────────────────────────────────────
drop policy "campaign_members: DM manages members" on campaign_members;
drop policy "campaign_members: members can view own rows" on campaign_members;

create policy "campaign_members: own row"
  on campaign_members for select
  using (user_id = auth.uid());

create policy "campaign_members: DM full control"
  on campaign_members for all
  using (campaign_id in (select auth_user_owned_campaign_ids()));

-- ── campaigns ────────────────────────────────────────────────────
drop policy "campaigns: members can view" on campaigns;
drop policy "campaigns: owner full control" on campaigns;

create policy "campaigns: owner full control"
  on campaigns for all
  using (owner_id = auth.uid());

create policy "campaigns: members can view"
  on campaigns for select
  using (id in (select auth_user_campaign_ids()));

-- ── characters ───────────────────────────────────────────────────
drop policy "characters: campaign members can view" on characters;

create policy "characters: campaign members can view"
  on characters for select
  using (
    campaign_id is not null and
    campaign_id in (select auth_user_campaign_ids())
  );

-- ── roll_logs ────────────────────────────────────────────────────
drop policy "roll_logs: campaign members can view" on roll_logs;

create policy "roll_logs: campaign members can view"
  on roll_logs for select
  using (
    campaign_id is not null and
    campaign_id in (select auth_user_campaign_ids())
  );

-- ── session_states ───────────────────────────────────────────────
drop policy "session_states: campaign members can view" on session_states;
drop policy "session_states: DM manages" on session_states;

create policy "session_states: campaign members can view"
  on session_states for select
  using (campaign_id in (select auth_user_campaign_ids()));

create policy "session_states: DM manages"
  on session_states for all
  using (campaign_id in (select auth_user_owned_campaign_ids()));
