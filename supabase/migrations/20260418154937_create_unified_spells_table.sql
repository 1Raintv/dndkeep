-- v2.298.0 — Repo back-fill. This migration was originally
-- applied to live as version 20260418154937 (name 'create_unified_spells_table') but
-- never committed to the source tree. v2.298 reconciles the
-- ~112-migration gap between live's schema_migrations history
-- and the repo's supabase/migrations/ directory. Statements
-- below are verbatim from supabase_migrations.schema_migrations
-- on the live database.
--
-- This is a no-op on live (already applied at this version)
-- and a clean apply on a fresh DB provisioned from the repo.

-- Unified spells table: SRD/UA canonical content + per-user homebrew live in one place.
-- owner_id = NULL means canonical (everyone sees it). owner_id = user means homebrew.
CREATE TABLE public.spells (
  id              text PRIMARY KEY,
  name            text NOT NULL,
  owner_id        uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  source          text NOT NULL DEFAULT 'homebrew' CHECK (source IN ('srd', 'ua', 'homebrew')),
  visibility      text NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'public')),
  level           smallint NOT NULL CHECK (level >= 0 AND level <= 9),
  school          text NOT NULL,
  casting_time    text NOT NULL DEFAULT '1 action',
  "range"         text NOT NULL DEFAULT 'Self',
  components      text NOT NULL DEFAULT 'V, S',
  duration        text NOT NULL DEFAULT 'Instantaneous',
  concentration   boolean NOT NULL DEFAULT false,
  ritual          boolean NOT NULL DEFAULT false,
  classes         text[] NOT NULL DEFAULT '{}',
  description     text NOT NULL DEFAULT '',
  higher_levels   text,
  save_type       text,
  attack_type     text CHECK (attack_type IN ('ranged', 'melee') OR attack_type IS NULL),
  damage_dice     text,
  damage_type     text,
  damage_at_slot_level   jsonb,
  damage_at_char_level   jsonb,
  heal_dice              text,
  heal_at_slot_level     jsonb,
  area_of_effect         jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT homebrew_has_owner CHECK (source != 'homebrew' OR owner_id IS NOT NULL),
  CONSTRAINT canonical_no_owner CHECK (source = 'homebrew' OR owner_id IS NULL)
);

CREATE INDEX spells_class_lookup ON public.spells USING gin (classes);
CREATE INDEX spells_owner ON public.spells (owner_id) WHERE owner_id IS NOT NULL;
CREATE INDEX spells_source ON public.spells (source);

ALTER TABLE public.spells ENABLE ROW LEVEL SECURITY;

CREATE POLICY "spells_read" ON public.spells FOR SELECT USING (
  owner_id IS NULL
  OR owner_id = auth.uid()
  OR (source = 'homebrew' AND visibility = 'public')
);
CREATE POLICY "spells_insert" ON public.spells FOR INSERT WITH CHECK (
  owner_id = auth.uid() AND source = 'homebrew'
);
CREATE POLICY "spells_update" ON public.spells FOR UPDATE USING (
  owner_id = auth.uid()
) WITH CHECK (
  owner_id = auth.uid() AND source = 'homebrew'
);
CREATE POLICY "spells_delete" ON public.spells FOR DELETE USING (
  owner_id = auth.uid()
);

CREATE OR REPLACE FUNCTION update_spells_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER spells_updated_at_trigger
  BEFORE UPDATE ON public.spells
  FOR EACH ROW EXECUTE FUNCTION update_spells_updated_at();

DROP TABLE IF EXISTS public.homebrew_spells;
