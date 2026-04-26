-- v2.298.0 — Repo back-fill. This migration was originally
-- applied to live as version 20260331140059 (name 'class_resources_magic_items_homebrew') but
-- never committed to the source tree. v2.298 reconciles the
-- ~112-migration gap between live's schema_migrations history
-- and the repo's supabase/migrations/ directory. Statements
-- below are verbatim from supabase_migrations.schema_migrations
-- on the live database.
--
-- This is a no-op on live (already applied at this version)
-- and a clean apply on a fresh DB provisioned from the repo.


-- Class resource tracking (per-character, current uses)
ALTER TABLE characters ADD COLUMN IF NOT EXISTS class_resources jsonb DEFAULT '{}'::jsonb;

-- Multiclassing
ALTER TABLE characters ADD COLUMN IF NOT EXISTS secondary_class text DEFAULT '';
ALTER TABLE characters ADD COLUMN IF NOT EXISTS secondary_level integer DEFAULT 0;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS secondary_subclass text DEFAULT '';

CREATE TABLE IF NOT EXISTS homebrew_spells (
  id uuid DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  level integer DEFAULT 0,
  school text DEFAULT 'Evocation',
  casting_time text DEFAULT '1 action',
  range text DEFAULT 'Self',
  components text DEFAULT 'V, S',
  duration text DEFAULT 'Instantaneous',
  description text DEFAULT '',
  classes text[] DEFAULT '{}',
  concentration boolean DEFAULT false,
  ritual boolean DEFAULT false,
  is_public boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS homebrew_monsters (
  id uuid DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text DEFAULT 'Humanoid',
  cr text DEFAULT '1',
  size text DEFAULT 'Medium',
  hp integer DEFAULT 10,
  ac integer DEFAULT 12,
  speed integer DEFAULT 30,
  str integer DEFAULT 10, dex integer DEFAULT 10, con integer DEFAULT 10,
  int integer DEFAULT 10, wis integer DEFAULT 10, cha integer DEFAULT 10,
  attack_name text DEFAULT 'Strike',
  attack_bonus integer DEFAULT 3,
  attack_damage text DEFAULT '1d6',
  xp integer DEFAULT 200,
  traits text DEFAULT '',
  is_public boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS homebrew_items (
  id uuid DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  item_type text DEFAULT 'wondrous',
  rarity text DEFAULT 'uncommon',
  requires_attunement boolean DEFAULT false,
  description text DEFAULT '',
  weight numeric DEFAULT 0,
  is_public boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE homebrew_spells ENABLE ROW LEVEL SECURITY;
ALTER TABLE homebrew_monsters ENABLE ROW LEVEL SECURITY;
ALTER TABLE homebrew_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own homebrew spells" ON homebrew_spells FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Public homebrew spells readable" ON homebrew_spells FOR SELECT USING (is_public = true OR auth.uid() = user_id);
CREATE POLICY "Users manage own homebrew monsters" ON homebrew_monsters FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Public homebrew monsters readable" ON homebrew_monsters FOR SELECT USING (is_public = true OR auth.uid() = user_id);
CREATE POLICY "Users manage own homebrew items" ON homebrew_items FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Public homebrew items readable" ON homebrew_items FOR SELECT USING (is_public = true OR auth.uid() = user_id);
