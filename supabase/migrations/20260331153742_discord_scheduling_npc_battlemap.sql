-- v2.298.0 — Repo back-fill. This migration was originally
-- applied to live as version 20260331153742 (name 'discord_scheduling_npc_battlemap') but
-- never committed to the source tree. v2.298 reconciles the
-- ~112-migration gap between live's schema_migrations history
-- and the repo's supabase/migrations/ directory. Statements
-- below are verbatim from supabase_migrations.schema_migrations
-- on the live database.
--
-- This is a no-op on live (already applied at this version)
-- and a clean apply on a fresh DB provisioned from the repo.


CREATE TABLE IF NOT EXISTS discord_integrations (
  id uuid DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
  campaign_id uuid REFERENCES campaigns(id) ON DELETE CASCADE,
  guild_id text NOT NULL,
  guild_name text DEFAULT '',
  channel_id text DEFAULT '',
  webhook_url text DEFAULT '',
  installed_by uuid REFERENCES profiles(id),
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE(campaign_id, guild_id)
);

CREATE TABLE IF NOT EXISTS session_schedules (
  id uuid DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
  campaign_id uuid REFERENCES campaigns(id) ON DELETE CASCADE,
  created_by uuid REFERENCES profiles(id),
  title text DEFAULT 'Next Session',
  description text DEFAULT '',
  proposed_dates jsonb DEFAULT '[]',
  confirmed_date timestamptz,
  location text DEFAULT '',
  deadline timestamptz,
  discord_message_id text,
  discord_channel_id text,
  status text DEFAULT 'polling' CHECK (status IN ('polling','confirmed','cancelled')),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS schedule_availability (
  id uuid DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
  schedule_id uuid REFERENCES session_schedules(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  discord_user_id text DEFAULT '',
  player_name text NOT NULL DEFAULT '',
  available_dates jsonb DEFAULT '[]',
  notes text DEFAULT '',
  responded_at timestamptz DEFAULT now(),
  UNIQUE(schedule_id, user_id)
);

CREATE TABLE IF NOT EXISTS npcs (
  id uuid DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
  campaign_id uuid REFERENCES campaigns(id) ON DELETE CASCADE,
  name text NOT NULL,
  role text DEFAULT '',
  race text DEFAULT '',
  location text DEFAULT '',
  faction text DEFAULT '',
  relationship text DEFAULT 'neutral',
  status text DEFAULT 'alive',
  description text DEFAULT '',
  notes text DEFAULT '',
  last_seen text DEFAULT '',
  avatar_url text,
  is_alive boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS battle_maps (
  id uuid DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
  campaign_id uuid REFERENCES campaigns(id) ON DELETE CASCADE,
  name text DEFAULT 'Battle Map',
  image_url text NOT NULL,
  width integer DEFAULT 800,
  height integer DEFAULT 600,
  tokens jsonb DEFAULT '[]',
  notes text DEFAULT '',
  active boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS session_summaries (
  id uuid DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
  campaign_id uuid REFERENCES campaigns(id) ON DELETE CASCADE,
  title text DEFAULT '',
  summary text NOT NULL,
  highlights jsonb DEFAULT '[]',
  session_date date DEFAULT CURRENT_DATE,
  generated_at timestamptz DEFAULT now()
);

ALTER TABLE discord_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE npcs ENABLE ROW LEVEL SECURITY;
ALTER TABLE battle_maps ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Campaign members manage discord" ON discord_integrations FOR ALL
  USING (campaign_id IN (SELECT id FROM campaigns WHERE owner_id = auth.uid()));
CREATE POLICY "Campaign members read schedules" ON session_schedules FOR SELECT
  USING (campaign_id IN (SELECT campaign_id FROM campaign_members WHERE user_id = auth.uid())
      OR campaign_id IN (SELECT id FROM campaigns WHERE owner_id = auth.uid()));
CREATE POLICY "Campaign members insert schedules" ON session_schedules FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Owners manage schedules" ON session_schedules FOR UPDATE USING (
  campaign_id IN (SELECT id FROM campaigns WHERE owner_id = auth.uid()));
CREATE POLICY "Anyone can respond to schedule" ON schedule_availability FOR ALL
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Campaign members read npcs" ON npcs FOR SELECT
  USING (campaign_id IN (SELECT campaign_id FROM campaign_members WHERE user_id = auth.uid())
      OR campaign_id IN (SELECT id FROM campaigns WHERE owner_id = auth.uid()));
CREATE POLICY "Campaign owners manage npcs" ON npcs FOR ALL
  USING (campaign_id IN (SELECT id FROM campaigns WHERE owner_id = auth.uid()))
  WITH CHECK (campaign_id IN (SELECT id FROM campaigns WHERE owner_id = auth.uid()));
CREATE POLICY "Campaign members read maps" ON battle_maps FOR SELECT
  USING (campaign_id IN (SELECT campaign_id FROM campaign_members WHERE user_id = auth.uid())
      OR campaign_id IN (SELECT id FROM campaigns WHERE owner_id = auth.uid()));
CREATE POLICY "Campaign owners manage maps" ON battle_maps FOR ALL
  USING (campaign_id IN (SELECT id FROM campaigns WHERE owner_id = auth.uid()))
  WITH CHECK (campaign_id IN (SELECT id FROM campaigns WHERE owner_id = auth.uid()));
CREATE POLICY "Campaign members read summaries" ON session_summaries FOR SELECT
  USING (campaign_id IN (SELECT campaign_id FROM campaign_members WHERE user_id = auth.uid())
      OR campaign_id IN (SELECT id FROM campaigns WHERE owner_id = auth.uid()));
CREATE POLICY "Campaign owners manage summaries" ON session_summaries FOR ALL
  USING (campaign_id IN (SELECT id FROM campaigns WHERE owner_id = auth.uid()))
  WITH CHECK (campaign_id IN (SELECT id FROM campaigns WHERE owner_id = auth.uid()));
