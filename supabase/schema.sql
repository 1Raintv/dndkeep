-- =============================================================
-- DNDKeep — Supabase Schema
-- Run this in your Supabase SQL editor (Database > SQL Editor)
-- =============================================================

-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- =============================================================
-- TABLES
-- =============================================================

-- Profiles: extends auth.users, one row per authenticated user
create table profiles (
  id                    uuid references auth.users(id) on delete cascade primary key,
  email                 text not null,
  display_name          text,
  subscription_tier     text not null default 'free'
                          check (subscription_tier in ('free', 'pro')),
  stripe_customer_id    text unique,
  stripe_subscription_id text unique,
  subscription_status   text not null default 'inactive',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- Campaigns: Pro-only. Owned by a DM, joined by players.
create table campaigns (
  id          uuid primary key default uuid_generate_v4(),
  owner_id    uuid references profiles(id) on delete cascade not null,
  name        text not null,
  description text not null default '',
  setting     text not null default '',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Characters: core character data. campaign_id is nullable (characters
-- exist independently; assigning to a campaign is optional/Pro).
create table characters (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid references profiles(id) on delete cascade not null,
  campaign_id uuid references campaigns(id) on delete set null,

  -- Identity
  name        text not null,
  species     text not null,
  class_name  text not null,
  subclass    text,
  background  text not null,
  level       integer not null default 1 check (level between 1 and 20),
  experience_points integer not null default 0,
  alignment   text,
  avatar_url  text,

  -- Ability scores (raw values, modifiers computed client-side)
  strength      integer not null default 10 check (strength between 1 and 30),
  dexterity     integer not null default 10 check (dexterity between 1 and 30),
  constitution  integer not null default 10 check (constitution between 1 and 30),
  intelligence  integer not null default 10 check (intelligence between 1 and 30),
  wisdom        integer not null default 10 check (wisdom between 1 and 30),
  charisma      integer not null default 10 check (charisma between 1 and 30),

  -- Hit Points
  max_hp      integer not null default 10,
  current_hp  integer not null default 10,
  temp_hp     integer not null default 0,
  hit_dice_spent integer not null default 0,

  -- Combat
  armor_class     integer not null default 10,
  speed           integer not null default 30,
  initiative_bonus integer not null default 0,

  -- Proficiencies (stored as text arrays of canonical names)
  saving_throw_proficiencies  text[] not null default '{}',
  skill_proficiencies         text[] not null default '{}',
  skill_expertises            text[] not null default '{}',

  -- Spellcasting: { "1": { "total": 4, "used": 1 }, "2": {...} }
  spell_slots   jsonb not null default '{}',
  -- SRD spell ids the character has prepared or knows
  prepared_spells text[] not null default '{}',
  known_spells    text[] not null default '{}',

  -- Inventory: [{ id, name, quantity, weight, description, equipped }]
  inventory jsonb not null default '[]',
  currency  jsonb not null default '{"cp":0,"sp":0,"ep":0,"gp":0,"pp":0}',

  -- Active conditions (canonical condition names)
  active_conditions text[] not null default '{}',

  -- Death saving throws (only relevant when current_hp = 0)
  death_saves_successes integer not null default 0 check (death_saves_successes between 0 and 3),
  death_saves_failures  integer not null default 0 check (death_saves_failures  between 0 and 3),

  -- Narrative
  notes               text not null default '',
  personality_traits  text not null default '',
  ideals              text not null default '',
  bonds               text not null default '',
  flaws               text not null default '',
  features_and_traits text not null default '',

  -- 2024 PHB: ASI source tracking
  -- [{ "ability": "strength", "amount": 2, "source": "background" }]
  ability_score_improvements jsonb not null default '[]',
  ability_score_method text not null default 'standard_array'
    check (ability_score_method in ('standard_array', 'point_buy', 'manual', 'dice_roll')),

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Campaign members: tracks who belongs to which campaign and their role
create table campaign_members (
  id          uuid primary key default uuid_generate_v4(),
  campaign_id uuid references campaigns(id) on delete cascade not null,
  user_id     uuid references profiles(id) on delete cascade not null,
  role        text not null default 'player' check (role in ('dm', 'player')),
  joined_at   timestamptz not null default now(),
  unique (campaign_id, user_id)
);

-- Roll log: persistent per-user (optionally per-character/campaign)
create table roll_logs (
  id                 uuid primary key default uuid_generate_v4(),
  user_id            uuid references profiles(id) on delete cascade not null,
  character_id       uuid references characters(id) on delete set null,
  campaign_id        uuid references campaigns(id) on delete set null,
  label              text not null,
  dice_expression    text not null,
  individual_results integer[] not null,
  total              integer not null,
  rolled_at          timestamptz not null default now()
);

-- Session state: real-time combat tracker per campaign (Pro)
-- One row per campaign, upserted when combat starts
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

-- =============================================================
-- ROW LEVEL SECURITY
-- =============================================================

alter table profiles        enable row level security;
alter table campaigns       enable row level security;
alter table characters      enable row level security;
alter table campaign_members enable row level security;
alter table roll_logs       enable row level security;
alter table session_states  enable row level security;

-- profiles
create policy "profiles: own row select"
  on profiles for select using (auth.uid() = id);
create policy "profiles: own row update"
  on profiles for update using (auth.uid() = id);

-- characters
create policy "characters: own CRUD"
  on characters for all using (auth.uid() = user_id);
create policy "characters: campaign members can view"
  on characters for select using (
    campaign_id is not null and
    campaign_id in (
      select campaign_id from campaign_members where user_id = auth.uid()
    )
  );

-- campaigns
create policy "campaigns: owner full control"
  on campaigns for all using (auth.uid() = owner_id);
create policy "campaigns: members can view"
  on campaigns for select using (
    id in (select campaign_id from campaign_members where user_id = auth.uid())
  );

-- campaign_members
create policy "campaign_members: members can view own campaign"
  on campaign_members for select using (
    campaign_id in (select campaign_id from campaign_members where user_id = auth.uid())
  );
create policy "campaign_members: DM manages members"
  on campaign_members for all using (
    campaign_id in (select id from campaigns where owner_id = auth.uid())
  );

-- roll_logs
create policy "roll_logs: own CRUD"
  on roll_logs for all using (auth.uid() = user_id);
create policy "roll_logs: campaign members can view"
  on roll_logs for select using (
    campaign_id is not null and
    campaign_id in (select campaign_id from campaign_members where user_id = auth.uid())
  );

-- session_states
create policy "session_states: campaign members can view"
  on session_states for select using (
    campaign_id in (select campaign_id from campaign_members where user_id = auth.uid())
  );
create policy "session_states: DM manages"
  on session_states for all using (
    campaign_id in (select id from campaigns where owner_id = auth.uid())
  );

-- =============================================================
-- FUNCTIONS & TRIGGERS
-- =============================================================

-- Auto-create profile on signup
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- Enforce Free tier: max 1 character
create or replace function enforce_character_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_tier      text;
  v_count     integer;
begin
  select subscription_tier into v_tier from profiles where id = new.user_id;
  if v_tier = 'free' then
    select count(*) into v_count from characters where user_id = new.user_id;
    if v_count >= 1 then
      raise exception 'FREE_TIER_LIMIT: Free accounts are limited to 1 character. Upgrade to Pro for unlimited characters.';
    end if;
  end if;
  return new;
end;
$$;

create trigger check_character_limit
  before insert on characters
  for each row execute procedure enforce_character_limit();

-- Enforce Pro gate: campaigns require Pro subscription
create or replace function enforce_campaign_pro_gate()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_tier text;
begin
  select subscription_tier into v_tier from profiles where id = new.owner_id;
  if v_tier != 'pro' then
    raise exception 'PRO_REQUIRED: Campaign management requires a Pro subscription.';
  end if;
  return new;
end;
$$;

create trigger check_campaign_pro_gate
  before insert on campaigns
  for each row execute procedure enforce_campaign_pro_gate();

-- Shared updated_at setter
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_characters_updated_at
  before update on characters for each row execute procedure set_updated_at();
create trigger trg_campaigns_updated_at
  before update on campaigns for each row execute procedure set_updated_at();
create trigger trg_profiles_updated_at
  before update on profiles for each row execute procedure set_updated_at();
create trigger trg_session_states_updated_at
  before update on session_states for each row execute procedure set_updated_at();

-- =============================================================
-- REALTIME
-- Enable real-time on tables used for live sync (Pro combat)
-- =============================================================
-- Run these in Supabase Dashboard > Database > Replication
-- or via the CLI after applying the schema above.
--
-- alter publication supabase_realtime add table session_states;
-- alter publication supabase_realtime add table characters;
-- alter publication supabase_realtime add table roll_logs;
