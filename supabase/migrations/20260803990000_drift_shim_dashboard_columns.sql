-- =============================================================
-- v2.638 — LOCAL-REPLAY DRIFT SHIM #2 (no effect on production).
--
-- Objects added to production via the Dashboard SQL editor that never
-- got a migration. Census method: parsed src/types/supabase.ts (types
-- generated FROM production at v2.493) and diffed every typed
-- table.column against the local information_schema after a full
-- migration replay — 1 missing table + 28 missing columns, all shimmed
-- here with types derived from the generated prod types.
--
-- Why it matters locally: PostgREST 400s any explicit-column select
-- naming a missing column (e.g. getProfile lists show_ua_content, so
-- its absence nulls the entire profile and the app treats every local
-- user as unsubscribed).
--
-- `if not exists` throughout: inert wherever the object already exists.
-- =============================================================

-- profiles (v2.365-era UA content flag)
alter table profiles
  add column if not exists show_ua_content boolean not null default false;

-- characters (v2.380 quick-cast favorites)
alter table characters
  add column if not exists pinned_spells text[] not null default '{}';

-- combat_participants (concentration tracking)
alter table combat_participants
  add column if not exists concentration_spell_id text;

-- scene_tokens (creature linkage + DM token lock)
alter table scene_tokens
  add column if not exists creature_id uuid,
  add column if not exists is_locked boolean not null default false;

-- creature_folders (bestiary organization — whole table was dashboard-made)
create table if not exists creature_folders (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references profiles(id) on delete cascade,
  campaign_id      uuid references campaigns(id) on delete cascade,
  parent_folder_id uuid references creature_folders(id) on delete cascade,
  name             text not null,
  sort_index       integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
alter table creature_folders enable row level security;
drop policy if exists "creature_folders: owner manages" on creature_folders;
create policy "creature_folders: owner manages"
  on creature_folders for all using (owner_id = auth.uid());

-- homebrew_monsters (NPC-roster era: folders, portraits, lore fields,
-- liveness/combat flags — 23 columns accreted via dashboard)
alter table homebrew_monsters
  add column if not exists folder_id          uuid references creature_folders(id) on delete set null,
  add column if not exists owner_id           uuid,
  add column if not exists campaign_id        uuid,
  add column if not exists source_monster_id  text,
  add column if not exists image_url          text,
  add column if not exists description        text,
  add column if not exists notes              text,
  add column if not exists role               text,
  add column if not exists race               text,
  add column if not exists location           text,
  add column if not exists faction            text,
  add column if not exists relationship       text,
  add column if not exists status             text,
  add column if not exists last_seen          text,
  add column if not exists max_hp             integer,
  add column if not exists initiative         integer,
  add column if not exists conditions         jsonb,
  add column if not exists save_proficiencies jsonb,
  add column if not exists ability_scores     jsonb,
  add column if not exists visible_to_players boolean not null default false,
  add column if not exists is_alive           boolean not null default true,
  add column if not exists in_combat          boolean not null default false,
  add column if not exists updated_at         timestamptz not null default now();
