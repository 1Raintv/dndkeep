-- v2.298.0 — Repo back-fill. This migration was originally
-- applied to live as version 20260408171211 (name 'battle_map_full_system') but
-- never committed to the source tree. v2.298 reconciles the
-- ~112-migration gap between live's schema_migrations history
-- and the repo's supabase/migrations/ directory. Statements
-- below are verbatim from supabase_migrations.schema_migrations
-- on the live database.
--
-- This is a no-op on live (already applied at this version)
-- and a clean apply on a fresh DB provisioned from the repo.


CREATE TABLE IF NOT EXISTS token_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  token_key text NOT NULL,
  author_id uuid REFERENCES profiles(id),
  author_name text NOT NULL DEFAULT '',
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dm_npc_roster (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES campaigns(id) ON DELETE SET NULL,
  name text NOT NULL,
  type text NOT NULL DEFAULT 'Humanoid',
  cr text NOT NULL DEFAULT '1',
  size text NOT NULL DEFAULT 'Medium',
  hp integer NOT NULL DEFAULT 10,
  max_hp integer NOT NULL DEFAULT 10,
  ac integer NOT NULL DEFAULT 12,
  speed integer NOT NULL DEFAULT 30,
  str integer NOT NULL DEFAULT 10,
  dex integer NOT NULL DEFAULT 10,
  con integer NOT NULL DEFAULT 10,
  int integer NOT NULL DEFAULT 10,
  wis integer NOT NULL DEFAULT 10,
  cha integer NOT NULL DEFAULT 10,
  attack_name text NOT NULL DEFAULT 'Strike',
  attack_bonus integer NOT NULL DEFAULT 3,
  attack_damage text NOT NULL DEFAULT '1d6',
  xp integer NOT NULL DEFAULT 100,
  description text NOT NULL DEFAULT '',
  traits text NOT NULL DEFAULT '',
  immunities text NOT NULL DEFAULT '',
  image_url text,
  emoji text NOT NULL DEFAULT '👹',
  color text NOT NULL DEFAULT '#ef4444',
  source_monster_id text,
  times_used integer NOT NULL DEFAULT 0,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE battle_maps 
  ADD COLUMN IF NOT EXISTS map_active_for_players boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS background_color text NOT NULL DEFAULT '#0d1117';

ALTER TABLE token_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Campaign members can read token notes"
  ON token_notes FOR SELECT
  USING (
    campaign_id IN (
      SELECT id FROM campaigns WHERE owner_id = auth.uid()
      UNION
      SELECT campaign_id FROM campaign_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Authenticated users can insert token notes"
  ON token_notes FOR INSERT
  WITH CHECK (
    author_id = auth.uid() AND
    campaign_id IN (
      SELECT id FROM campaigns WHERE owner_id = auth.uid()
      UNION
      SELECT campaign_id FROM campaign_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Authors can update their own notes"
  ON token_notes FOR UPDATE
  USING (author_id = auth.uid());

CREATE POLICY "Authors can delete their own notes"
  ON token_notes FOR DELETE
  USING (author_id = auth.uid());

ALTER TABLE dm_npc_roster ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage their roster"
  ON dm_npc_roster FOR ALL
  USING (owner_id = auth.uid());

ALTER PUBLICATION supabase_realtime ADD TABLE token_notes;
ALTER PUBLICATION supabase_realtime ADD TABLE dm_npc_roster;
