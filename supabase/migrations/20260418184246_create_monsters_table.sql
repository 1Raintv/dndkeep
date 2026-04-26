-- v2.298.0 — Repo back-fill. This migration was originally
-- applied to live as version 20260418184246 (name 'create_monsters_table') but
-- never committed to the source tree. v2.298 reconciles the
-- ~112-migration gap between live's schema_migrations history
-- and the repo's supabase/migrations/ directory. Statements
-- below are verbatim from supabase_migrations.schema_migrations
-- on the live database.
--
-- This is a no-op on live (already applied at this version)
-- and a clean apply on a fresh DB provisioned from the repo.

-- v2.24.0 — public.monsters table
-- Mirrors src/types/index.ts MonsterData. Same RLS pattern as public.spells:
-- canonical SRD (owner_id IS NULL) + own homebrew + public homebrew.

CREATE TABLE public.monsters (
  id text PRIMARY KEY,
  name text NOT NULL,
  owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'srd' CHECK (source IN ('srd','ua','homebrew')),
  visibility text NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','public')),
  type text NOT NULL,
  subtype text,
  alignment text,
  cr text NOT NULL,
  xp integer NOT NULL,
  size text NOT NULL CHECK (size IN ('Tiny','Small','Medium','Large','Huge','Gargantuan')),
  hp integer NOT NULL,
  hp_formula text NOT NULL,
  ac integer NOT NULL,
  ac_note text,
  speed integer NOT NULL,
  fly_speed integer,
  swim_speed integer,
  climb_speed integer,
  burrow_speed integer,
  str integer NOT NULL CHECK (str BETWEEN 1 AND 30),
  dex integer NOT NULL CHECK (dex BETWEEN 1 AND 30),
  con integer NOT NULL CHECK (con BETWEEN 1 AND 30),
  "int" integer NOT NULL CHECK ("int" BETWEEN 1 AND 30),
  wis integer NOT NULL CHECK (wis BETWEEN 1 AND 30),
  cha integer NOT NULL CHECK (cha BETWEEN 1 AND 30),
  saving_throws jsonb,
  skills jsonb,
  damage_immunities text[],
  damage_resistances text[],
  damage_vulnerabilities text[],
  condition_immunities text[],
  senses jsonb,
  languages text,
  proficiency_bonus integer,
  traits jsonb,
  actions jsonb,
  reactions jsonb,
  legendary_actions jsonb,
  legendary_resistance_count integer,
  attack_name text,
  attack_bonus integer,
  attack_damage text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT homebrew_has_owner CHECK (source = 'srd' OR owner_id IS NOT NULL),
  CONSTRAINT canonical_no_owner CHECK (source != 'srd' OR owner_id IS NULL)
);

ALTER TABLE public.monsters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "monsters_read" ON public.monsters FOR SELECT USING (
  owner_id IS NULL
  OR owner_id = auth.uid()
  OR (source = 'homebrew' AND visibility = 'public')
);
CREATE POLICY "monsters_insert_own_homebrew" ON public.monsters FOR INSERT WITH CHECK (source = 'homebrew' AND owner_id = auth.uid());
CREATE POLICY "monsters_update_own" ON public.monsters FOR UPDATE USING (owner_id = auth.uid());
CREATE POLICY "monsters_delete_own" ON public.monsters FOR DELETE USING (owner_id = auth.uid());

CREATE INDEX monsters_type_idx   ON public.monsters(type);
CREATE INDEX monsters_cr_idx     ON public.monsters(cr);
CREATE INDEX monsters_source_idx ON public.monsters(source);
CREATE INDEX monsters_owner_idx  ON public.monsters(owner_id) WHERE owner_id IS NOT NULL;

CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER monsters_updated_at_trigger
  BEFORE UPDATE ON public.monsters
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
