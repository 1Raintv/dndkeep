-- =============================================================
-- v2.638 — LOCAL-REPLAY DRIFT SHIM (no effect on production).
--
-- Production's session_states table was created by hand in the
-- Supabase Dashboard in the app's earliest era, and schema.sql was
-- retroactively edited at v2.296 to delete it — so a fresh replay of
-- the migration chain (local dev database, `supabase db reset`) hits
-- migrations that reference a table no migration ever created.
--
-- This shim recreates session_states EXACTLY as the original
-- "Initial DNDKeep" schema.sql defined it (recovered from git commit
-- 0949fb3), so the March–April 2026 migrations replay faithfully.
-- The table is then legitimately dropped by the existing
-- 20260426210000_drop_session_states_table.sql — the final state
-- matches production: no table.
--
-- Production already has every later migration applied and never
-- re-runs this chain, so this file is inert there by construction.
-- =============================================================

create table session_states (
  id              uuid primary key default uuid_generate_v4(),
  campaign_id     uuid references campaigns(id) on delete cascade not null unique,
  -- [{ id, name, initiative, currentHp, maxHp, ac, isMonster, conditions }]
  initiative_order jsonb not null default '[]',
  current_turn    integer not null default 0,
  round           integer not null default 1,
  combat_active   boolean not null default false,
  updated_at      timestamptz not null default now()
);

alter table session_states enable row level security;

create policy "session_states: campaign members can view"
  on session_states for select using (
    campaign_id in (select campaign_id from campaign_members where user_id = auth.uid())
  );
create policy "session_states: DM manages"
  on session_states for all using (
    campaign_id in (select id from campaigns where owner_id = auth.uid())
  );

create trigger trg_session_states_updated_at
  before update on session_states for each row execute procedure set_updated_at();
